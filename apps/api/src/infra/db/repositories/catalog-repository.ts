import type {
    AdminCatalogBindingRequest,
    AdminCatalogStoryTargetResponse,
    AdminCatalogCreateCharacterRequest,
    AdminCatalogDefaultProfileRequest,
    AdminCatalogGroupKindRequest,
    AdminCatalogMediaRequest,
    AdminCatalogProfileRequest,
} from '@imsweb/contracts/catalog';
import type {
    CatalogProfileRecord,
    BirthdayProfileRecord,
    CatalogRepository,
    CatalogSnapshotRecord,
} from '@/ports/repositories/catalog';
import type { ManagedSqlDatabase, SqlDatabase } from '@/infra/db/sql/database';
import { executeSql, queryAll, queryOne } from '@/infra/db/sql/query';

const profileTable = (kind: 'character' | 'group') =>
    kind === 'character'
        ? 'catalog_character_project_profiles'
        : 'catalog_group_project_profiles';
const ownerTable = (kind: 'character' | 'group') =>
    kind === 'character' ? 'catalog_characters' : 'catalog_groups';
const ownerColumn = (kind: 'character' | 'group') =>
    kind === 'character' ? 'character_id' : 'group_id';
function fail(message: string, status = 409): never {
    throw Object.assign(new Error(message), { status });
}

function profileColumns(kind: 'character' | 'group'): string {
    const character = kind === 'character';
    const image = character ? 'avatar' : 'image';
    return `id, ${ownerColumn(kind)} AS "ownerId", project_id AS "projectId",
        name_cn AS "nameCn", name_ja AS "nameJa", name_en AS "nameEn",
        ${character ? 'aliases' : 'NULL::text'} AS aliases,
        ${character ? 'category' : 'NULL::text'} AS category,
        ${character ? 'display_order' : 'NULL::integer'} AS "displayOrder",
        ${character ? 'is_fallback' : 'FALSE'} AS "isFallback",
        ${character ? 'representative_color' : 'color'} AS color,
        ${character ? 'birth_month' : 'NULL::integer'} AS "birthMonth",
        ${character ? 'birth_day' : 'NULL::integer'} AS "birthDay",
        ${character ? 'biography' : 'description'} AS biography,
        ${character ? 'voice_status' : "'unknown'::text"} AS "voiceStatus",
        ${character ? 'cv_name' : 'NULL::text'} AS "cvName",
        ${character ? 'profile_url' : 'NULL::text'} AS "profileUrl",
        ${image}_object_key AS "imageObjectKey", ${image}_media_revision AS "mediaRevision", revision,
        json_build_object('fit',${image}_fit,'focalX',${image}_focal_x,'focalY',${image}_focal_y,
            'zoom',${image}_zoom,'rotation',${image}_rotation) AS "imageTransform"`;
}

export class SqlCatalogRepository implements CatalogRepository {
    constructor(private readonly database: ManagedSqlDatabase) {}

    listBirthdayProfiles(): Promise<BirthdayProfileRecord[]> {
        return queryAll(
            this.database,
            `SELECT c.id AS "characterId",p.id AS "profileId",p.project_id AS "projectId",
                c.default_profile_id AS "defaultProfileId",p.name_cn AS name,a.name_cn AS agency,
                COALESCE(p.representative_color,a.color) AS color,p.birth_month AS "birthMonth",p.birth_day AS "birthDay",
                p.category,p.is_fallback AS "isFallback"
             FROM catalog_characters c JOIN catalog_character_project_profiles p ON p.character_id=c.id
             JOIN projects a ON a.id=p.project_id
             WHERE c.deleted_at IS NULL AND p.category='idol' AND NOT p.is_fallback
                AND p.birth_month IS NOT NULL AND p.birth_day IS NOT NULL
             ORDER BY a.display_order,a.id,p.display_order,c.id,p.id`,
        );
    }

    async ensureCharacterStoryTarget(
        profileId: number,
    ): Promise<AdminCatalogStoryTargetResponse> {
        return this.database.transaction(async (database) => {
            const profile = await queryOne<{
                characterId: number;
                projectId: number;
                projectCode: string;
                name: string;
            }>(
                database,
                `SELECT p.character_id AS "characterId",p.project_id AS "projectId",a.code AS "projectCode",p.name_cn AS name
                 FROM catalog_character_project_profiles p JOIN catalog_characters c ON c.id=p.character_id
                 JOIN projects a ON a.id=p.project_id WHERE p.id=? AND c.deleted_at IS NULL AND NOT p.is_fallback FOR UPDATE OF c,p`,
                [profileId],
            );
            if (!profile) fail('角色档案不存在、已停用或属于通用兜底选项', 404);
            let entry = await queryOne<{ id: number }>(
                database,
                'SELECT id FROM wiki_entries WHERE character_profile_id=? AND deleted_at IS NULL',
                [profileId],
            );
            if (!entry) {
                const duplicate = await queryOne(
                    database,
                    `SELECT id FROM idols WHERE agency_id=? AND (name_cn=? OR folder_name=?)`,
                    [
                        profile.projectId,
                        profile.name,
                        `character_profile_${profileId}`,
                    ],
                );
                if (duplicate)
                    fail(
                        '已有同名内容条目，请先在 Wiki 条目管理中关联到此角色档案',
                    );
                entry = await queryOne<{ id: number }>(
                    database,
                    `INSERT INTO wiki_entries(project_id,character_profile_id,local_name_cn,storage_slug,display_order)
                     SELECT ?,?,?,?,COALESCE(MAX(display_order)+1,0) FROM wiki_entries WHERE project_id=? RETURNING id`,
                    [
                        profile.projectId,
                        profileId,
                        profile.name,
                        `character_profile_${profileId}`,
                        profile.projectId,
                    ],
                );
                await executeSql(
                    database,
                    'UPDATE wiki_project_settings SET layout_revision=layout_revision+1 WHERE project_id=?',
                    [profile.projectId],
                );
            }
            if (!entry) fail('角色剧情关联创建失败', 500);
            return {
                success: true,
                entryId: entry.id,
                characterId: profile.characterId,
                profileId,
                projectId: profile.projectId,
                projectCode: profile.projectCode,
            };
        });
    }

    async snapshot(): Promise<CatalogSnapshotRecord> {
        const [
            projects,
            characters,
            groups,
            characterProfiles,
            groupProfiles,
            entries,
            navigationGroups,
        ] = await Promise.all([
            queryAll<CatalogSnapshotRecord['projects'][number]>(
                this.database,
                'SELECT id,code,name_cn AS name FROM projects ORDER BY display_order,id',
            ),
            queryAll<
                Omit<CatalogSnapshotRecord['characters'][number], 'profiles'>
            >(
                this.database,
                `SELECT c.id,p.name_cn AS name,p.is_fallback AS "isFallback",c.deleted_at IS NOT NULL AS retired,
                    c.default_profile_id AS "defaultProfileId",c.revision
                 FROM catalog_characters c JOIN catalog_character_project_profiles p ON p.id=c.default_profile_id
                 ORDER BY p.display_order,c.id`,
            ),
            queryAll<Omit<CatalogSnapshotRecord['groups'][number], 'profiles'>>(
                this.database,
                `SELECT id,name_cn AS name,kind,deleted_at IS NOT NULL AS retired,revision
                 FROM catalog_groups ORDER BY display_order,id`,
            ),
            queryAll<CatalogProfileRecord>(
                this.database,
                `SELECT ${profileColumns('character')} FROM catalog_character_project_profiles ORDER BY display_order,id`,
            ),
            queryAll<CatalogProfileRecord>(
                this.database,
                `SELECT ${profileColumns('group')} FROM catalog_group_project_profiles ORDER BY display_order,id`,
            ),
            queryAll<CatalogSnapshotRecord['entries'][number]>(
                this.database,
                `SELECT e.id,e.project_id AS "projectId",v.name_cn AS name,e.character_profile_id AS "characterProfileId",
                    e.group_profile_id AS "groupProfileId",e.binding_revision AS revision
                 FROM wiki_entries e JOIN idols v ON v.id=e.id WHERE e.deleted_at IS NULL ORDER BY e.id`,
            ),
            queryAll<CatalogSnapshotRecord['navigationGroups'][number]>(
                this.database,
                `SELECT n.id,n.project_id AS "projectId",v.name,n.group_profile_id AS "groupProfileId",n.binding_revision AS revision
                 FROM wiki_navigation_groups n JOIN wiki_groups v ON v.id=n.id ORDER BY n.id`,
            ),
        ]);
        return {
            success: true,
            projects,
            entries,
            navigationGroups,
            characters: characters.map((c) => ({
                ...c,
                profiles: characterProfiles.filter((p) => p.ownerId === c.id),
            })),
            groups: groups.map((g) => ({
                ...g,
                profiles: groupProfiles.filter((p) => p.ownerId === g.id),
            })),
        };
    }

    async saveProfile(input: AdminCatalogProfileRequest): Promise<void> {
        await this.database.transaction(async (database) => {
            const owner = await queryOne(
                database,
                `SELECT id FROM ${ownerTable(input.kind)}
                 WHERE id=? AND deleted_at IS NULL FOR UPDATE`,
                [input.ownerId],
            );
            if (!owner) fail('资料对象不存在或已停用', 404);
            if (input.kind === 'character' && input.revision === null) {
                const fallback = await queryOne(
                    database,
                    `SELECT p.id FROM catalog_characters c JOIN catalog_character_project_profiles p ON p.id=c.default_profile_id
                     WHERE c.id=? AND p.is_fallback`,
                    [input.ownerId],
                );
                if (fallback) fail('兜底身份不能新增人物企划档案', 400);
            }
            await this.writeProfile(database, input);
        });
    }

    async createCharacter(
        input: AdminCatalogCreateCharacterRequest,
        actorId: number,
    ): Promise<{ characterId: number; profileId: number }> {
        return this.database.transaction(async (database) => {
            const owner = await queryOne<{ id: number }>(
                database,
                'INSERT INTO catalog_characters(created_by,updated_by) VALUES (?,?) RETURNING id',
                [actorId, actorId],
            );
            if (!owner) fail('人物身份创建失败', 500);
            const profileId = await this.writeProfile(database, {
                ...input,
                kind: 'character',
                ownerId: owner.id,
                revision: null,
            });
            await executeSql(
                database,
                'UPDATE catalog_characters SET default_profile_id=? WHERE id=?',
                [profileId, owner.id],
            );
            return { characterId: owner.id, profileId };
        });
    }

    async setDefaultProfile(
        input: AdminCatalogDefaultProfileRequest,
    ): Promise<void> {
        await this.database.transaction(async (database) => {
            const owner = await queryOne<{
                revision: number;
                is_fallback: boolean;
            }>(
                database,
                `SELECT c.revision,p.is_fallback FROM catalog_characters c JOIN catalog_character_project_profiles p ON p.id=c.default_profile_id
                 WHERE c.id=? AND c.deleted_at IS NULL FOR UPDATE OF c`,
                [input.ownerId],
            );
            if (!owner) fail('人物不存在或已停用', 404);
            if (owner.revision !== input.revision)
                fail('默认档案已变更，请刷新后重试');
            const target = await queryOne<{ is_fallback: boolean }>(
                database,
                'SELECT is_fallback FROM catalog_character_project_profiles WHERE id=? AND character_id=? FOR UPDATE',
                [input.profileId, input.ownerId],
            );
            if (!target) fail('默认档案必须属于当前人物', 400);
            if (owner.is_fallback || target.is_fallback)
                fail('兜底身份不能切换为人物默认档案', 400);
            await executeSql(
                database,
                'UPDATE catalog_characters SET default_profile_id=?,revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=?',
                [input.profileId, input.ownerId],
            );
        });
    }

    private async writeProfile(
        database: SqlDatabase,
        input: AdminCatalogProfileRequest,
    ): Promise<number> {
        const project = await queryOne(
            database,
            'SELECT id FROM projects WHERE id=?',
            [input.projectId],
        );
        if (!project) fail('企划不存在', 400);
        const character = input.kind === 'character';
        const columns = character
            ? [
                  'name_cn',
                  'name_ja',
                  'name_en',
                  'representative_color',
                  'biography',
                  'birth_month',
                  'birth_day',
                  'voice_status',
                  'profile_url',
                  'cv_name',
                  'aliases',
                  'category',
                  'display_order',
                  'is_fallback',
              ]
            : ['name_cn', 'name_ja', 'name_en', 'color', 'description'];
        const values: unknown[] = [
            input.nameCn,
            input.nameJa,
            input.nameEn,
            input.color,
            input.biography,
        ];
        if (character)
            values.push(
                input.birthMonth,
                input.birthDay,
                input.voiceStatus,
                input.profileUrl,
                input.cvName,
                input.aliases,
                input.category,
                input.displayOrder,
                input.isFallback,
            );
        let saved: { id: number } | null;
        if (input.revision === null) {
            saved = character
                ? await queryOne<{ id: number }>(
                      database,
                      `INSERT INTO catalog_character_project_profiles(character_id,project_id,${columns.join(',')}) VALUES (?, ?, ${values.map(() => '?').join(',')})
                     ON CONFLICT(character_id,project_id) DO NOTHING RETURNING id`,
                      [input.ownerId, input.projectId, ...values],
                  )
                : await queryOne<{ id: number }>(
                      database,
                      `INSERT INTO ${profileTable(input.kind)} (${ownerColumn(input.kind)},project_id,${columns.join(',')},display_order)
                     SELECT ?, ?, ${values.map(() => '?').join(',')},COALESCE(MAX(display_order)+1,0)
                     FROM ${profileTable(input.kind)} WHERE ${ownerColumn(input.kind)}=?
                     ON CONFLICT (${ownerColumn(input.kind)},project_id) DO NOTHING RETURNING id`,
                      [
                          input.ownerId,
                          input.projectId,
                          ...values,
                          input.ownerId,
                      ],
                  );
        } else {
            saved = await queryOne<{ id: number }>(
                database,
                `UPDATE ${profileTable(input.kind)} SET ${columns.map((c) => `${c}=?`).join(',')},revision=revision+1
                     WHERE ${ownerColumn(input.kind)}=? AND project_id=? AND revision=? RETURNING id`,
                [...values, input.ownerId, input.projectId, input.revision],
            );
        }
        if (!saved) fail('档案已变更，请刷新后重试');
        if (input.kind === 'group' && input.revision === null) {
            await executeSql(
                database,
                'UPDATE catalog_groups SET revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=?',
                [input.ownerId],
            );
        }
        return saved.id;
    }

    async saveGroupKind(input: AdminCatalogGroupKindRequest): Promise<void> {
        const saved = await queryOne(
            this.database,
            `UPDATE catalog_groups SET kind=?,revision=revision+1,updated_at=CURRENT_TIMESTAMP
             WHERE id=? AND revision=? AND deleted_at IS NULL RETURNING id`,
            [input.kind, input.id, input.revision],
        );
        if (!saved) fail('组合已变更，请刷新后重试');
    }

    async saveBinding(input: AdminCatalogBindingRequest): Promise<void> {
        await this.database.transaction(async (database) => {
            const table =
                input.kind === 'entry'
                    ? 'wiki_entries'
                    : 'wiki_navigation_groups';
            const target = await queryOne<{
                project_id: number;
                character_profile_id?: number | null;
                group_profile_id: number | null;
            }>(
                database,
                `SELECT project_id,group_profile_id${input.kind === 'entry' ? ',character_profile_id' : ''} FROM ${table} WHERE id=? AND binding_revision=?
                 ${input.kind === 'entry' ? 'AND deleted_at IS NULL' : ''} FOR UPDATE`,
                [input.id, input.revision],
            );
            if (!target) fail('条目已变更，请刷新后重试');
            if (
                target.character_profile_id &&
                (input.source !== 'character' ||
                    input.profileId !== target.character_profile_id)
            ) {
                const story = await queryOne(
                    database,
                    'SELECT id FROM wiki_story_cards WHERE idol_id=? LIMIT 1',
                    [input.id],
                );
                if (story)
                    fail(
                        '此条目已有角色剧情，不能解除或改绑角色档案；请在角色档案维护共用资料',
                    );
            }
            // Serialize detachment with image replacement so a copied image
            // cannot become unreferenced while the detach transaction commits.
            if (target.character_profile_id)
                await queryOne(
                    database,
                    'SELECT id FROM catalog_character_project_profiles WHERE id=? FOR UPDATE',
                    [target.character_profile_id],
                );
            if (target.group_profile_id)
                await queryOne(
                    database,
                    'SELECT id FROM catalog_group_project_profiles WHERE id=? FOR UPDATE',
                    [target.group_profile_id],
                );
            if (input.source !== 'independent') {
                const kind = input.source;
                const profile = await queryOne(
                    database,
                    `SELECT p.id FROM ${profileTable(kind)} p JOIN ${ownerTable(kind)} o ON o.id=p.${ownerColumn(kind)}
                     WHERE p.id=? AND p.project_id=? AND o.deleted_at IS NULL
                     ${kind === 'character' ? 'AND NOT p.is_fallback' : ''}`,
                    [input.profileId, target.project_id],
                );
                if (!profile)
                    fail('目标档案不存在、已停用或不属于当前企划', 400);
            }
            // Capture the effective presentation before detaching, preserving
            // the media reference rather than deleting a shared object.
            if (input.source === 'independent' && input.kind === 'entry') {
                await executeSql(
                    database,
                    `UPDATE wiki_entries e SET local_name_cn=v.name_cn,local_accent_color=v.color,
                        local_image_object_key=v.avatar_object_key,local_image_fit=v.avatar_fit,local_image_focal_x=v.avatar_focal_x,
                        local_image_focal_y=v.avatar_focal_y,local_image_zoom=v.avatar_zoom,local_image_rotation=v.avatar_rotation,
                        local_image_media_revision=GREATEST(e.local_image_media_revision,v.avatar_media_revision)+1
                     FROM idols v WHERE e.id=? AND v.id=e.id`,
                    [input.id],
                );
            } else if (input.source === 'independent') {
                await executeSql(
                    database,
                    `UPDATE wiki_navigation_groups n SET name=v.name,color=v.color,icon_object_key=v.icon_object_key,
                        icon_fit=v.icon_fit,icon_focal_x=v.icon_focal_x,icon_focal_y=v.icon_focal_y,
                        icon_zoom=v.icon_zoom,icon_rotation=v.icon_rotation,
                        icon_media_revision=GREATEST(n.icon_media_revision,v.icon_media_revision)+1
                     FROM wiki_groups v WHERE n.id=? AND v.id=n.id`,
                    [input.id],
                );
            }
            const character =
                input.kind === 'entry' ? 'character_profile_id=?,' : '';
            const values: unknown[] =
                input.kind === 'entry'
                    ? [input.source === 'character' ? input.profileId : null]
                    : [];
            values.push(
                input.source === 'group' ? input.profileId : null,
                input.id,
                input.revision,
            );
            await executeSql(
                database,
                `UPDATE ${table} SET ${character}group_profile_id=?,binding_revision=binding_revision+1
                 WHERE id=? AND binding_revision=?`,
                values,
            );
            await executeSql(
                database,
                'UPDATE wiki_project_settings SET layout_revision=layout_revision+1 WHERE project_id=?',
                [target.project_id],
            );
        });
    }

    findProfile(
        kind: 'character' | 'group',
        id: number,
    ): Promise<CatalogProfileRecord | null> {
        return queryOne(
            this.database,
            `SELECT ${profileColumns(kind)} FROM ${profileTable(kind)} WHERE id=?`,
            [id],
        );
    }

    async saveMedia(
        input: AdminCatalogMediaRequest,
        objectKey: string | null,
    ): Promise<string | null> {
        return this.database.transaction(async (database) => {
            const prefix = input.kind === 'character' ? 'avatar' : 'image';
            const row = await queryOne<{
                object_key: string | null;
                revision: number;
            }>(
                database,
                `SELECT ${prefix}_object_key AS object_key,${prefix}_media_revision AS revision
                 FROM ${profileTable(input.kind)} WHERE id=? FOR UPDATE`,
                [input.id],
            );
            if (!row) fail('档案不存在', 404);
            if (row.revision !== input.revision)
                fail('图片已变更，请刷新后重试');
            const t = input.imageTransform;
            await executeSql(
                database,
                `UPDATE ${profileTable(input.kind)} SET ${prefix}_object_key=?,${prefix}_fit=?,${prefix}_focal_x=?,
                    ${prefix}_focal_y=?,${prefix}_zoom=?,${prefix}_rotation=?,${prefix}_media_revision=${prefix}_media_revision+1
                 WHERE id=?`,
                [
                    objectKey,
                    t.fit,
                    t.focalX,
                    t.focalY,
                    t.zoom,
                    t.rotation,
                    input.id,
                ],
            );
            return row.object_key;
        });
    }

    async hasMediaReference(objectKey: string): Promise<boolean> {
        const row = await queryOne<{ referenced: boolean }>(
            this.database,
            `SELECT EXISTS (
                SELECT 1 FROM catalog_character_project_profiles WHERE avatar_object_key=?
                UNION ALL SELECT 1 FROM catalog_group_project_profiles WHERE image_object_key=?
                UNION ALL SELECT 1 FROM wiki_entries WHERE local_image_object_key=?
                    AND character_profile_id IS NULL AND group_profile_id IS NULL
                UNION ALL SELECT 1 FROM wiki_navigation_groups WHERE icon_object_key=? AND group_profile_id IS NULL
            ) AS referenced`,
            [objectKey, objectKey, objectKey, objectKey],
        );
        return row?.referenced ?? false;
    }

    async ownsWikiPresentation(
        kind: 'idol' | 'group',
        id: number,
    ): Promise<boolean> {
        const row = await queryOne<{ bound: boolean }>(
            this.database,
            kind === 'idol'
                ? 'SELECT character_profile_id IS NOT NULL OR group_profile_id IS NOT NULL AS bound FROM wiki_entries WHERE id=?'
                : 'SELECT group_profile_id IS NOT NULL AS bound FROM wiki_navigation_groups WHERE id=?',
            [id],
        );
        return row?.bound ?? false;
    }
}
