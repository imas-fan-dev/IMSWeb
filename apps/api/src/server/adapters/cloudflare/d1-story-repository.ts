import type {
    AgencyRecord,
    IdolRecord,
    IdolWithAgencyRecord,
    NewStoryInput,
    StoryRecord,
    StoryRepository,
    UpdateStoryInput
} from '@/ports/story-repository';

const SUPPORTED_CODES = new Set(['765', '876', 'cg', 'ml', 'sidem', 'sc', 'gk']);

function sourceTable(code: string): string {
    const normalized = code.toLowerCase();
    if (!SUPPORTED_CODES.has(normalized)) throw new Error('Unsupported agency code');
    return `${normalized}_stories`;
}

function secureSourceId(): number {
    const value = new Uint32Array(1);
    crypto.getRandomValues(value);
    return value[0] || 1;
}

const STORY_SELECT = `
    SELECT l.id AS id, c.idol_id, c.category, c.card_name,
           l.up_name, l.video_title, l.url, c.subtitle, c.image_file
    FROM story_cards c JOIN story_links l ON l.card_id=c.id`;

export class D1StoryRepository implements StoryRepository {
    constructor(private readonly database: D1Database) {}

    initialize(): Promise<void> {
        return Promise.resolve();
    }

    close(): Promise<void> {
        return Promise.resolve();
    }

    async listThemeColors(): Promise<Record<string, string>> {
        const result = await this.database.prepare('SELECT name, color FROM theme_colors')
            .all<{ name: string; color: string }>();
        return Object.fromEntries(result.results.map((row) => [row.name, row.color]));
    }

    async listAgencies(): Promise<AgencyRecord[]> {
        return (await this.database.prepare(
            'SELECT id, code, name_cn, color FROM agencies ORDER BY id'
        ).all<AgencyRecord>()).results;
    }

    async listIdolsWithAgencies(): Promise<IdolWithAgencyRecord[]> {
        return (await this.database.prepare(
            `SELECT i.id, i.agency_id, i.name_cn, i.folder_name, i.color,
                    a.code AS agency_code, a.name_cn AS agency_name, a.color AS agency_color
             FROM idols i JOIN agencies a ON a.id=i.agency_id ORDER BY a.id, i.id`
        ).all<IdolWithAgencyRecord>()).results;
    }

    findAgencyByName(name: string): Promise<AgencyRecord | null> {
        return this.database.prepare(
            'SELECT id, code, name_cn, color FROM agencies WHERE name_cn=?'
        ).bind(name).first<AgencyRecord>();
    }

    findAgencyByCode(code: string): Promise<AgencyRecord | null> {
        return this.database.prepare(
            'SELECT id, code, name_cn, color FROM agencies WHERE code=?'
        ).bind(code).first<AgencyRecord>();
    }

    findIdolByAgencyAndName(agencyId: number, idolName: string): Promise<IdolRecord | null> {
        return this.database.prepare(
            'SELECT id, agency_id, name_cn, folder_name, color FROM idols WHERE agency_id=? AND name_cn=?'
        ).bind(agencyId, idolName).first<IdolRecord>();
    }

    async listStories(agencyCode: string, idolId: number): Promise<StoryRecord[]> {
        const table = sourceTable(agencyCode);
        return (await this.database.prepare(
            `${STORY_SELECT} WHERE c.idol_id=? AND c.source_table=? ORDER BY l.id`
        ).bind(idolId, table).all<StoryRecord>()).results;
    }

    async sampleStory(
        agencyCode: string,
        categories: readonly string[]
    ): Promise<(StoryRecord & { idol_name: string; agency_name: string }) | null> {
        const table = sourceTable(agencyCode);
        if (!categories.length) return null;
        const placeholders = categories.map(() => '?').join(',');
        return this.database.prepare(
            `SELECT l.id AS id, c.idol_id, c.category, c.card_name,
                    l.up_name, l.video_title, l.url, c.subtitle, c.image_file,
                    i.name_cn AS idol_name, a.name_cn AS agency_name
             FROM story_cards c
             JOIN story_links l ON l.card_id=c.id
             JOIN idols i ON i.id=c.idol_id
             JOIN agencies a ON a.id=i.agency_id
             WHERE c.source_table=? AND c.category IN (${placeholders})
               AND c.image_file IS NOT NULL
             ORDER BY RANDOM() LIMIT 1`
        ).bind(table, ...categories).first<StoryRecord & { idol_name: string; agency_name: string }>();
    }

    async insertStoryReturningId(input: NewStoryInput): Promise<number> {
        const table = sourceTable(input.agencyCode);
        let sourceId = secureSourceId();
        while (await this.database.prepare(
            'SELECT 1 FROM story_cards WHERE source_table=? AND source_id=?'
        ).bind(table, sourceId).first<number>('1')) sourceId = secureSourceId();
        await this.database.batch([
            this.database.prepare(
                `INSERT INTO story_cards
                    (idol_id, category, card_name, subtitle, image_file, source_table, source_id)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`
            ).bind(input.idolId, input.category, input.cardName, input.subtitle,
                input.imageFile, table, sourceId),
            this.database.prepare(
                `INSERT INTO story_links
                    (card_id, up_name, video_title, url, source_table, source_id, source_link_index)
                 SELECT id, ?, ?, ?, ?, ?, 0 FROM story_cards
                 WHERE source_table=? AND source_id=?`
            ).bind(input.upName, input.videoTitle, input.url, table, sourceId, table, sourceId)
        ]);
        return await this.database.prepare(
            'SELECT id FROM story_links WHERE source_table=? AND source_id=? AND source_link_index=0'
        ).bind(table, sourceId).first<number>('id') ?? 0;
    }

    async setStoryImage(agencyCode: string, id: number, imageFile: string): Promise<void> {
        const table = sourceTable(agencyCode);
        await this.database.prepare(
            `UPDATE story_cards SET image_file=?, updated_at=CURRENT_TIMESTAMP
             WHERE source_table=? AND id=(SELECT card_id FROM story_links WHERE id=?)`
        ).bind(imageFile, table, id).run();
    }

    findFirstStoryByCard(
        agencyCode: string,
        idolId: number,
        category: string,
        cardName: string
    ): Promise<StoryRecord | null> {
        return this.database.prepare(
            `${STORY_SELECT}
             WHERE c.source_table=? AND c.idol_id=? AND c.category=? AND c.card_name=?
             ORDER BY l.id LIMIT 1`
        ).bind(sourceTable(agencyCode), idolId, category, cardName).first<StoryRecord>();
    }

    async updateStory(input: UpdateStoryInput): Promise<void> {
        const table = sourceTable(input.agencyCode);
        await this.database.batch([
            this.database.prepare(
                `UPDATE story_links SET up_name=?, video_title=?, url=?
                 WHERE id=? AND source_table=?`
            ).bind(input.upName, input.videoTitle, input.url, input.id, table),
            this.database.prepare(
                `UPDATE story_cards
                 SET category=?, card_name=?, subtitle=?, image_file=?, updated_at=CURRENT_TIMESTAMP
                 WHERE id=(SELECT card_id FROM story_links WHERE id=? AND source_table=?)
                   AND idol_id=?`
            ).bind(input.category, input.cardName, input.subtitle, input.imageFile,
                input.id, table, input.idolId)
        ]);
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
        const table = sourceTable(input.story.agencyCode);
        const statements = [
            this.database.prepare(
                'UPDATE story_links SET up_name=?, video_title=?, url=? WHERE id=? AND source_table=?'
            ).bind(input.story.upName, input.story.videoTitle, input.story.url, input.story.id, table),
            this.database.prepare(
                `UPDATE story_cards
                 SET category=?, card_name=?, subtitle=?, image_file=?, updated_at=CURRENT_TIMESTAMP
                 WHERE id=(SELECT card_id FROM story_links WHERE id=? AND source_table=?)
                   AND idol_id=?`
            ).bind(input.story.category, input.story.cardName, input.story.subtitle,
                input.story.imageFile, input.story.id, table, input.story.idolId)
        ];
        if (input.rename) {
            statements.push(this.database.prepare(
                `UPDATE story_cards
                 SET category=?, card_name=?, subtitle=?, updated_at=CURRENT_TIMESTAMP
                 WHERE source_table=? AND idol_id=? AND category=? AND card_name=?
                   AND id<>(SELECT card_id FROM story_links WHERE id=?)`
            ).bind(input.rename.category, input.rename.cardName, input.rename.subtitle,
                table, input.story.idolId, input.rename.oldCategory,
                input.rename.oldCardName, input.story.id));
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
        await this.database.prepare(
            `UPDATE story_cards SET category=?, card_name=?, subtitle=?, updated_at=CURRENT_TIMESTAMP
             WHERE source_table=? AND idol_id=? AND category=? AND card_name=?
               AND id<>(SELECT card_id FROM story_links WHERE id=?)`
        ).bind(input.category, input.cardName, input.subtitle, sourceTable(input.agencyCode),
            input.idolId, input.oldCategory, input.oldCardName, input.excludeId).run();
    }

    async listStoryGroupForDelete(
        agencyCode: string,
        idolId: number,
        category: string,
        cardName: string
    ): Promise<StoryRecord[]> {
        return (await this.database.prepare(
            `${STORY_SELECT}
             WHERE c.source_table=? AND c.idol_id=? AND c.category=? AND c.card_name=?`
        ).bind(sourceTable(agencyCode), idolId, category, cardName).all<StoryRecord>()).results;
    }

    async deleteStoryGroup(
        agencyCode: string,
        idolId: number,
        category: string,
        cardName: string
    ): Promise<void> {
        await this.database.prepare(
            'DELETE FROM story_cards WHERE source_table=? AND idol_id=? AND category=? AND card_name=?'
        ).bind(sourceTable(agencyCode), idolId, category, cardName).run();
    }

    async listCategoryImages(
        agencyCode: string,
        idolId: number,
        category: string
    ): Promise<Array<{ image_file: string | null }>> {
        return (await this.database.prepare(
            'SELECT image_file FROM story_cards WHERE source_table=? AND idol_id=? AND category=?'
        ).bind(sourceTable(agencyCode), idolId, category).all<{ image_file: string | null }>()).results;
    }

    async deleteCategory(agencyCode: string, idolId: number, category: string): Promise<void> {
        await this.database.prepare(
            'DELETE FROM story_cards WHERE source_table=? AND idol_id=? AND category=?'
        ).bind(sourceTable(agencyCode), idolId, category).run();
    }
}
