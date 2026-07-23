import type {
    AgencyRecord,
    IdolRecord,
    IdolWithAgencyRecord,
    NewStoryInput,
    StoryRecord,
    StoryRepository,
    UpdateStoryInput
} from '@/ports/story-repository';
import { SqliteConnection } from '@/adapters/node/sqlite-connection';

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

export class SqliteStoryRepository implements StoryRepository {
    private initialized?: Promise<void>;

    constructor(private readonly connection: SqliteConnection) {}

    initialize(): Promise<void> {
        if (!this.initialized) {
            const tableSql = Array.from(STORY_TABLES.values(), (table) => `
                CREATE TABLE IF NOT EXISTS "${table}" (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    idol_id INTEGER NOT NULL,
                    category TEXT NOT NULL,
                    card_name TEXT NOT NULL,
                    up_name TEXT NOT NULL DEFAULT '',
                    video_title TEXT NOT NULL DEFAULT '',
                    url TEXT NOT NULL DEFAULT '',
                    subtitle TEXT,
                    image_file TEXT,
                    FOREIGN KEY(idol_id) REFERENCES idols(id)
                );
                CREATE INDEX IF NOT EXISTS "idx_${table}_idol" ON "${table}"(idol_id);
                CREATE INDEX IF NOT EXISTS "idx_${table}_category" ON "${table}"(category);
            `).join('\n');
            this.initialized = this.connection.exec(`
                PRAGMA foreign_keys = ON;
                CREATE TABLE IF NOT EXISTS agencies (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    code TEXT UNIQUE NOT NULL,
                    name_cn TEXT NOT NULL,
                    color TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS idols (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    agency_id INTEGER NOT NULL,
                    name_cn TEXT NOT NULL,
                    folder_name TEXT NOT NULL,
                    color TEXT,
                    FOREIGN KEY(agency_id) REFERENCES agencies(id)
                );
                CREATE TABLE IF NOT EXISTS theme_colors (
                    name TEXT UNIQUE NOT NULL,
                    color TEXT NOT NULL
                );
                ${tableSql}
            `);
        }
        return this.initialized;
    }

    close(): Promise<void> {
        return this.connection.close();
    }

    async listThemeColors(): Promise<Record<string, string>> {
        const rows = await this.connection.all<{ name: string; color: string }>(
            'SELECT name, color FROM theme_colors'
        );
        return Object.fromEntries(rows.map((row) => [row.name, row.color]));
    }

    listAgencies(): Promise<AgencyRecord[]> {
        return this.connection.all('SELECT id, code, name_cn, color FROM agencies ORDER BY id');
    }

    listIdolsWithAgencies(): Promise<IdolWithAgencyRecord[]> {
        return this.connection.all(
            `SELECT i.id, i.agency_id, i.name_cn, i.folder_name, i.color,
                    a.code AS agency_code, a.name_cn AS agency_name, a.color AS agency_color
             FROM idols i JOIN agencies a ON a.id=i.agency_id
             ORDER BY a.id, i.id`
        );
    }

    findAgencyByName(name: string): Promise<AgencyRecord | null> {
        return this.connection.get(
            'SELECT id, code, name_cn, color FROM agencies WHERE name_cn=?',
            [name]
        );
    }

    findAgencyByCode(code: string): Promise<AgencyRecord | null> {
        return this.connection.get(
            'SELECT id, code, name_cn, color FROM agencies WHERE code=?',
            [code]
        );
    }

    findIdolByAgencyAndName(agencyId: number, idolName: string): Promise<IdolRecord | null> {
        return this.connection.get(
            `SELECT id, agency_id, name_cn, folder_name, color
             FROM idols WHERE agency_id=? AND name_cn=?`,
            [agencyId, idolName]
        );
    }

    listStories(agencyCode: string, idolId: number): Promise<StoryRecord[]> {
        return this.connection.all(
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
        return this.connection.get(
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
        const result = await this.connection.run(
            `INSERT INTO ${storyTable(input.agencyCode)}
             (idol_id, category, card_name, up_name, video_title, url, subtitle, image_file)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [input.idolId, input.category, input.cardName, input.upName, input.videoTitle,
                input.url, input.subtitle, input.imageFile]
        );
        return result.lastID;
    }

    async setStoryImage(agencyCode: string, id: number, imageFile: string): Promise<void> {
        await this.connection.run(
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
        return this.connection.get(
            `SELECT id, idol_id, category, card_name, up_name, video_title, url, subtitle, image_file
             FROM ${storyTable(agencyCode)}
             WHERE idol_id=? AND category=? AND card_name=? ORDER BY id LIMIT 1`,
            [idolId, category, cardName]
        );
    }

    async updateStory(input: UpdateStoryInput): Promise<void> {
        await this.connection.run(
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
        await this.connection.transaction(async () => {
            await this.updateStory(input.story);
            if (input.rename) {
                await this.renameStoryGroup({
                    agencyCode: input.story.agencyCode,
                    idolId: input.story.idolId,
                    ...input.rename,
                    excludeId: input.story.id
                });
            }
        });
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
        await this.connection.run(
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
        return this.connection.all(
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
        await this.connection.run(
            `DELETE FROM ${storyTable(agencyCode)} WHERE idol_id=? AND category=? AND card_name=?`,
            [idolId, category, cardName]
        );
    }

    listCategoryImages(
        agencyCode: string,
        idolId: number,
        category: string
    ): Promise<Array<{ image_file: string | null }>> {
        return this.connection.all(
            `SELECT image_file FROM ${storyTable(agencyCode)} WHERE idol_id=? AND category=?`,
            [idolId, category]
        );
    }

    async deleteCategory(agencyCode: string, idolId: number, category: string): Promise<void> {
        await this.connection.run(
            `DELETE FROM ${storyTable(agencyCode)} WHERE idol_id=? AND category=?`,
            [idolId, category]
        );
    }
}
