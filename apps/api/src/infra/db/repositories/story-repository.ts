import type {
    AgencyRecord,
    IdolRecord,
    IdolWithAgencyRecord,
    NewStoryInput,
    StoryRecord,
    StoryRepository,
    UpdateStoryInput
} from '@/ports/repositories';
import type { ManagedSqlDatabase, SqlSchemaStrategy } from '@/infra/db/sql/database';
import { executeSql, queryAll, queryOne, sqlStatement } from '@/infra/db/sql/query';

const STORY_TABLES = new Map([
    ['765', '765_stories'], ['876', '876_stories'], ['cg', 'cg_stories'],
    ['ml', 'ml_stories'], ['sidem', 'sidem_stories'], ['sc', 'sc_stories'],
    ['gk', 'gk_stories']
]);

function storyTable(code: string): string {
    const table = STORY_TABLES.get(code.toLowerCase());
    if (!table) throw new Error('Unsupported agency code');
    return `"${table}"`;
}

export class SqlStoryRepository implements StoryRepository {
    private initialized?: Promise<void>;

    constructor(
        private readonly database: ManagedSqlDatabase,
        private readonly schema: SqlSchemaStrategy
    ) {}

    initialize(): Promise<void> {
        this.initialized ??= this.schema.initializeStory(this.database);
        return this.initialized;
    }

    close(): Promise<void> {
        return this.database.close();
    }

    async listThemeColors(): Promise<Record<string, string>> {
        const rows = await queryAll<{ name: string; color: string }>(this.database,
            'SELECT name, color FROM theme_colors'
        );
        return Object.fromEntries(rows.map((row) => [row.name, row.color]));
    }

    listAgencies(): Promise<AgencyRecord[]> {
        return queryAll(this.database, 'SELECT id, code, name_cn, color FROM agencies ORDER BY id');
    }

    listIdolsWithAgencies(): Promise<IdolWithAgencyRecord[]> {
        return queryAll(this.database,
            `SELECT i.id, i.agency_id, i.name_cn, i.folder_name, i.color,
                    a.code AS agency_code, a.name_cn AS agency_name, a.color AS agency_color
             FROM idols i JOIN agencies a ON a.id=i.agency_id
             ORDER BY a.id, i.id`
        );
    }

    findAgencyByName(name: string): Promise<AgencyRecord | null> {
        return queryOne(this.database,
            'SELECT id, code, name_cn, color FROM agencies WHERE name_cn=?',
            [name]
        );
    }

    findAgencyByCode(code: string): Promise<AgencyRecord | null> {
        return queryOne(this.database,
            'SELECT id, code, name_cn, color FROM agencies WHERE code=?',
            [code]
        );
    }

    findIdolByAgencyAndName(agencyId: number, idolName: string): Promise<IdolRecord | null> {
        return queryOne(this.database,
            `SELECT id, agency_id, name_cn, folder_name, color
             FROM idols WHERE agency_id=? AND name_cn=?`,
            [agencyId, idolName]
        );
    }

    listStories(agencyCode: string, idolId: number): Promise<StoryRecord[]> {
        return queryAll(this.database,
            `SELECT id, idol_id, category, card_name, up_name, video_title, url, subtitle, image_file
             FROM ${storyTable(agencyCode)} WHERE idol_id=? ORDER BY id`,
            [idolId]
        );
    }

    async sampleStory(
        agencyCode: string,
        categories: readonly string[]
    ): Promise<(StoryRecord & { idol_name: string; agency_name: string }) | null> {
        if (!categories.length) return null;
        const agency = await this.findAgencyByCode(agencyCode);
        if (!agency) return null;
        const placeholders = categories.map(() => '?').join(',');
        return queryOne(this.database,
            `SELECT s.id, s.idol_id, s.category, s.card_name, s.up_name,
                    s.video_title, s.url, s.subtitle, s.image_file,
                    i.name_cn AS idol_name, ? AS agency_name
             FROM ${storyTable(agencyCode)} s
             JOIN idols i ON i.id=s.idol_id
             WHERE s.category IN (${placeholders}) AND s.image_file IS NOT NULL
             ORDER BY RANDOM() LIMIT 1`,
            [agency.name_cn, ...categories]
        );
    }

    async insertStoryReturningId(input: NewStoryInput): Promise<number> {
        const result = await queryOne<{ id: number }>(this.database,
            `INSERT INTO ${storyTable(input.agencyCode)}
             (idol_id, category, card_name, up_name, video_title, url, subtitle, image_file)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
            [input.idolId, input.category, input.cardName, input.upName, input.videoTitle,
                input.url, input.subtitle, input.imageFile]
        );
        if (!result) throw new Error('Story insert did not return an ID');
        return result.id;
    }

    async setStoryImage(agencyCode: string, id: number, imageFile: string): Promise<void> {
        await executeSql(this.database,
            `UPDATE ${storyTable(agencyCode)} SET image_file=? WHERE id=?`,
            [imageFile, id]
        );
    }

    findFirstStoryByCard(
        agencyCode: string,
        idolId: number,
        category: string,
        cardName: string
    ): Promise<StoryRecord | null> {
        return queryOne(this.database,
            `SELECT id, idol_id, category, card_name, up_name, video_title, url, subtitle, image_file
             FROM ${storyTable(agencyCode)}
             WHERE idol_id=? AND category=? AND card_name=? ORDER BY id LIMIT 1`,
            [idolId, category, cardName]
        );
    }

    async updateStory(input: UpdateStoryInput): Promise<void> {
        await executeSql(this.database,
            `UPDATE ${storyTable(input.agencyCode)}
             SET category=?, card_name=?, up_name=?, video_title=?, url=?, subtitle=?, image_file=?
             WHERE id=? AND idol_id=?`,
            [input.category, input.cardName, input.upName, input.videoTitle, input.url,
                input.subtitle, input.imageFile, input.id, input.idolId]
        );
    }

    async updateStoryAndRenameGroup(input: {
        story: UpdateStoryInput;
        rename?: {
            oldCategory: string;
            oldCardName: string;
            category: string;
            cardName: string;
            subtitle: string;
        };
    }): Promise<void> {
        const statements = [
            sqlStatement(this.database,
                `UPDATE ${storyTable(input.story.agencyCode)}
                 SET category=?, card_name=?, up_name=?, video_title=?, url=?, subtitle=?, image_file=?
                 WHERE id=? AND idol_id=?`,
                [input.story.category, input.story.cardName, input.story.upName,
                    input.story.videoTitle, input.story.url, input.story.subtitle,
                    input.story.imageFile, input.story.id, input.story.idolId]
            )
        ];
        if (input.rename) {
            statements.push(sqlStatement(this.database,
                `UPDATE ${storyTable(input.story.agencyCode)}
                 SET category=?, card_name=?, subtitle=?
                 WHERE idol_id=? AND category=? AND card_name=? AND id<>?`,
                [input.rename.category, input.rename.cardName, input.rename.subtitle,
                    input.story.idolId, input.rename.oldCategory, input.rename.oldCardName,
                    input.story.id]
            ));
        }
        await this.database.batch(statements);
    }

    async renameStoryGroup(input: {
        agencyCode: string;
        idolId: number;
        oldCategory: string;
        oldCardName: string;
        category: string;
        cardName: string;
        subtitle: string;
        excludeId: number;
    }): Promise<void> {
        await executeSql(this.database,
            `UPDATE ${storyTable(input.agencyCode)}
             SET category=?, card_name=?, subtitle=?
             WHERE idol_id=? AND category=? AND card_name=? AND id<>?`,
            [input.category, input.cardName, input.subtitle, input.idolId,
                input.oldCategory, input.oldCardName, input.excludeId]
        );
    }

    listStoryGroupForDelete(
        agencyCode: string,
        idolId: number,
        category: string,
        cardName: string
    ): Promise<StoryRecord[]> {
        return queryAll(this.database,
            `SELECT id, idol_id, category, card_name, up_name, video_title, url, subtitle, image_file
             FROM ${storyTable(agencyCode)} WHERE idol_id=? AND category=? AND card_name=?`,
            [idolId, category, cardName]
        );
    }

    async deleteStoryGroup(
        agencyCode: string,
        idolId: number,
        category: string,
        cardName: string
    ): Promise<void> {
        await executeSql(this.database,
            `DELETE FROM ${storyTable(agencyCode)} WHERE idol_id=? AND category=? AND card_name=?`,
            [idolId, category, cardName]
        );
    }

    listCategoryImages(
        agencyCode: string,
        idolId: number,
        category: string
    ): Promise<Array<{ image_file: string | null }>> {
        return queryAll(this.database,
            `SELECT image_file FROM ${storyTable(agencyCode)} WHERE idol_id=? AND category=?`,
            [idolId, category]
        );
    }

    async deleteCategory(agencyCode: string, idolId: number, category: string): Promise<void> {
        await executeSql(this.database,
            `DELETE FROM ${storyTable(agencyCode)} WHERE idol_id=? AND category=?`,
            [idolId, category]
        );
    }
}

export { SqlStoryRepository as SqliteStoryRepository };
