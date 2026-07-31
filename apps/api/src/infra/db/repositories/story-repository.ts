import type {
    AddStoryCardSourcesInput,
    AddStoryCardSourcesResult,
    AgencyRecord,
    CreateWikiStoryCoverAssetInput,
    CreateWikiAgencyInput,
    CreateWikiGroupInput,
    CreateWikiIdolInput,
    DeleteStoryLinkInput,
    DeleteStoryLinkResult,
    DeleteWikiGroupInput,
    DeleteWikiIdolInput,
    IdolRecord,
    IdolWithAgencyRecord,
    NewStoryBatchInput,
    NewStoryInput,
    SaveWikiEntityMediaInput,
    StoryCardRecord,
    StoryRecord,
    StoryRepository,
    UpdateStoryCardInput,
    UpdateStoryInput,
    UpdateWikiAgencyInput,
    UpdateWikiCategoryInput,
    UpdateWikiGroupInput,
    UpdateWikiIdolInput,
    UpdateWikiStoryCoverAssetInput,
    WikiBackgroundRecord,
    WikiCategoryRecord,
    WikiGroupMemberRecord,
    WikiGroupDeleteResult,
    WikiGroupRecord,
    WikiIdolDeleteResult,
    WikiEntityMediaSaveResult,
    WikiLayoutInput,
    WikiLayoutSaveResult,
    WikiCategorySaveResult,
    WikiStoryCardSaveResult,
    WikiStoryCatalogDeleteResult,
    WikiStoryCatalogOptionInput,
    WikiStoryCatalogSaveResult,
    WikiStoryContentTypeRecord,
    WikiStoryCoverAssetDeleteResult,
    WikiStoryCoverAssetRecord,
    WikiStoryCoverAssetSaveResult,
    WikiStorySourcePlatformInput,
    WikiStorySourcePlatformRecord
} from '@/ports/repositories';
import type { ManagedSqlDatabase, SqlSchemaStrategy } from '@/infra/db/sql/database';
import { executeSql, queryAll, queryOne, sqlStatement } from '@/infra/db/sql/query';

const AGENCY_COLUMNS = `id, code, name_cn, color, wiki_enabled, display_order,
    banner_title, icon_object_key, icon_fit, icon_focal_x, icon_focal_y,
    icon_zoom, icon_rotation, icon_media_revision, fallback_artwork_object_key,
    layout_revision`;
const IDOL_COLUMNS = `id, agency_id, name_cn, folder_name, color, wiki_enabled,
    display_order, text_color, avatar_object_key, avatar_fit, avatar_focal_x,
    avatar_focal_y, avatar_zoom, avatar_rotation, avatar_media_revision,
    entry_kind, entry_subtype`;
const GROUP_COLUMNS = `id, agency_id, code, name, color, icon_object_key,
    icon_fit, icon_focal_x, icon_focal_y, icon_zoom, icon_rotation,
    icon_media_revision, display_order, is_fallback`;
const STORY_MEDIA_COLUMNS = `cards.id AS card_id, cards.image_fit,
    cards.image_focal_x, cards.image_focal_y, cards.image_zoom,
    cards.image_rotation, cards.image_media_revision, cards.cover_asset_id,
    (SELECT name FROM wiki_story_cover_assets
     WHERE id=cards.cover_asset_id) AS cover_asset_name,
    (SELECT object_key FROM wiki_story_cover_assets
     WHERE id=cards.cover_asset_id) AS cover_asset_object_key,
    (SELECT revision FROM wiki_story_cover_assets
     WHERE id=cards.cover_asset_id) AS cover_asset_revision,
    (SELECT presentation_policy FROM wiki_story_cover_assets
     WHERE id=cards.cover_asset_id) AS cover_asset_presentation_policy`;
const STORY_COLUMNS = `COALESCE(links.legacy_id, links.id) AS id,
    cards.idol_id, categories.name AS category, cards.card_name,
    COALESCE(links.up_name, '') AS up_name,
    COALESCE(links.video_title, '') AS video_title,
    COALESCE(links.url, '') AS url, links.content_type_id,
    COALESCE((SELECT name FROM wiki_story_content_types
              WHERE id=links.content_type_id), '') AS content_type_name,
    links.source_platform_id,
    COALESCE((SELECT name FROM wiki_story_source_platforms
              WHERE id=links.source_platform_id), '') AS source_platform_name,
    cards.subtitle, cards.image_file,
    ${STORY_MEDIA_COLUMNS}`;
const STORY_CARD_COLUMNS = `cards.idol_id,
    categories.name AS category, cards.card_name, cards.subtitle, cards.image_file,
    ${STORY_MEDIA_COLUMNS}`;
const STORY_CLEANUP_COLUMNS = `COALESCE(links.legacy_id, links.id) AS id,
    cards.idol_id, categories.name AS category, cards.card_name,
    COALESCE(links.up_name, '') AS up_name,
    COALESCE(links.video_title, '') AS video_title,
    COALESCE(links.url, '') AS url, links.content_type_id,
    COALESCE((SELECT name FROM wiki_story_content_types
              WHERE id=links.content_type_id), '') AS content_type_name,
    links.source_platform_id,
    COALESCE((SELECT name FROM wiki_story_source_platforms
              WHERE id=links.source_platform_id), '') AS source_platform_name,
    cards.subtitle,
    COALESCE(links.legacy_image_file, cards.image_file) AS image_file,
    ${STORY_MEDIA_COLUMNS}`;

function httpError(message: string, status: number): Error {
    return Object.assign(new Error(message), { status });
}

function storyCardHasConflict(
    existing: StoryCardRecord,
    input: NewStoryInput | NewStoryBatchInput
): boolean {
    const hasImageConflict = Boolean(input.imageFile) &&
        input.imageFile !== existing.image_file;
    const coverAssetId = input.coverAssetId ?? null;
    const hasCoverAssetConflict = coverAssetId !== null &&
        coverAssetId !== existing.cover_asset_id;
    const hasSubtitleConflict = Boolean(input.subtitle) &&
        input.subtitle !== (existing.subtitle ?? '');
    const hasTransformConflict = Boolean(input.imageFile) && (
        input.imageTransform.fit !== existing.image_fit ||
        input.imageTransform.focalX !== existing.image_focal_x ||
        input.imageTransform.focalY !== existing.image_focal_y ||
        input.imageTransform.zoom !== existing.image_zoom ||
        input.imageTransform.rotation !== existing.image_rotation
    );
    return hasImageConflict || hasCoverAssetConflict || hasSubtitleConflict ||
        hasTransformConflict;
}

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
                    i.avatar_object_key, i.avatar_fit, i.avatar_focal_x,
                    i.avatar_focal_y, i.avatar_zoom, i.avatar_rotation,
                    i.avatar_media_revision, i.entry_kind, i.entry_subtype,
                    a.code AS agency_code, a.name_cn AS agency_name, a.color AS agency_color
             FROM idols i JOIN agencies a ON a.id=i.agency_id
             WHERE i.deleted_at IS NULL
             ORDER BY a.display_order, a.id, i.display_order, i.id`
        );
        return rows.map(idolRecord);
    }

    async listWikiGroups(agencyId?: number): Promise<WikiGroupRecord[]> {
        const rows = await queryAll<WikiGroupRecord>(this.database,
            `SELECT ${GROUP_COLUMNS}
             FROM wiki_groups
             ${agencyId === undefined ? '' : 'WHERE agency_id=?'}
             ORDER BY agency_id, display_order, id`,
            agencyId === undefined ? [] : [agencyId]
        );
        return rows.map(groupRecord);
    }

    async findWikiGroupById(id: number): Promise<WikiGroupRecord | null> {
        const row = await queryOne<WikiGroupRecord>(this.database,
            `SELECT ${GROUP_COLUMNS} FROM wiki_groups WHERE id=?`,
            [id]
        );
        return row ? groupRecord(row) : null;
    }

    listWikiGroupMembers(agencyId?: number): Promise<WikiGroupMemberRecord[]> {
        return queryAll<WikiGroupMemberRecord>(this.database,
            `SELECT members.agency_id, members.group_id, members.idol_id,
                    members.display_order
             FROM wiki_group_members members
             JOIN idols ON idols.id=members.idol_id
                       AND idols.agency_id=members.agency_id
             WHERE idols.deleted_at IS NULL
               ${agencyId === undefined ? '' : 'AND members.agency_id=?'}
             ORDER BY members.agency_id, members.group_id,
                      members.display_order, members.idol_id`,
            agencyId === undefined ? [] : [agencyId]
        );
    }

    async listWikiCategories(agencyId: number, idolId: number): Promise<WikiCategoryRecord[]> {
        const rows = await queryAll<WikiCategoryRecord>(this.database,
            `SELECT c.id, c.agency_id, c.name, c.storage_slug, c.background_eligible,
                    ic.display_order, ic.show_when_empty
             FROM wiki_idol_categories ic
             JOIN wiki_categories c ON c.id=ic.category_id AND c.agency_id=ic.agency_id
             JOIN idols i ON i.id=ic.idol_id AND i.agency_id=ic.agency_id
             WHERE ic.agency_id=? AND ic.idol_id=? AND i.deleted_at IS NULL
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
            `SELECT ${IDOL_COLUMNS} FROM idols
             WHERE agency_id=? AND name_cn=? AND deleted_at IS NULL`,
            [agencyId, idolName]
        );
        return row ? idolRecord(row) : null;
    }

    async findIdolById(id: number): Promise<IdolRecord | null> {
        const row = await queryOne<IdolRecord>(this.database,
            `SELECT ${IDOL_COLUMNS} FROM idols WHERE id=? AND deleted_at IS NULL`,
            [id]
        );
        return row ? idolRecord(row) : null;
    }

    async createWikiAgency(input: CreateWikiAgencyInput): Promise<AgencyRecord> {
        const duplicate = await queryOne<{ id: number }>(this.database,
            'SELECT id FROM agencies WHERE code=? OR name_cn=? LIMIT 1',
            [input.code, input.name]
        );
        if (duplicate) throw httpError('企划代码或名称已存在', 409);
        await this.database.batch([
            sqlStatement(this.database,
                `INSERT INTO agencies
                    (code, name_cn, color, wiki_enabled, display_order, banner_title,
                     layout_revision)
                 SELECT ?, ?, ?, ?, COALESCE(MAX(display_order) + 1, 0), ?, 0
                 FROM agencies`,
                [input.code, input.name, input.color, input.wikiEnabled, input.bannerTitle]
            ),
            sqlStatement(this.database,
                `INSERT INTO wiki_groups
                    (agency_id, code, name, color, display_order, is_fallback)
                 SELECT id, 'other', '事务所人员与其他', color, 0, TRUE
                 FROM agencies WHERE code=?`,
                [input.code]
            )
        ]);
        const agency = await this.findAgencyByCode(input.code);
        if (!agency) throw new Error('Wiki agency insert did not return a record');
        return agency;
    }

    async updateWikiAgency(input: UpdateWikiAgencyInput): Promise<AgencyRecord> {
        const agency = await this.findAgencyById(input.id);
        if (!agency) throw httpError('企划不存在', 404);
        const duplicate = await queryOne<{ id: number }>(this.database,
            'SELECT id FROM agencies WHERE name_cn=? AND id<>? LIMIT 1',
            [input.name, input.id]
        );
        if (duplicate) throw httpError('企划名称已存在', 409);
        await executeSql(this.database,
            `UPDATE agencies
             SET name_cn=?, color=?, banner_title=?, wiki_enabled=?
             WHERE id=?`,
            [input.name, input.color, input.bannerTitle, input.wikiEnabled, input.id]
        );
        return (await this.findAgencyById(input.id))!;
    }

    async createWikiGroup(input: CreateWikiGroupInput): Promise<WikiGroupRecord> {
        if (!await this.findAgencyById(input.agencyId)) throw httpError('企划不存在', 404);
        const duplicate = await queryOne<{ id: number }>(this.database,
            `SELECT id FROM wiki_groups
             WHERE agency_id=? AND (code=? OR name=?) LIMIT 1`,
            [input.agencyId, input.code, input.name]
        );
        if (duplicate) throw httpError('栏目代码或名称已存在', 409);
        const results = await this.database.batch([
            sqlStatement(this.database,
                `INSERT INTO wiki_groups
                    (agency_id, code, name, color, display_order, is_fallback)
                 SELECT ?, ?, ?, ?, COALESCE(MAX(display_order) + 1, 0), FALSE
                 FROM wiki_groups WHERE agency_id=?
                 RETURNING id`,
                [input.agencyId, input.code, input.name, input.color, input.agencyId]
            ),
            sqlStatement(this.database,
                'UPDATE agencies SET layout_revision=layout_revision+1 WHERE id=?',
                [input.agencyId]
            )
        ]);
        const createdId = results[0]?.meta.last_row_id;
        if (!createdId) throw new Error('Wiki group insert did not return an ID');
        return (await this.findWikiGroupById(createdId))!;
    }

    async updateWikiGroup(input: UpdateWikiGroupInput): Promise<WikiGroupRecord> {
        const group = await this.findWikiGroupById(input.id);
        if (!group) throw httpError('栏目不存在', 404);
        const duplicate = await queryOne<{ id: number }>(this.database,
            `SELECT id FROM wiki_groups
             WHERE agency_id=? AND id<>? AND (code=? OR name=?) LIMIT 1`,
            [group.agency_id, input.id, input.code, input.name]
        );
        if (duplicate) throw httpError('栏目代码或名称已存在', 409);
        await executeSql(this.database,
            'UPDATE wiki_groups SET code=?, name=?, color=? WHERE id=?',
            [input.code, input.name, input.color, input.id]
        );
        return (await this.findWikiGroupById(input.id))!;
    }

    async deleteWikiGroup(
        input: DeleteWikiGroupInput
    ): Promise<WikiGroupDeleteResult | null> {
        const results = await this.database.batch([
            sqlStatement(this.database,
                `UPDATE wiki_groups
                 SET icon_media_revision=icon_media_revision
                 WHERE id=? AND icon_media_revision=?
                 RETURNING ${GROUP_COLUMNS}`,
                [input.id, input.expectedRevision]
            ),
            sqlStatement(this.database,
                `UPDATE agencies SET layout_revision=layout_revision+1
                 WHERE id=(
                     SELECT agency_id FROM wiki_groups
                     WHERE id=? AND icon_media_revision=?
                 )`,
                [input.id, input.expectedRevision]
            ),
            sqlStatement(this.database,
                `DELETE FROM wiki_groups
                 WHERE id=? AND icon_media_revision=?
                 RETURNING ${GROUP_COLUMNS}`,
                [input.id, input.expectedRevision]
            )
        ]);
        const deleted = results[2]?.results[0] as unknown as WikiGroupRecord | undefined;
        if (deleted) return { status: 'deleted', group: groupRecord(deleted) };
        const current = await this.findWikiGroupById(input.id);
        if (!current) return null;
        return { status: 'conflict', revision: current.icon_media_revision };
    }

    async createWikiIdol(input: CreateWikiIdolInput): Promise<IdolRecord> {
        if (!await this.findAgencyById(input.agencyId)) throw httpError('企划不存在', 404);
        await this.assertWikiGroups(input.agencyId, input.groupIds);
        const duplicate = await queryOne<{ id: number }>(this.database,
            `SELECT id FROM idols
             WHERE agency_id=? AND (name_cn=? OR folder_name=?) LIMIT 1`,
            [input.agencyId, input.name, input.folderName]
        );
        if (duplicate) throw httpError('内容页名称或目录标识已存在', 409);
        const statements = [sqlStatement(this.database,
            `INSERT INTO idols
                (agency_id, name_cn, folder_name, color, wiki_enabled, display_order,
                 text_color, avatar_fit, entry_kind, entry_subtype)
             SELECT ?, ?, ?, ?, ?, COALESCE(MAX(display_order) + 1, 0), ?, ?, ?, ?
             FROM idols WHERE agency_id=?`,
            [input.agencyId, input.name, input.folderName, input.color, input.wikiEnabled,
                input.textColor, input.imageFit, input.entryKind ?? 'idol',
                input.entryKind === 'story' ? input.entrySubtype ?? 'other' : null,
                input.agencyId]
        )];
        for (const groupId of input.groupIds) {
            statements.push(sqlStatement(this.database,
                `INSERT INTO wiki_group_members(agency_id, group_id, idol_id, display_order)
                 SELECT i.agency_id, ?, i.id,
                        COALESCE((SELECT MAX(display_order) + 1
                                  FROM wiki_group_members WHERE group_id=?), 0)
                 FROM idols i
                 WHERE i.agency_id=? AND i.folder_name=?`,
                [groupId, groupId, input.agencyId, input.folderName]
            ));
        }
        statements.push(sqlStatement(this.database,
            'UPDATE agencies SET layout_revision=layout_revision+1 WHERE id=?',
            [input.agencyId]
        ));
        await this.database.batch(statements);
        const idol = await this.findIdolByAgencyAndName(input.agencyId, input.name);
        if (!idol) throw new Error('Wiki idol insert did not return a record');
        return idol;
    }

    async updateWikiIdol(input: UpdateWikiIdolInput): Promise<IdolRecord> {
        const idol = await this.findIdolById(input.id);
        if (!idol) throw httpError('内容页不存在', 404);
        await this.assertWikiGroups(idol.agency_id, input.groupIds);
        const duplicate = await queryOne<{ id: number }>(this.database,
            'SELECT id FROM idols WHERE agency_id=? AND name_cn=? AND id<>? LIMIT 1',
            [idol.agency_id, input.name, input.id]
        );
        if (duplicate) throw httpError('内容页名称已存在', 409);
        const groupPlaceholders = input.groupIds.map(() => '?').join(',');
        const membershipChanged = input.groupIds.length
            ? `EXISTS (
                    SELECT 1 FROM wiki_group_members members
                    WHERE members.agency_id=? AND members.idol_id=?
                      AND members.group_id NOT IN (${groupPlaceholders})
                ) OR EXISTS (
                    SELECT 1 FROM wiki_groups requested
                    WHERE requested.agency_id=?
                      AND requested.id IN (${groupPlaceholders})
                      AND NOT EXISTS (
                          SELECT 1 FROM wiki_group_members members
                          WHERE members.group_id=requested.id AND members.idol_id=?
                      )
                )`
            : `EXISTS (
                    SELECT 1 FROM wiki_group_members members
                    WHERE members.agency_id=? AND members.idol_id=?
                )`;
        const membershipParameters = input.groupIds.length
            ? [idol.agency_id, input.id, ...input.groupIds,
                idol.agency_id, ...input.groupIds, input.id]
            : [idol.agency_id, input.id];
        const statements = [
            sqlStatement(this.database,
                `UPDATE idols
                 SET name_cn=?, color=?, text_color=?, avatar_fit=?, wiki_enabled=?,
                     entry_kind=?, entry_subtype=?
                 WHERE id=?`,
                [input.name, input.color, input.textColor, input.imageFit,
                    input.wikiEnabled, input.entryKind ?? idol.entry_kind,
                    (input.entryKind ?? idol.entry_kind) === 'story'
                        ? input.entrySubtype ?? idol.entry_subtype ?? 'other'
                        : null,
                    input.id]
            ),
            sqlStatement(this.database,
                `UPDATE agencies
                 SET layout_revision=layout_revision+1
                 WHERE id=? AND (${membershipChanged})`,
                [idol.agency_id, ...membershipParameters]
            ),
            sqlStatement(this.database,
                `DELETE FROM wiki_group_members
                 WHERE agency_id=? AND idol_id=?
                   ${input.groupIds.length
                        ? `AND group_id NOT IN (${groupPlaceholders})`
                        : ''}`,
                [idol.agency_id, input.id, ...input.groupIds]
            )
        ];
        for (const groupId of input.groupIds) {
            statements.push(sqlStatement(this.database,
                `INSERT INTO wiki_group_members(agency_id, group_id, idol_id, display_order)
                 SELECT ?, ?, ?, COALESCE((
                     SELECT MAX(display_order) + 1 FROM wiki_group_members WHERE group_id=?
                 ), 0)
                 WHERE NOT EXISTS (
                     SELECT 1 FROM wiki_group_members WHERE group_id=? AND idol_id=?
                 )`,
                [idol.agency_id, groupId, input.id, groupId, groupId, input.id]
            ));
        }
        await this.database.batch(statements);
        return (await this.findIdolById(input.id))!;
    }

    async deleteWikiIdol(
        input: DeleteWikiIdolInput
    ): Promise<WikiIdolDeleteResult | null> {
        const idolGuard = `EXISTS (
            SELECT 1 FROM idols guarded
            WHERE guarded.id=? AND guarded.avatar_media_revision=?
              AND guarded.deleted_at IS NULL
        )`;
        const results = await this.database.batch([
            sqlStatement(this.database,
                `UPDATE idols
                 SET avatar_media_revision=avatar_media_revision
                 WHERE id=? AND avatar_media_revision=? AND deleted_at IS NULL
                 RETURNING id`,
                [input.id, input.expectedRevision]
            ),
            sqlStatement(this.database,
                `UPDATE wiki_story_links
                 SET deleted_at=CURRENT_TIMESTAMP
                 WHERE deleted_at IS NULL AND card_id IN (
                     SELECT cards.id FROM wiki_story_cards cards
                     WHERE cards.idol_id=? AND cards.deleted_at IS NULL
                 ) AND ${idolGuard}
                 RETURNING id`,
                [input.id, input.id, input.expectedRevision]
            ),
            sqlStatement(this.database,
                `UPDATE wiki_story_cards
                 SET deleted_at=CURRENT_TIMESTAMP
                 WHERE idol_id=? AND deleted_at IS NULL AND ${idolGuard}
                 RETURNING id`,
                [input.id, input.id, input.expectedRevision]
            ),
            sqlStatement(this.database,
                `UPDATE agencies
                 SET layout_revision=layout_revision+1
                 WHERE id=(SELECT agency_id FROM idols WHERE id=?)
                   AND ${idolGuard}`,
                [input.id, input.id, input.expectedRevision]
            ),
            sqlStatement(this.database,
                `UPDATE idols
                 SET deleted_at=CURRENT_TIMESTAMP, wiki_enabled=FALSE
                 WHERE id=? AND avatar_media_revision=? AND deleted_at IS NULL
                 RETURNING ${IDOL_COLUMNS}`,
                [input.id, input.expectedRevision]
            )
        ]);
        const deleted = results[4]?.results[0] as unknown as IdolRecord | undefined;
        if (deleted) {
            return {
                status: 'deleted',
                idol: idolRecord(deleted),
                cardCount: results[2]?.meta.changes ?? 0,
                storyCount: results[1]?.meta.changes ?? 0
            };
        }
        const current = await queryOne<{
            avatar_media_revision: number;
            deleted_at: string | null;
        }>(this.database,
            `SELECT avatar_media_revision, deleted_at FROM idols WHERE id=?`,
            [input.id]
        );
        if (!current || current.deleted_at) return null;
        return { status: 'conflict', revision: current.avatar_media_revision };
    }

    private async assertWikiGroups(agencyId: number, groupIds: number[]): Promise<void> {
        const uniqueIds = new Set(groupIds);
        if (uniqueIds.size !== groupIds.length) throw httpError('栏目不能重复', 400);
        if (!groupIds.length) return;
        const placeholders = groupIds.map(() => '?').join(',');
        const row = await queryOne<{ count: number }>(this.database,
            `SELECT COUNT(*) AS count FROM wiki_groups
             WHERE agency_id=? AND id IN (${placeholders})`,
            [agencyId, ...groupIds]
        );
        if (Number(row?.count ?? 0) !== groupIds.length) {
            throw httpError('栏目不存在或不属于该企划', 400);
        }
    }

    async setAgencyIconObjectKey(agencyId: number, objectKey: string | null): Promise<void> {
        await executeSql(this.database,
            `UPDATE agencies
             SET icon_object_key=?, icon_media_revision=icon_media_revision+1
             WHERE id=?`,
            [objectKey, agencyId]
        );
    }

    async setIdolAvatarObjectKey(idolId: number, objectKey: string | null): Promise<void> {
        await executeSql(this.database,
            `UPDATE idols
             SET avatar_object_key=?, avatar_media_revision=avatar_media_revision+1
             WHERE id=?`,
            [objectKey, idolId]
        );
    }

    saveAgencyIconMedia(
        input: SaveWikiEntityMediaInput
    ): Promise<WikiEntityMediaSaveResult> {
        return this.saveEntityMedia(input, {
            table: 'agencies',
            objectKey: 'icon_object_key',
            fit: 'icon_fit',
            focalX: 'icon_focal_x',
            focalY: 'icon_focal_y',
            zoom: 'icon_zoom',
            rotation: 'icon_rotation',
            revision: 'icon_media_revision',
            missingMessage: '企划不存在'
        });
    }

    saveWikiGroupIconMedia(
        input: SaveWikiEntityMediaInput
    ): Promise<WikiEntityMediaSaveResult> {
        return this.saveEntityMedia(input, {
            table: 'wiki_groups',
            objectKey: 'icon_object_key',
            fit: 'icon_fit',
            focalX: 'icon_focal_x',
            focalY: 'icon_focal_y',
            zoom: 'icon_zoom',
            rotation: 'icon_rotation',
            revision: 'icon_media_revision',
            missingMessage: '栏目不存在'
        });
    }

    saveIdolAvatarMedia(
        input: SaveWikiEntityMediaInput
    ): Promise<WikiEntityMediaSaveResult> {
        return this.saveEntityMedia(input, {
            table: 'idols',
            objectKey: 'avatar_object_key',
            fit: 'avatar_fit',
            focalX: 'avatar_focal_x',
            focalY: 'avatar_focal_y',
            zoom: 'avatar_zoom',
            rotation: 'avatar_rotation',
            revision: 'avatar_media_revision',
            missingMessage: '内容页不存在'
        });
    }

    private async saveEntityMedia(
        input: SaveWikiEntityMediaInput,
        columns: {
            table: 'agencies' | 'wiki_groups' | 'idols';
            objectKey: 'icon_object_key' | 'avatar_object_key';
            fit: 'icon_fit' | 'avatar_fit';
            focalX: 'icon_focal_x' | 'avatar_focal_x';
            focalY: 'icon_focal_y' | 'avatar_focal_y';
            zoom: 'icon_zoom' | 'avatar_zoom';
            rotation: 'icon_rotation' | 'avatar_rotation';
            revision: 'icon_media_revision' | 'avatar_media_revision';
            missingMessage: string;
        }
    ): Promise<WikiEntityMediaSaveResult> {
        const readCurrent = () => queryOne<{ object_key: string | null; revision: number }>(
            this.database,
            `SELECT ${columns.objectKey} AS object_key, ${columns.revision} AS revision
             FROM ${columns.table} WHERE id=?`,
            [input.id]
        );
        const current = await readCurrent();
        if (!current) throw httpError(columns.missingMessage, 404);
        if (Number(current.revision) !== input.expectedRevision) {
            return { status: 'conflict', revision: Number(current.revision) };
        }
        const saved = await executeSql(this.database,
            `UPDATE ${columns.table}
             SET ${columns.objectKey}=?, ${columns.fit}=?, ${columns.focalX}=?,
                 ${columns.focalY}=?, ${columns.zoom}=?, ${columns.rotation}=?,
                 ${columns.revision}=${columns.revision}+1
             WHERE id=? AND ${columns.revision}=?`,
            [
                input.objectKey,
                input.transform.fit,
                input.transform.focalX,
                input.transform.focalY,
                input.transform.zoom,
                input.transform.rotation,
                input.id,
                input.expectedRevision
            ]
        );
        if (saved.meta.changes) {
            return {
                status: 'saved',
                revision: input.expectedRevision + 1,
                previousObjectKey: current.object_key
            };
        }
        const raced = await readCurrent();
        if (!raced) throw httpError(columns.missingMessage, 404);
        return { status: 'conflict', revision: Number(raced.revision) };
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

    async updateWikiCategory(
        input: UpdateWikiCategoryInput
    ): Promise<WikiCategorySaveResult | null> {
        const result = await sqlStatement(this.database,
            `UPDATE wiki_categories
             SET name=?
             WHERE id=? AND agency_id=? AND EXISTS (
                 SELECT 1
                 FROM wiki_idol_categories assignments
                 WHERE assignments.agency_id=wiki_categories.agency_id
                   AND assignments.category_id=wiki_categories.id
                   AND assignments.idol_id=?
             ) AND name=?
             RETURNING id, agency_id, name, storage_slug, background_eligible,
                 (SELECT display_order FROM wiki_idol_categories assignments
                  WHERE assignments.agency_id=wiki_categories.agency_id
                    AND assignments.category_id=wiki_categories.id
                    AND assignments.idol_id=?) AS display_order,
                 (SELECT show_when_empty FROM wiki_idol_categories assignments
                  WHERE assignments.agency_id=wiki_categories.agency_id
                    AND assignments.category_id=wiki_categories.id
                    AND assignments.idol_id=?) AS show_when_empty`,
            [input.name, input.id, input.agencyId, input.idolId, input.expectedName,
                input.idolId, input.idolId]
        ).all<WikiCategoryRecord>();
        const updated = result.results[0];
        if (updated) return { status: 'saved', category: categoryRecord(updated) };
        const current = (await this.listWikiCategories(input.agencyId, input.idolId))
            .find((category) => category.id === input.id);
        if (!current) return null;
        return { status: 'conflict', currentName: current.name };
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

    listStoryContentTypes(): Promise<WikiStoryContentTypeRecord[]> {
        return queryAll<WikiStoryContentTypeRecord>(this.database,
            `SELECT id, name, description, display_order, is_active, revision
             FROM wiki_story_content_types ORDER BY display_order, id`
        ).then((rows) => rows.map((row) => ({
            ...row,
            is_active: booleanValue(row.is_active)
        })));
    }

    listStorySourcePlatforms(): Promise<WikiStorySourcePlatformRecord[]> {
        return queryAll<WikiStorySourcePlatformRecord>(this.database,
            `SELECT id, name, homepage_url, description, display_order, is_active, revision
             FROM wiki_story_source_platforms ORDER BY display_order, id`
        ).then((rows) => rows.map((row) => ({
            ...row,
            is_active: booleanValue(row.is_active)
        })));
    }

    listStoryCoverAssets(agencyId: number): Promise<WikiStoryCoverAssetRecord[]> {
        return queryAll<WikiStoryCoverAssetRecord>(this.database,
            `SELECT assets.id, assets.agency_id, assets.name, assets.object_key,
                    assets.presentation_policy, assets.display_order,
                    assets.is_active, assets.revision,
                    COUNT(cards.id) AS usage_count
             FROM wiki_story_cover_assets assets
             LEFT JOIN wiki_story_cards cards ON cards.cover_asset_id=assets.id
             WHERE assets.agency_id=?
             GROUP BY assets.id, assets.agency_id, assets.name, assets.object_key,
                      assets.presentation_policy, assets.display_order,
                      assets.is_active, assets.revision
             ORDER BY assets.display_order, assets.id`,
            [agencyId]
        ).then((rows) => rows.map((row) => ({
            ...row,
            is_active: booleanValue(row.is_active),
            usage_count: Number(row.usage_count)
        })));
    }

    async findStoryCoverAssetById(id: number): Promise<WikiStoryCoverAssetRecord | null> {
        const row = await queryOne<WikiStoryCoverAssetRecord>(this.database,
            `SELECT assets.id, assets.agency_id, assets.name, assets.object_key,
                    assets.presentation_policy, assets.display_order,
                    assets.is_active, assets.revision,
                    COUNT(cards.id) AS usage_count
             FROM wiki_story_cover_assets assets
             LEFT JOIN wiki_story_cards cards ON cards.cover_asset_id=assets.id
             WHERE assets.id=?
             GROUP BY assets.id, assets.agency_id, assets.name, assets.object_key,
                      assets.presentation_policy, assets.display_order,
                      assets.is_active, assets.revision`,
            [id]
        );
        return row ? {
            ...row,
            is_active: booleanValue(row.is_active),
            usage_count: Number(row.usage_count)
        } : null;
    }

    async createStoryCoverAsset(
        input: CreateWikiStoryCoverAssetInput
    ): Promise<WikiStoryCoverAssetRecord> {
        const row = await queryOne<WikiStoryCoverAssetRecord>(this.database,
            `INSERT INTO wiki_story_cover_assets
                (agency_id, name, object_key, presentation_policy, display_order)
             SELECT id, ?, ?, ?, COALESCE((
                 SELECT MAX(display_order) + 1 FROM wiki_story_cover_assets
                 WHERE agency_id=?
             ), 0)
             FROM agencies WHERE id=?
             RETURNING id, agency_id, name, object_key, presentation_policy, display_order,
                       is_active, revision, 0 AS usage_count`,
            [input.name, input.objectKey, input.presentationPolicy,
                input.agencyId, input.agencyId]
        );
        if (!row) throw httpError('企划不存在', 404);
        return { ...row, is_active: booleanValue(row.is_active) };
    }

    async updateStoryCoverAsset(
        input: UpdateWikiStoryCoverAssetInput
    ): Promise<WikiStoryCoverAssetSaveResult | null> {
        const previous = await this.findStoryCoverAssetById(input.id);
        if (!previous || previous.agency_id !== input.agencyId) return null;
        const updated = await queryOne<{ id: number }>(this.database,
            `UPDATE wiki_story_cover_assets
             SET name=?, object_key=?, presentation_policy=?, is_active=?,
                 revision=revision+1
             WHERE id=? AND agency_id=? AND revision=? RETURNING id`,
            [input.name, input.objectKey, input.presentationPolicy, input.isActive, input.id,
                input.agencyId, input.expectedRevision]
        );
        if (!updated) {
            const current = await this.findStoryCoverAssetById(input.id);
            if (!current) return null;
            return { status: 'conflict', revision: current.revision };
        }
        const asset = await this.findStoryCoverAssetById(input.id);
        if (!asset) throw new Error('Story cover asset disappeared after update');
        return {
            status: 'saved',
            asset,
            previousObjectKey: previous.object_key === asset.object_key
                ? null
                : previous.object_key
        };
    }

    async deleteStoryCoverAsset(id: number): Promise<WikiStoryCoverAssetDeleteResult> {
        const current = await this.findStoryCoverAssetById(id);
        if (!current) return { status: 'not-found' };
        if (current.usage_count) {
            return { status: 'in-use', usageCount: current.usage_count };
        }
        const deleted = await queryOne<{ object_key: string }>(this.database,
            `DELETE FROM wiki_story_cover_assets
             WHERE id=? AND NOT EXISTS (
                 SELECT 1 FROM wiki_story_cards WHERE cover_asset_id=?
             ) RETURNING object_key`,
            [id, id]
        );
        if (deleted) return { status: 'deleted', objectKey: deleted.object_key };
        const refreshed = await this.findStoryCoverAssetById(id);
        return refreshed
            ? { status: 'in-use', usageCount: refreshed.usage_count }
            : { status: 'not-found' };
    }

    async createStoryContentType(
        input: WikiStoryCatalogOptionInput
    ): Promise<WikiStoryContentTypeRecord> {
        const option = await queryOne<WikiStoryContentTypeRecord>(this.database,
            `INSERT INTO wiki_story_content_types
                (name, description, display_order, is_active)
             VALUES (?, ?, COALESCE((SELECT MAX(display_order) + 1
                                      FROM wiki_story_content_types), 0), ?)
             RETURNING id, name, description, display_order, is_active, revision`,
            [input.name, input.description, input.isActive]
        );
        if (!option) throw new Error('Wiki story content type was not created');
        return { ...option, is_active: booleanValue(option.is_active) };
    }

    async updateStoryContentType(
        id: number,
        expectedRevision: number,
        input: WikiStoryCatalogOptionInput
    ): Promise<WikiStoryCatalogSaveResult<WikiStoryContentTypeRecord> | null> {
        const option = await queryOne<WikiStoryContentTypeRecord>(this.database,
            `UPDATE wiki_story_content_types
             SET name=?, description=?, is_active=?, revision=revision+1
             WHERE id=? AND revision=?
             RETURNING id, name, description, display_order, is_active, revision`,
            [input.name, input.description, input.isActive, id, expectedRevision]
        );
        if (option) {
            return {
                status: 'saved',
                option: { ...option, is_active: booleanValue(option.is_active) }
            };
        }
        const current = (await this.listStoryContentTypes())
            .find((candidate) => candidate.id === id);
        return current ? { status: 'conflict', revision: current.revision } : null;
    }

    async deleteStoryContentType(id: number): Promise<WikiStoryCatalogDeleteResult> {
        const deleted = await queryOne<{ id: number }>(this.database,
            `DELETE FROM wiki_story_content_types
             WHERE id=? AND NOT EXISTS (
                 SELECT 1 FROM wiki_story_links WHERE content_type_id=?
             ) RETURNING id`,
            [id, id]
        );
        if (deleted) return { status: 'deleted' };
        const exists = (await this.listStoryContentTypes())
            .some((candidate) => candidate.id === id);
        return { status: exists ? 'in-use' : 'not-found' };
    }

    async createStorySourcePlatform(
        input: WikiStorySourcePlatformInput
    ): Promise<WikiStorySourcePlatformRecord> {
        const option = await queryOne<WikiStorySourcePlatformRecord>(this.database,
            `INSERT INTO wiki_story_source_platforms
                (name, homepage_url, description, display_order, is_active)
             VALUES (?, ?, ?, COALESCE((SELECT MAX(display_order) + 1
                                        FROM wiki_story_source_platforms), 0), ?)
             RETURNING id, name, homepage_url, description, display_order,
                       is_active, revision`,
            [input.name, input.homepageUrl, input.description, input.isActive]
        );
        if (!option) throw new Error('Wiki story source platform was not created');
        return { ...option, is_active: booleanValue(option.is_active) };
    }

    async updateStorySourcePlatform(
        id: number,
        expectedRevision: number,
        input: WikiStorySourcePlatformInput
    ): Promise<WikiStoryCatalogSaveResult<WikiStorySourcePlatformRecord> | null> {
        const option = await queryOne<WikiStorySourcePlatformRecord>(this.database,
            `UPDATE wiki_story_source_platforms
             SET name=?, homepage_url=?, description=?, is_active=?, revision=revision+1
             WHERE id=? AND revision=?
             RETURNING id, name, homepage_url, description, display_order,
                       is_active, revision`,
            [input.name, input.homepageUrl, input.description, input.isActive,
                id, expectedRevision]
        );
        if (option) {
            return {
                status: 'saved',
                option: { ...option, is_active: booleanValue(option.is_active) }
            };
        }
        const current = (await this.listStorySourcePlatforms())
            .find((candidate) => candidate.id === id);
        return current ? { status: 'conflict', revision: current.revision } : null;
    }

    async deleteStorySourcePlatform(id: number): Promise<WikiStoryCatalogDeleteResult> {
        const deleted = await queryOne<{ id: number }>(this.database,
            `DELETE FROM wiki_story_source_platforms
             WHERE id=? AND NOT EXISTS (
                 SELECT 1 FROM wiki_story_links WHERE source_platform_id=?
             ) RETURNING id`,
            [id, id]
        );
        if (deleted) return { status: 'deleted' };
        const exists = (await this.listStorySourcePlatforms())
            .some((candidate) => candidate.id === id);
        return { status: exists ? 'in-use' : 'not-found' };
    }

    async saveWikiLayout(input: WikiLayoutInput): Promise<WikiLayoutSaveResult> {
        const [agency, groups, idols] = await Promise.all([
            this.findAgencyById(input.agencyId),
            this.listWikiGroups(input.agencyId),
            queryAll<{ id: number }>(this.database,
                'SELECT id FROM idols WHERE agency_id=? ORDER BY id',
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
        const expectedIdols = new Set(idols.map((idol) => idol.id));
        const requestedIdols = input.groups.flatMap((group) => group.idolIds);
        if (input.groups.some((group) => new Set(group.idolIds).size !== group.idolIds.length) ||
            requestedIdols.some((id) => !expectedIdols.has(id))) {
            throw Object.assign(new Error('布局包含无效内容页，或同一栏目内存在重复内容页'), {
                status: 400
            });
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

    listStoryCards(agencyCode: string, idolId: number): Promise<StoryCardRecord[]> {
        return queryAll(this.database,
            `SELECT ${STORY_CARD_COLUMNS}
             FROM wiki_story_cards cards
             JOIN wiki_categories categories
               ON categories.id=cards.category_id AND categories.agency_id=cards.agency_id
             JOIN wiki_idol_categories assignments
               ON assignments.agency_id=cards.agency_id
              AND assignments.idol_id=cards.idol_id
              AND assignments.category_id=cards.category_id
             JOIN agencies agencies ON agencies.id=cards.agency_id
             WHERE agencies.code=? AND cards.idol_id=? AND cards.deleted_at IS NULL
             ORDER BY assignments.display_order, categories.id, cards.display_order, cards.id`,
            [agencyCode, idolId]
        );
    }

    listStories(agencyCode: string, idolId: number): Promise<StoryRecord[]> {
        return queryAll(this.database,
            `SELECT ${STORY_COLUMNS}
             FROM wiki_story_links links
             JOIN wiki_story_cards cards
               ON cards.id=links.card_id AND cards.agency_id=links.agency_id
             JOIN wiki_categories categories
               ON categories.id=cards.category_id AND categories.agency_id=cards.agency_id
             JOIN agencies agencies ON agencies.id=cards.agency_id
             WHERE agencies.code=? AND cards.idol_id=?
               AND cards.deleted_at IS NULL AND links.deleted_at IS NULL
             ORDER BY COALESCE(links.legacy_id, links.id)`,
            [agencyCode, idolId]
        );
    }

    async sampleStory(
        agencyCode: string,
        categories: readonly string[]
    ): Promise<(StoryRecord & { idol_name: string; agency_name: string }) | null> {
        if (!categories.length) return null;
        const placeholders = categories.map(() => '?').join(',');
        return queryOne(this.database,
            `SELECT ${STORY_COLUMNS}, idols.name_cn AS idol_name,
                    agencies.name_cn AS agency_name
             FROM wiki_story_links links
             JOIN wiki_story_cards cards
               ON cards.id=links.card_id AND cards.agency_id=links.agency_id
             JOIN wiki_categories categories
               ON categories.id=cards.category_id AND categories.agency_id=cards.agency_id
             JOIN agencies agencies ON agencies.id=cards.agency_id
             JOIN idols idols ON idols.id=cards.idol_id AND idols.agency_id=cards.agency_id
             WHERE agencies.code=? AND categories.name IN (${placeholders})
               AND idols.deleted_at IS NULL
               AND cards.deleted_at IS NULL AND links.deleted_at IS NULL
               AND (cards.image_file IS NOT NULL OR cards.cover_asset_id IS NOT NULL)
             ORDER BY RANDOM() LIMIT 1`,
            [agencyCode, ...categories]
        );
    }

    sampleWikiBackground(): Promise<WikiBackgroundRecord | null> {
        return queryOne(this.database,
            `SELECT ${STORY_COLUMNS}, agencies.id AS agency_id,
                    agencies.code AS agency_code, agencies.name_cn AS agency_name,
                    idols.name_cn AS idol_name, idols.folder_name AS idol_folder_name
             FROM wiki_story_links links
             JOIN wiki_story_cards cards
               ON cards.id=links.card_id AND cards.agency_id=links.agency_id
             JOIN wiki_categories categories
               ON categories.id=cards.category_id AND categories.agency_id=cards.agency_id
             JOIN agencies agencies ON agencies.id=cards.agency_id
             JOIN idols idols ON idols.id=cards.idol_id AND idols.agency_id=cards.agency_id
             LEFT JOIN wiki_story_cover_assets cover_assets
               ON cover_assets.id=cards.cover_asset_id
              AND cover_assets.agency_id=cards.agency_id
             WHERE agencies.wiki_enabled=TRUE AND idols.wiki_enabled=TRUE
               AND idols.deleted_at IS NULL
               AND cards.deleted_at IS NULL AND links.deleted_at IS NULL
               AND categories.background_eligible=TRUE
               AND (cards.image_file IS NOT NULL OR cards.cover_asset_id IS NOT NULL)
               AND (cards.cover_asset_id IS NULL
                    OR cover_assets.presentation_policy='inherit')
             ORDER BY RANDOM() LIMIT 1`
        );
    }

    async insertStoryReturningId(input: NewStoryInput): Promise<number> {
        const [id] = await this.insertStoryBatchReturningIds({
            agencyCode: input.agencyCode,
            idolId: input.idolId,
            category: input.category,
            cardName: input.cardName,
            subtitle: input.subtitle,
            imageFile: input.imageFile,
            coverAssetId: input.coverAssetId ?? null,
            imageTransform: input.imageTransform,
            links: [{
                upName: input.upName,
                videoTitle: input.videoTitle,
                url: input.url,
                contentTypeId: input.contentTypeId,
                sourcePlatformId: input.sourcePlatformId
            }]
        });
        return id;
    }

    async insertStoryBatchReturningIds(input: NewStoryBatchInput): Promise<number[]> {
        const coverAssetId = input.coverAssetId ?? null;
        if (input.imageFile && coverAssetId !== null) {
            throw httpError('剧情卡片不能同时使用共享素材和独立图片', 400);
        }
        if (coverAssetId !== null) {
            const [agency, asset] = await Promise.all([
                this.findAgencyByCode(input.agencyCode),
                this.findStoryCoverAssetById(coverAssetId)
            ]);
            if (!agency || !asset || asset.agency_id !== agency.id || !asset.is_active) {
                throw httpError('共享素材不属于所选企划或已停用', 400);
            }
        }
        let results;
        try {
            const statements = [
                sqlStatement(this.database,
                `INSERT INTO wiki_story_cards
                    (agency_id, idol_id, category_id, card_name, subtitle, image_file,
                     cover_asset_id,
                     image_fit, image_focal_x, image_focal_y, image_zoom,
                     image_rotation, display_order)
                 SELECT agencies.id, idols.id, categories.id, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                        COALESCE((SELECT MAX(display_order) + 1
                                  FROM wiki_story_cards
                                  WHERE idol_id=idols.id AND category_id=categories.id), 0)
                 FROM agencies
                 JOIN idols
                   ON idols.agency_id=agencies.id AND idols.id=?
                 JOIN wiki_categories categories
                   ON categories.agency_id=agencies.id AND categories.name=?
                 JOIN wiki_idol_categories assignments
                   ON assignments.agency_id=agencies.id
                  AND assignments.idol_id=idols.id
                  AND assignments.category_id=categories.id
                 WHERE agencies.code=?
                 ON CONFLICT (agency_id, idol_id, category_id, card_name) DO NOTHING`,
                [input.cardName, input.subtitle, input.imageFile, coverAssetId,
                    input.imageTransform.fit,
                    input.imageTransform.focalX, input.imageTransform.focalY,
                    input.imageTransform.zoom, input.imageTransform.rotation, input.idolId,
                    input.category, input.agencyCode]
                ),
                // A mismatched concurrent winner must abort the batch before a link can be added.
                sqlStatement(this.database,
                `INSERT INTO wiki_story_cards
                    (id, agency_id, idol_id, category_id, card_name, subtitle, image_file,
                     cover_asset_id,
                     image_fit, image_focal_x, image_focal_y, image_zoom, image_rotation,
                     image_media_revision, display_order)
                 SELECT cards.id, cards.agency_id, cards.idol_id, cards.category_id,
                        cards.card_name, cards.subtitle, cards.image_file,
                        cards.cover_asset_id, cards.image_fit,
                        cards.image_focal_x, cards.image_focal_y, cards.image_zoom,
                        cards.image_rotation, cards.image_media_revision, cards.display_order
                 FROM wiki_story_cards cards
                 JOIN agencies ON agencies.id=cards.agency_id
                 JOIN wiki_categories categories
                   ON categories.id=cards.category_id AND categories.agency_id=cards.agency_id
                 WHERE agencies.code=? AND cards.idol_id=?
                   AND categories.name=? AND cards.card_name=?
                   AND NOT (
                       (?='' OR COALESCE(cards.subtitle, '')=?)
                       AND (COALESCE(?, '')='' OR (
                           cards.image_file=? AND cards.image_fit=?
                           AND cards.image_focal_x=? AND cards.image_focal_y=?
                           AND cards.image_zoom=? AND cards.image_rotation=?
                       ))
                       AND (? IS NULL OR cards.cover_asset_id=?)
                   )`,
                [input.agencyCode, input.idolId, input.category, input.cardName,
                    input.subtitle, input.subtitle, input.imageFile, input.imageFile,
                    input.imageTransform.fit, input.imageTransform.focalX,
                    input.imageTransform.focalY, input.imageTransform.zoom,
                    input.imageTransform.rotation, coverAssetId, coverAssetId]
                )
            ];
            for (const link of input.links) {
                statements.push(sqlStatement(this.database,
                `INSERT INTO wiki_story_links
                    (agency_id, card_id, up_name, video_title, url,
                     content_type_id, source_platform_id, display_order)
                 SELECT cards.agency_id, cards.id, ?, ?, ?, ?, ?,
                        COALESCE((SELECT MAX(display_order) + 1
                                  FROM wiki_story_links WHERE card_id=cards.id), 0)
                 FROM wiki_story_cards cards
                 JOIN agencies ON agencies.id=cards.agency_id
                 JOIN wiki_categories categories
                   ON categories.id=cards.category_id AND categories.agency_id=cards.agency_id
                 WHERE agencies.code=? AND cards.idol_id=?
                   AND categories.name=? AND cards.card_name=?
                   AND (?='' OR COALESCE(cards.subtitle, '')=?)
                   AND (COALESCE(?, '')='' OR (
                       cards.image_file=? AND cards.image_fit=?
                       AND cards.image_focal_x=? AND cards.image_focal_y=?
                       AND cards.image_zoom=? AND cards.image_rotation=?
                   ))
                   AND (? IS NULL OR cards.cover_asset_id=?)
                 RETURNING id`,
                [link.upName, link.videoTitle, link.url, link.contentTypeId,
                    link.sourcePlatformId, input.agencyCode,
                    input.idolId, input.category, input.cardName,
                    input.subtitle, input.subtitle, input.imageFile, input.imageFile,
                    input.imageTransform.fit, input.imageTransform.focalX,
                    input.imageTransform.focalY, input.imageTransform.zoom,
                    input.imageTransform.rotation, coverAssetId, coverAssetId]
                ));
            }
            results = await this.database.batch(statements);
        } catch (error) {
            const existing = await this.findStoryCardByIdentity(
                input.agencyCode,
                input.idolId,
                input.category,
                input.cardName
            );
            if (existing && storyCardHasConflict(existing, input)) {
                throw httpError('该卡片已存在，请在卡片编辑中更新图片或副标题', 409);
            }
            throw error;
        }
        const ids = results.slice(2).map((result) => result.meta.last_row_id);
        if (ids.some((id) => !id)) {
            const existing = await this.findStoryCardByIdentity(
                input.agencyCode,
                input.idolId,
                input.category,
                input.cardName
            );
            if (existing && storyCardHasConflict(existing, input)) {
                throw httpError('该卡片已存在，请在卡片编辑中更新图片或副标题', 409);
            }
            throw new Error('Story insert did not return an ID');
        }
        return ids as number[];
    }

    async addStoryCardSources(
        input: AddStoryCardSourcesInput
    ): Promise<AddStoryCardSourcesResult> {
        if (!input.links.length || input.links.length > 20) {
            throw httpError('剧情卡片需要 1 至 20 个来源', 400);
        }
        const statements = [sqlStatement(this.database,
            `UPDATE wiki_story_cards
             SET image_media_revision=image_media_revision
             WHERE id=? AND idol_id=? AND image_media_revision=?
               AND agency_id=(SELECT id FROM agencies WHERE code=?)
             RETURNING id`,
            [input.cardId, input.idolId, input.expectedRevision, input.agencyCode]
        )];
        statements.push(...input.links.map((link) => sqlStatement(this.database,
            `INSERT INTO wiki_story_links
                (agency_id, card_id, up_name, video_title, url,
                 content_type_id, source_platform_id, display_order)
             SELECT cards.agency_id, cards.id, ?, ?, ?, ?, ?,
                    COALESCE((SELECT MAX(display_order) + 1
                              FROM wiki_story_links WHERE card_id=cards.id), 0)
             FROM wiki_story_cards cards
             JOIN agencies ON agencies.id=cards.agency_id
             WHERE cards.id=? AND cards.idol_id=? AND agencies.code=?
               AND cards.image_media_revision=?
             RETURNING id`,
            [link.upName, link.videoTitle, link.url, link.contentTypeId,
                link.sourcePlatformId, input.cardId, input.idolId,
                input.agencyCode, input.expectedRevision]
        )));
        const results = await this.database.batch(statements);
        const guarded = results[0]?.results[0] as { id?: unknown } | undefined;
        const ids = results.slice(1).map((result) => {
            const row = result.results[0] as { id?: unknown } | undefined;
            if (typeof row?.id === 'number') return row.id;
            return result.meta.changes ? result.meta.last_row_id : undefined;
        });
        if (typeof guarded?.id === 'number' &&
            ids.every((id): id is number => typeof id === 'number' && id > 0)) {
            return { status: 'added', ids, revision: input.expectedRevision };
        }
        const current = await this.findStoryCardById(
            input.agencyCode,
            input.idolId,
            input.cardId
        );
        if (!current) throw httpError('剧情卡片不存在', 404);
        if (current.image_media_revision !== input.expectedRevision) {
            return { status: 'conflict', revision: current.image_media_revision };
        }
        throw new Error('Story source insert did not return an ID');
    }

    async setStoryImage(agencyCode: string, id: number, imageFile: string): Promise<void> {
        await executeSql(this.database,
            `UPDATE wiki_story_cards
             SET image_file=?, cover_asset_id=NULL,
                 image_media_revision=image_media_revision+1
             WHERE id IN (
                 SELECT links.card_id
                 FROM wiki_story_links links
                 JOIN agencies ON agencies.id=links.agency_id
                 WHERE agencies.code=? AND COALESCE(links.legacy_id, links.id)=?
             )`,
            [imageFile, agencyCode, id]
        );
    }

    private findStoryCardByIdentity(
        agencyCode: string,
        idolId: number,
        category: string,
        cardName: string
    ): Promise<StoryCardRecord | null> {
        return queryOne(this.database,
            `SELECT ${STORY_CARD_COLUMNS}
             FROM wiki_story_cards cards
             JOIN wiki_categories categories
               ON categories.id=cards.category_id AND categories.agency_id=cards.agency_id
             JOIN agencies agencies ON agencies.id=cards.agency_id
             WHERE agencies.code=? AND cards.idol_id=?
               AND categories.name=? AND cards.card_name=? AND cards.deleted_at IS NULL`,
            [agencyCode, idolId, category, cardName]
        );
    }

    findFirstStoryByCard(
        agencyCode: string,
        idolId: number,
        category: string,
        cardName: string
    ): Promise<StoryRecord | null> {
        return queryOne(this.database,
            `SELECT ${STORY_COLUMNS}
             FROM wiki_story_links links
             JOIN wiki_story_cards cards
               ON cards.id=links.card_id AND cards.agency_id=links.agency_id
             JOIN wiki_categories categories
               ON categories.id=cards.category_id AND categories.agency_id=cards.agency_id
             JOIN agencies agencies ON agencies.id=cards.agency_id
             WHERE agencies.code=? AND cards.idol_id=?
               AND categories.name=? AND cards.card_name=?
               AND cards.deleted_at IS NULL AND links.deleted_at IS NULL
             ORDER BY links.display_order, links.id LIMIT 1`,
            [agencyCode, idolId, category, cardName]
        );
    }

    findStoryById(
        agencyCode: string,
        idolId: number,
        id: number
    ): Promise<StoryRecord | null> {
        return queryOne(this.database,
            `SELECT ${STORY_COLUMNS}
             FROM wiki_story_links links
             JOIN wiki_story_cards cards
               ON cards.id=links.card_id AND cards.agency_id=links.agency_id
             JOIN wiki_categories categories
               ON categories.id=cards.category_id AND categories.agency_id=cards.agency_id
             JOIN agencies agencies ON agencies.id=cards.agency_id
             WHERE agencies.code=? AND cards.idol_id=?
               AND COALESCE(links.legacy_id, links.id)=?
               AND cards.deleted_at IS NULL AND links.deleted_at IS NULL`,
            [agencyCode, idolId, id]
        );
    }

    findStoryCardById(
        agencyCode: string,
        idolId: number,
        cardId: number
    ): Promise<StoryCardRecord | null> {
        return queryOne(this.database,
            `SELECT ${STORY_CARD_COLUMNS}
             FROM wiki_story_cards cards
             JOIN wiki_categories categories
               ON categories.id=cards.category_id AND categories.agency_id=cards.agency_id
             JOIN agencies agencies ON agencies.id=cards.agency_id
             WHERE agencies.code=? AND cards.idol_id=? AND cards.id=?
               AND cards.deleted_at IS NULL`,
            [agencyCode, idolId, cardId]
        );
    }

    async updateStoryCard(input: UpdateStoryCardInput): Promise<WikiStoryCardSaveResult> {
        const category = (await this.listWikiCategories(
            (await this.findAgencyByCode(input.agencyCode))?.id ?? -1,
            input.idolId
        )).find((candidate) => candidate.id === input.categoryId);
        if (!category) throw httpError('分类不属于所选内容页', 400);
        const coverAssetId = input.coverAssetId ?? null;
        if (input.imageFile && coverAssetId !== null) {
            throw httpError('剧情卡片不能同时使用共享素材和独立图片', 400);
        }
        if (coverAssetId !== null) {
            const asset = await this.findStoryCoverAssetById(coverAssetId);
            const currentCard = await this.findStoryCardById(
                input.agencyCode,
                input.idolId,
                input.id
            );
            if (!asset || asset.agency_id !== category.agency_id ||
                (!asset.is_active && currentCard?.cover_asset_id !== coverAssetId)) {
                throw httpError('共享素材不属于所选企划或已停用', 400);
            }
        }
        const result = await executeSql(this.database,
            `UPDATE wiki_story_cards
             SET category_id=?, card_name=?, subtitle=?, image_file=?, cover_asset_id=?,
                 image_fit=?,
                 image_focal_x=?, image_focal_y=?, image_zoom=?, image_rotation=?,
                 image_media_revision=image_media_revision+1
             WHERE id=? AND idol_id=? AND image_media_revision=?
               AND agency_id=(SELECT id FROM agencies WHERE code=?)`,
            [input.categoryId, input.cardName, input.subtitle, input.imageFile,
                coverAssetId,
                input.imageTransform.fit, input.imageTransform.focalX,
                input.imageTransform.focalY, input.imageTransform.zoom,
                input.imageTransform.rotation, input.id, input.idolId,
                input.expectedRevision, input.agencyCode]
        );
        if (result.meta.changes) {
            return { status: 'saved', revision: input.expectedRevision + 1 };
        }
        const current = await this.findStoryCardById(
            input.agencyCode,
            input.idolId,
            input.id
        );
        if (!current) throw httpError('剧情卡片不存在', 404);
        return { status: 'conflict', revision: current.image_media_revision };
    }

    async deleteStoryLink(
        input: DeleteStoryLinkInput
    ): Promise<DeleteStoryLinkResult | null> {
        const story = await this.findStoryById(input.agencyCode, input.idolId, input.id);
        if (!story) return null;
        const results = await this.database.batch([
            sqlStatement(this.database,
                `UPDATE wiki_story_cards
                 SET image_media_revision=image_media_revision
                 WHERE id=? AND idol_id=? AND image_media_revision=?
                   AND agency_id=(SELECT id FROM agencies WHERE code=?)
                   AND EXISTS (
                       SELECT 1 FROM wiki_story_links links
                       WHERE links.card_id=wiki_story_cards.id
                         AND links.agency_id=wiki_story_cards.agency_id
                         AND COALESCE(links.legacy_id, links.id)=?
                   )
                 RETURNING id AS card_id, image_file, image_media_revision`,
                [story.card_id, input.idolId, input.expectedRevision,
                    input.agencyCode, input.id]
            ),
            sqlStatement(this.database,
                `DELETE FROM wiki_story_links
                 WHERE card_id=? AND COALESCE(legacy_id, id)=?
                   AND EXISTS (
                       SELECT 1
                       FROM wiki_story_cards cards
                       JOIN agencies ON agencies.id=cards.agency_id
                       WHERE cards.id=wiki_story_links.card_id
                         AND cards.agency_id=wiki_story_links.agency_id
                         AND cards.idol_id=? AND agencies.code=?
                         AND cards.image_media_revision=?
                   )
                 RETURNING legacy_image_file AS image_file`,
                [story.card_id, input.id, input.idolId, input.agencyCode,
                    input.expectedRevision]
            ),
            sqlStatement(this.database,
                `SELECT cards.image_file
                 FROM wiki_story_cards cards
                 JOIN agencies ON agencies.id=cards.agency_id
                 WHERE agencies.code=? AND cards.idol_id=? AND cards.image_file IS NOT NULL
                 UNION
                 SELECT links.legacy_image_file AS image_file
                 FROM wiki_story_links links
                 JOIN wiki_story_cards cards
                   ON cards.id=links.card_id AND cards.agency_id=links.agency_id
                 JOIN agencies ON agencies.id=cards.agency_id
                 WHERE agencies.code=? AND cards.idol_id=?
                   AND links.legacy_image_file IS NOT NULL`,
                [input.agencyCode, input.idolId, input.agencyCode, input.idolId]
            )
        ]);
        const guarded = results[0]?.results[0] as {
            image_file?: string | null;
            image_media_revision?: number;
        } | undefined;
        const deletedLink = results[1]?.results[0] as {
            image_file?: string | null;
        } | undefined;
        if (!guarded || !deletedLink) {
            const current = await this.findStoryById(
                input.agencyCode,
                input.idolId,
                input.id
            );
            if (!current) return null;
            return { status: 'conflict', revision: current.image_media_revision };
        }
        const referenced = new Set((results[2]?.results ?? []).map((row) =>
            (row as { image_file?: string | null }).image_file
        ).filter((value): value is string => Boolean(value)));
        const cleanupImageFiles = [...new Set([deletedLink.image_file]
            .filter((value): value is string => Boolean(value) && !referenced.has(value!))
        )];
        return {
            status: 'deleted',
            cardDeleted: false,
            revision: guarded.image_media_revision ?? input.expectedRevision,
            cleanupImageFiles
        };
    }

    async updateStory(input: UpdateStoryInput): Promise<void> {
        await this.updateStoryAndRenameGroup({ story: input });
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
        const results = await this.database.batch([
            sqlStatement(this.database,
                `UPDATE wiki_story_links
                 SET up_name=?, video_title=?, url=?, content_type_id=?,
                     source_platform_id=?
                 WHERE id IN (
                     SELECT links.id
                     FROM wiki_story_links links
                     JOIN wiki_story_cards cards
                       ON cards.id=links.card_id AND cards.agency_id=links.agency_id
                     JOIN agencies ON agencies.id=cards.agency_id
                     WHERE agencies.code=? AND cards.idol_id=?
                       AND COALESCE(links.legacy_id, links.id)=?
                       AND cards.image_media_revision=?
                 )`,
                [input.story.upName, input.story.videoTitle, input.story.url,
                    input.story.contentTypeId, input.story.sourcePlatformId,
                    input.story.agencyCode, input.story.idolId, input.story.id,
                    input.story.expectedMediaRevision]
            ),
            sqlStatement(this.database,
                `UPDATE wiki_story_cards
                 SET category_id=(
                         SELECT categories.id
                         FROM wiki_categories categories
                         JOIN agencies ON agencies.id=categories.agency_id
                         JOIN wiki_idol_categories assignments
                           ON assignments.agency_id=categories.agency_id
                          AND assignments.category_id=categories.id
                          AND assignments.idol_id=?
                         WHERE agencies.code=? AND categories.name=?
                     ),
                     card_name=?, subtitle=?, image_file=?, cover_asset_id=?, image_fit=?,
                     image_focal_x=?, image_focal_y=?, image_zoom=?, image_rotation=?,
                     image_media_revision=image_media_revision+1
                 WHERE image_media_revision=? AND id IN (
                     SELECT links.card_id
                     FROM wiki_story_links links
                     JOIN wiki_story_cards selected
                       ON selected.id=links.card_id AND selected.agency_id=links.agency_id
                     JOIN agencies ON agencies.id=selected.agency_id
                     WHERE agencies.code=? AND selected.idol_id=?
                       AND COALESCE(links.legacy_id, links.id)=?
                 )`,
                [input.story.idolId, input.story.agencyCode, input.story.category,
                    input.story.cardName, input.story.subtitle, input.story.imageFile,
                    input.story.coverAssetId ?? null,
                    input.story.imageTransform.fit, input.story.imageTransform.focalX,
                    input.story.imageTransform.focalY, input.story.imageTransform.zoom,
                    input.story.imageTransform.rotation, input.story.expectedMediaRevision,
                    input.story.agencyCode, input.story.idolId, input.story.id]
            )
        ]);
        if (!results[1]?.meta.changes) {
            const current = await this.findStoryById(
                input.story.agencyCode,
                input.story.idolId,
                input.story.id
            );
            if (!current) throw httpError('找不到要修改的剧情', 404);
            if (current.image_media_revision !== input.story.expectedMediaRevision) {
                throw Object.assign(new Error('剧情图片已被其他编辑更新'), {
                    status: 409,
                    revision: current.image_media_revision
                });
            }
            throw httpError('剧情未能更新', 409);
        }
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
            `UPDATE wiki_story_cards
             SET category_id=(
                     SELECT categories.id
                     FROM wiki_categories categories
                     JOIN agencies ON agencies.id=categories.agency_id
                     WHERE agencies.code=? AND categories.name=?
                 ), card_name=?, subtitle=?
             WHERE id IN (
                 SELECT cards.id
                 FROM wiki_story_cards cards
                 JOIN wiki_categories categories
                   ON categories.id=cards.category_id AND categories.agency_id=cards.agency_id
                 JOIN agencies ON agencies.id=cards.agency_id
                 WHERE agencies.code=? AND cards.idol_id=?
                   AND categories.name=? AND cards.card_name=?
             )`,
            [input.agencyCode, input.category, input.cardName, input.subtitle,
                input.agencyCode, input.idolId, input.oldCategory, input.oldCardName]
        );
    }

    async listStoryGroupForDelete(
        agencyCode: string,
        idolId: number,
        category: string,
        cardName: string
    ): Promise<StoryRecord[]> {
        const rows = await queryAll<StoryRecord>(this.database,
            `SELECT ${STORY_CLEANUP_COLUMNS}
             FROM wiki_story_links links
             JOIN wiki_story_cards cards
               ON cards.id=links.card_id AND cards.agency_id=links.agency_id
             JOIN wiki_categories categories
               ON categories.id=cards.category_id AND categories.agency_id=cards.agency_id
             JOIN agencies agencies ON agencies.id=cards.agency_id
             WHERE agencies.code=? AND cards.idol_id=?
               AND categories.name=? AND cards.card_name=?
             ORDER BY links.display_order, links.id`,
            [agencyCode, idolId, category, cardName]
        );
        const current = await queryOne<StoryRecord>(this.database,
            `SELECT ${STORY_COLUMNS}
             FROM wiki_story_links links
             JOIN wiki_story_cards cards
               ON cards.id=links.card_id AND cards.agency_id=links.agency_id
             JOIN wiki_categories categories
               ON categories.id=cards.category_id AND categories.agency_id=cards.agency_id
             JOIN agencies agencies ON agencies.id=cards.agency_id
             WHERE agencies.code=? AND cards.idol_id=?
               AND categories.name=? AND cards.card_name=?
             ORDER BY links.display_order, links.id LIMIT 1`,
            [agencyCode, idolId, category, cardName]
        );
        if (current?.image_file && !rows.some((row) => row.image_file === current.image_file)) {
            rows.push(current);
        }
        return rows;
    }

    async deleteStoryGroup(
        agencyCode: string,
        idolId: number,
        category: string,
        cardName: string
    ): Promise<void> {
        await executeSql(this.database,
            `DELETE FROM wiki_story_cards
             WHERE id IN (
                 SELECT cards.id
                 FROM wiki_story_cards cards
                 JOIN wiki_categories categories
                   ON categories.id=cards.category_id AND categories.agency_id=cards.agency_id
                 JOIN agencies ON agencies.id=cards.agency_id
                 WHERE agencies.code=? AND cards.idol_id=?
                   AND categories.name=? AND cards.card_name=?
             )`,
            [agencyCode, idolId, category, cardName]
        );
    }

    listCategoryImages(
        agencyCode: string,
        idolId: number,
        category: string
    ): Promise<Array<{ image_file: string | null }>> {
        return queryAll(this.database,
            `SELECT image_file FROM (
                 SELECT cards.image_file AS image_file
                 FROM wiki_story_cards cards
                 JOIN wiki_categories categories
                   ON categories.id=cards.category_id
                  AND categories.agency_id=cards.agency_id
                 JOIN agencies ON agencies.id=cards.agency_id
                 WHERE agencies.code=? AND cards.idol_id=? AND categories.name=?
                 UNION
                 SELECT links.legacy_image_file AS image_file
                 FROM wiki_story_links links
                 JOIN wiki_story_cards cards
                   ON cards.id=links.card_id AND cards.agency_id=links.agency_id
                 JOIN wiki_categories categories
                   ON categories.id=cards.category_id
                  AND categories.agency_id=cards.agency_id
                 JOIN agencies ON agencies.id=cards.agency_id
                 WHERE agencies.code=? AND cards.idol_id=? AND categories.name=?
                   AND links.legacy_image_file IS NOT NULL
             ) images`,
            [agencyCode, idolId, category, agencyCode, idolId, category]
        );
    }

    async deleteCategory(agencyCode: string, idolId: number, category: string): Promise<void> {
        await executeSql(this.database,
            `DELETE FROM wiki_story_cards
             WHERE id IN (
                 SELECT cards.id
                 FROM wiki_story_cards cards
                 JOIN wiki_categories categories
                   ON categories.id=cards.category_id AND categories.agency_id=cards.agency_id
                 JOIN agencies ON agencies.id=cards.agency_id
                 WHERE agencies.code=? AND cards.idol_id=? AND categories.name=?
             )`,
            [agencyCode, idolId, category]
        );
    }
}

export { SqlStoryRepository as SqliteStoryRepository };
