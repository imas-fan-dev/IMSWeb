import type {
    AgencyRecord,
    CreateWikiAgencyInput,
    CreateWikiGroupInput,
    CreateWikiIdolInput,
    DeleteWikiGroupInput,
    DeleteWikiIdolInput,
    IdolRecord,
    IdolWithAgencyRecord,
    SaveWikiEntityMediaInput,
    UpdateWikiAgencyInput,
    UpdateWikiCategoryInput,
    UpdateWikiGroupInput,
    UpdateWikiIdolInput,
    WikiCategoryRecord,
    WikiCategorySaveResult,
    WikiEntityMediaSaveResult,
    WikiGroupDeleteResult,
    WikiGroupMemberRecord,
    WikiGroupRecord,
    WikiIdolDeleteResult,
    WikiLayoutInput,
    WikiLayoutSaveResult
} from '@/ports/repositories';
import type { ManagedSqlDatabase } from '@/infra/db/sql/database';
import { executeSql, queryAll, queryOne, sqlStatement } from '@/infra/db/sql/query';
import {
    AGENCY_COLUMNS,
    GROUP_COLUMNS,
    IDOL_COLUMNS,
    agencyRecord,
    categoryRecord,
    groupRecord,
    idolRecord
} from '@/infra/db/repositories/story-rows';
import { WikiLayoutRevisionConflict, httpError } from '@/infra/db/repositories/story-conflicts';

export class SqlWikiEntityRepository {
    constructor(private readonly database: ManagedSqlDatabase) {}

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
                    i.wiki_url,
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
                    ic.display_order, ic.show_when_empty, c.revision
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
                 text_color, wiki_url, avatar_fit, entry_kind, entry_subtype)
             SELECT ?, ?, ?, ?, ?, COALESCE(MAX(display_order) + 1, 0), ?, ?, ?, ?, ?
             FROM idols WHERE agency_id=?`,
            [input.agencyId, input.name, input.folderName, input.color, input.wikiEnabled,
                input.textColor, input.wikiUrl ?? null, input.imageFit,
                input.entryKind ?? 'idol',
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
                     wiki_url=?, entry_kind=?, entry_subtype=?
                 WHERE id=?`,
                [input.name, input.color, input.textColor, input.imageFit,
                    input.wikiEnabled,
                    input.wikiUrl === undefined ? idol.wiki_url : input.wikiUrl,
                    input.entryKind ?? idol.entry_kind,
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
                    ic.display_order, ic.show_when_empty, c.revision
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
             SET name=?, revision=revision+1
             WHERE id=? AND agency_id=? AND EXISTS (
                 SELECT 1
                 FROM wiki_idol_categories assignments
                 WHERE assignments.agency_id=wiki_categories.agency_id
                   AND assignments.category_id=wiki_categories.id
                   AND assignments.idol_id=?
             ) AND name=?
             RETURNING id, agency_id, name, storage_slug, background_eligible, revision,
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
        return {
            status: 'conflict',
            currentName: current.name,
            revision: current.revision
        };
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
        try {
            await this.database.transaction(async (database) => {
                const revisionGuard = `EXISTS (
                    SELECT 1 FROM agencies WHERE id=? AND layout_revision=?
                )`;
                const statements = [sqlStatement(database,
                    `DELETE FROM wiki_group_members WHERE agency_id=? AND ${revisionGuard}`,
                    [input.agencyId, input.agencyId, input.expectedRevision]
                )];
                for (const group of input.groups) {
                    group.idolIds.forEach((idolId, displayOrder) => {
                        statements.push(sqlStatement(database,
                            `INSERT INTO wiki_group_members
                                (agency_id, group_id, idol_id, display_order)
                             SELECT ?, ?, ?, ? WHERE ${revisionGuard}`,
                            [input.agencyId, group.id, idolId, displayOrder,
                                input.agencyId, input.expectedRevision]
                        ));
                    });
                }
                statements.push(sqlStatement(database,
                    `UPDATE agencies SET layout_revision=layout_revision+1
                     WHERE id=? AND layout_revision=?`,
                    [input.agencyId, input.expectedRevision]
                ));
                const results = await database.batch(statements);
                if (!results.at(-1)?.meta.changes) {
                    throw new WikiLayoutRevisionConflict();
                }
            });
        } catch (error) {
            if (!(error instanceof WikiLayoutRevisionConflict)) throw error;
            const current = await this.findAgencyById(input.agencyId);
            return { status: 'conflict', revision: current?.layout_revision ?? agency.layout_revision };
        }
        return { status: 'saved', revision: input.expectedRevision + 1 };
    }
}
