import type {
    AgencyRecord,
    IdolRecord,
    IdolWithAgencyRecord,
    NewStoryInput,
    StoryRecord,
    StoryRepository,
    UpdateStoryInput,
    WikiBackgroundRecord,
    WikiCategoryRecord,
    WikiGroupMemberRecord,
    WikiGroupRecord,
    WikiLayoutInput,
    WikiLayoutSaveResult
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

const AGENCY_COLUMNS = `id, code, name_cn, color, wiki_enabled, display_order,
    banner_title, icon_object_key, fallback_artwork_object_key, layout_revision`;
const IDOL_COLUMNS = `id, agency_id, name_cn, folder_name, color, wiki_enabled,
    display_order, text_color, avatar_object_key, avatar_fit`;

function booleanValue(value: boolean | number): boolean {
    return value === true || value === 1;
}

function agencyRecord(row: AgencyRecord): AgencyRecord {
    return { ...row, wiki_enabled: booleanValue(row.wiki_enabled) };
}

function idolRecord<Row extends IdolRecord>(row: Row): Row {
    return { ...row, wiki_enabled: booleanValue(row.wiki_enabled) };
}

function groupRecord(row: WikiGroupRecord): WikiGroupRecord {
    return { ...row, is_fallback: booleanValue(row.is_fallback) };
}

function categoryRecord(row: WikiCategoryRecord): WikiCategoryRecord {
    return {
        ...row,
        background_eligible: booleanValue(row.background_eligible),
        show_when_empty: booleanValue(row.show_when_empty)
    };
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

    async listAgencies(): Promise<AgencyRecord[]> {
        const rows = await queryAll<AgencyRecord>(this.database,
            `SELECT ${AGENCY_COLUMNS} FROM agencies ORDER BY display_order, id`
        );
        return rows.map(agencyRecord);
    }

    async listIdolsWithAgencies(): Promise<IdolWithAgencyRecord[]> {
        const rows = await queryAll<IdolWithAgencyRecord>(this.database,
            `SELECT i.id, i.agency_id, i.name_cn, i.folder_name, i.color,
                    i.wiki_enabled, i.display_order, i.text_color,
                    i.avatar_object_key, i.avatar_fit,
                    a.code AS agency_code, a.name_cn AS agency_name, a.color AS agency_color
             FROM idols i JOIN agencies a ON a.id=i.agency_id
             ORDER BY a.display_order, a.id, i.display_order, i.id`
        );
        return rows.map(idolRecord);
    }

    async listWikiGroups(agencyId?: number): Promise<WikiGroupRecord[]> {
        const rows = await queryAll<WikiGroupRecord>(this.database,
            `SELECT id, agency_id, code, name, color, icon_object_key,
                    display_order, is_fallback
             FROM wiki_groups
             ${agencyId === undefined ? '' : 'WHERE agency_id=?'}
             ORDER BY agency_id, display_order, id`,
            agencyId === undefined ? [] : [agencyId]
        );
        return rows.map(groupRecord);
    }

    async findWikiGroupById(id: number): Promise<WikiGroupRecord | null> {
        const row = await queryOne<WikiGroupRecord>(this.database,
            `SELECT id, agency_id, code, name, color, icon_object_key,
                    display_order, is_fallback
             FROM wiki_groups WHERE id=?`,
            [id]
        );
        return row ? groupRecord(row) : null;
    }

    listWikiGroupMembers(agencyId?: number): Promise<WikiGroupMemberRecord[]> {
        return queryAll(this.database,
            `SELECT agency_id, group_id, idol_id, display_order
             FROM wiki_group_members
             ${agencyId === undefined ? '' : 'WHERE agency_id=?'}
             ORDER BY agency_id, group_id, display_order, idol_id`,
            agencyId === undefined ? [] : [agencyId]
        );
    }

    async listWikiCategories(agencyId: number, idolId: number): Promise<WikiCategoryRecord[]> {
        const rows = await queryAll<WikiCategoryRecord>(this.database,
            `SELECT c.id, c.agency_id, c.name, c.storage_slug, c.background_eligible,
                    ic.display_order, ic.show_when_empty
             FROM wiki_idol_categories ic
             JOIN wiki_categories c ON c.id=ic.category_id AND c.agency_id=ic.agency_id
             WHERE ic.agency_id=? AND ic.idol_id=?
             ORDER BY ic.display_order, c.id`,
            [agencyId, idolId]
        );
        return rows.map(categoryRecord);
    }

    async findAgencyByName(name: string): Promise<AgencyRecord | null> {
        const row = await queryOne<AgencyRecord>(this.database,
            `SELECT ${AGENCY_COLUMNS} FROM agencies WHERE name_cn=?`,
            [name]
        );
        return row ? agencyRecord(row) : null;
    }

    async findAgencyByCode(code: string): Promise<AgencyRecord | null> {
        const row = await queryOne<AgencyRecord>(this.database,
            `SELECT ${AGENCY_COLUMNS} FROM agencies WHERE code=?`,
            [code]
        );
        return row ? agencyRecord(row) : null;
    }

    async findAgencyById(id: number): Promise<AgencyRecord | null> {
        const row = await queryOne<AgencyRecord>(this.database,
            `SELECT ${AGENCY_COLUMNS} FROM agencies WHERE id=?`,
            [id]
        );
        return row ? agencyRecord(row) : null;
    }

    async findIdolByAgencyAndName(agencyId: number, idolName: string): Promise<IdolRecord | null> {
        const row = await queryOne<IdolRecord>(this.database,
            `SELECT ${IDOL_COLUMNS} FROM idols WHERE agency_id=? AND name_cn=?`,
            [agencyId, idolName]
        );
        return row ? idolRecord(row) : null;
    }

    async findIdolById(id: number): Promise<IdolRecord | null> {
        const row = await queryOne<IdolRecord>(this.database,
            `SELECT ${IDOL_COLUMNS} FROM idols WHERE id=?`,
            [id]
        );
        return row ? idolRecord(row) : null;
    }

    async setAgencyIconObjectKey(agencyId: number, objectKey: string | null): Promise<void> {
        await executeSql(this.database,
            'UPDATE agencies SET icon_object_key=? WHERE id=?',
            [objectKey, agencyId]
        );
    }

    async setIdolAvatarObjectKey(idolId: number, objectKey: string | null): Promise<void> {
        await executeSql(this.database,
            'UPDATE idols SET avatar_object_key=? WHERE id=?',
            [objectKey, idolId]
        );
    }

    async ensureWikiCategory(
        agencyId: number,
        idolId: number,
        name: string,
        storageSlug: string
    ): Promise<WikiCategoryRecord> {
        const existing = await queryOne<{ id: number }>(this.database,
            'SELECT id FROM wiki_categories WHERE agency_id=? AND name=?',
            [agencyId, name]
        );
        const statements = [];
        if (!existing) {
            statements.push(sqlStatement(this.database,
                `INSERT INTO wiki_categories(agency_id, name, storage_slug, background_eligible)
                 VALUES (?, ?, ?, FALSE) ON CONFLICT (agency_id, name) DO NOTHING`,
                [agencyId, name, storageSlug]
            ));
        }
        statements.push(sqlStatement(this.database,
            `INSERT INTO wiki_idol_categories
                (agency_id, idol_id, category_id, display_order, show_when_empty)
             SELECT ?, ?, c.id,
                    COALESCE((SELECT MAX(display_order) + 1
                              FROM wiki_idol_categories WHERE idol_id=?), 0), TRUE
             FROM wiki_categories c
             WHERE c.agency_id=? AND c.name=?
             ON CONFLICT (idol_id, category_id) DO NOTHING`,
            [agencyId, idolId, idolId, agencyId, name]
        ));
        await this.database.batch(statements);
        const category = await queryOne<WikiCategoryRecord>(this.database,
            `SELECT c.id, c.agency_id, c.name, c.storage_slug, c.background_eligible,
                    ic.display_order, ic.show_when_empty
             FROM wiki_categories c
             JOIN wiki_idol_categories ic ON ic.category_id=c.id AND ic.agency_id=c.agency_id
             WHERE c.agency_id=? AND ic.idol_id=? AND c.name=?`,
            [agencyId, idolId, name]
        );
        if (!category) throw new Error('Wiki category association was not created');
        return categoryRecord(category);
    }

    async deleteWikiCategoryAssociation(
        agencyId: number,
        idolId: number,
        name: string
    ): Promise<WikiCategoryRecord | null> {
        const category = (await this.listWikiCategories(agencyId, idolId))
            .find((candidate) => candidate.name === name) ?? null;
        if (!category) return null;
        await this.database.batch([
            sqlStatement(this.database,
                `DELETE FROM wiki_idol_categories
                 WHERE agency_id=? AND idol_id=? AND category_id=?`,
                [agencyId, idolId, category.id]
            ),
            sqlStatement(this.database,
                `DELETE FROM wiki_categories
                 WHERE agency_id=? AND id=? AND NOT EXISTS (
                     SELECT 1 FROM wiki_idol_categories WHERE category_id=?
                 )`,
                [agencyId, category.id, category.id]
            )
        ]);
        return category;
    }

    async saveWikiLayout(input: WikiLayoutInput): Promise<WikiLayoutSaveResult> {
        const [agency, groups, idols] = await Promise.all([
            this.findAgencyById(input.agencyId),
            this.listWikiGroups(input.agencyId),
            queryAll<{ id: number }>(this.database,
                'SELECT id FROM idols WHERE agency_id=? AND wiki_enabled=TRUE ORDER BY id',
                [input.agencyId]
            )
        ]);
        if (!agency) throw Object.assign(new Error('企划不存在'), { status: 404 });
        const groupIds = new Set(groups.map((group) => group.id));
        const requestedGroupIds = input.groups.map((group) => group.id);
        if (requestedGroupIds.length !== groupIds.size ||
            new Set(requestedGroupIds).size !== requestedGroupIds.length ||
            requestedGroupIds.some((id) => !groupIds.has(id))) {
            throw Object.assign(new Error('布局必须覆盖该企划的全部分组'), { status: 400 });
        }
        if (groups.filter((group) => group.is_fallback).length !== 1) {
            throw Object.assign(new Error('企划必须且只能有一个兜底分组'), { status: 409 });
        }
        const expectedIdols = new Set(idols.map((idol) => idol.id));
        const requestedIdols = input.groups.flatMap((group) => group.idolIds);
        if (requestedIdols.length !== expectedIdols.size ||
            new Set(requestedIdols).size !== requestedIdols.length ||
            requestedIdols.some((id) => !expectedIdols.has(id))) {
            throw Object.assign(new Error('布局必须且只能包含该企划的全部启用偶像'), { status: 400 });
        }
        const revisionGuard = `EXISTS (
            SELECT 1 FROM agencies WHERE id=? AND layout_revision=?
        )`;
        const statements = [sqlStatement(this.database,
            `DELETE FROM wiki_group_members WHERE agency_id=? AND ${revisionGuard}`,
            [input.agencyId, input.agencyId, input.expectedRevision]
        )];
        for (const group of input.groups) {
            group.idolIds.forEach((idolId, displayOrder) => {
                statements.push(sqlStatement(this.database,
                    `INSERT INTO wiki_group_members(agency_id, group_id, idol_id, display_order)
                     SELECT ?, ?, ?, ? WHERE ${revisionGuard}`,
                    [input.agencyId, group.id, idolId, displayOrder,
                        input.agencyId, input.expectedRevision]
                ));
            });
        }
        statements.push(sqlStatement(this.database,
            `UPDATE agencies SET layout_revision=layout_revision+1
             WHERE id=? AND layout_revision=?`,
            [input.agencyId, input.expectedRevision]
        ));
        const results = await this.database.batch(statements);
        const updated = results.at(-1)?.meta.changes ?? 0;
        if (!updated) {
            const current = await this.findAgencyById(input.agencyId);
            return { status: 'conflict', revision: current?.layout_revision ?? agency.layout_revision };
        }
        return { status: 'saved', revision: input.expectedRevision + 1 };
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

    sampleWikiBackground(): Promise<WikiBackgroundRecord | null> {
        const candidates = [...STORY_TABLES.entries()].map(([code, table]) => `
            SELECT s.id, s.idol_id, s.category, s.card_name, s.up_name,
                   s.video_title, s.url, s.subtitle, s.image_file,
                   a.id AS agency_id, a.code AS agency_code, a.name_cn AS agency_name,
                   i.name_cn AS idol_name, i.folder_name AS idol_folder_name
            FROM "${table}" s
            JOIN idols i ON i.id=s.idol_id
            JOIN agencies a ON a.id=i.agency_id AND a.code='${code}'
            JOIN wiki_categories c ON c.agency_id=a.id AND c.name=s.category
            JOIN wiki_idol_categories ic
              ON ic.agency_id=a.id AND ic.idol_id=i.id AND ic.category_id=c.id
            WHERE a.wiki_enabled=TRUE AND i.wiki_enabled=TRUE
              AND c.background_eligible=TRUE AND s.image_file IS NOT NULL
        `).join(' UNION ALL ');
        return queryOne(this.database,
            `SELECT * FROM (${candidates}) candidates ORDER BY RANDOM() LIMIT 1`
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

    findStoryById(
        agencyCode: string,
        idolId: number,
        id: number
    ): Promise<StoryRecord | null> {
        return queryOne(this.database,
            `SELECT id, idol_id, category, card_name, up_name, video_title, url, subtitle, image_file
             FROM ${storyTable(agencyCode)} WHERE idol_id=? AND id=?`,
            [idolId, id]
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
