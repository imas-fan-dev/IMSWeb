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
    DeleteStoryGroupInput,
    DeleteStoryGroupResult,
    DeleteWikiCategoryInput,
    DeleteWikiCategoryResult,
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
    WikiStoryCatalogSaveResult,
    WikiStoryContentTypeInput,
    WikiStoryContentTypeRecord,
    WikiStoryCoverAssetDeleteResult,
    WikiStoryCoverAssetRecord,
    WikiStoryCoverAssetSaveResult,
    WikiStorySourcePlatformInput,
    WikiStorySourcePlatformRecord
} from '@/ports/repositories';
import type { ManagedSqlDatabase, SqlSchemaStrategy } from '@/infra/db/sql/database';
import { executeSql, queryAll, queryOne, sqlStatement } from '@/infra/db/sql/query';
import {
    STORY_CARD_COLUMNS,
    STORY_CLEANUP_COLUMNS,
    STORY_COLUMNS
} from '@/infra/db/repositories/story-rows';
import {
    StoryMediaRevisionConflict,
    httpError,
    storyCardHasConflict
} from '@/infra/db/repositories/story-conflicts';
import { SqlStoryCatalogRepository } from '@/infra/db/repositories/story-catalog-repository';
import { SqlWikiEntityRepository } from '@/infra/db/repositories/wiki-entity-repository';

export class SqlStoryRepository implements StoryRepository {
    private initialized?: Promise<void>;
    private readonly catalog: SqlStoryCatalogRepository;
    private readonly entities: SqlWikiEntityRepository;

    constructor(
        private readonly database: ManagedSqlDatabase,
        private readonly schema: SqlSchemaStrategy
    ) {
        this.catalog = new SqlStoryCatalogRepository(database);
        this.entities = new SqlWikiEntityRepository(database);
    }

    initialize(): Promise<void> {
        this.initialized ??= this.schema.initializeStory(this.database);
        return this.initialized;
    }

    close(): Promise<void> {
        return this.database.close();
    }

    listThemeColors(): Promise<Record<string, string>> {
        return this.entities.listThemeColors();
    }

    listAgencies(): Promise<AgencyRecord[]> {
        return this.entities.listAgencies();
    }

    listIdolsWithAgencies(): Promise<IdolWithAgencyRecord[]> {
        return this.entities.listIdolsWithAgencies();
    }

    listWikiGroups(agencyId?: number): Promise<WikiGroupRecord[]> {
        return this.entities.listWikiGroups(agencyId);
    }

    findWikiGroupById(id: number): Promise<WikiGroupRecord | null> {
        return this.entities.findWikiGroupById(id);
    }

    listWikiGroupMembers(agencyId?: number): Promise<WikiGroupMemberRecord[]> {
        return this.entities.listWikiGroupMembers(agencyId);
    }

    listWikiCategories(agencyId: number, idolId: number): Promise<WikiCategoryRecord[]> {
        return this.entities.listWikiCategories(agencyId, idolId);
    }

    findAgencyByName(name: string): Promise<AgencyRecord | null> {
        return this.entities.findAgencyByName(name);
    }

    findAgencyByCode(code: string): Promise<AgencyRecord | null> {
        return this.entities.findAgencyByCode(code);
    }

    findAgencyById(id: number): Promise<AgencyRecord | null> {
        return this.entities.findAgencyById(id);
    }

    findIdolByAgencyAndName(agencyId: number, idolName: string): Promise<IdolRecord | null> {
        return this.entities.findIdolByAgencyAndName(agencyId, idolName);
    }

    findIdolById(id: number): Promise<IdolRecord | null> {
        return this.entities.findIdolById(id);
    }

    createWikiAgency(input: CreateWikiAgencyInput): Promise<AgencyRecord> {
        return this.entities.createWikiAgency(input);
    }

    updateWikiAgency(input: UpdateWikiAgencyInput): Promise<AgencyRecord> {
        return this.entities.updateWikiAgency(input);
    }

    createWikiGroup(input: CreateWikiGroupInput): Promise<WikiGroupRecord> {
        return this.entities.createWikiGroup(input);
    }

    updateWikiGroup(input: UpdateWikiGroupInput): Promise<WikiGroupRecord> {
        return this.entities.updateWikiGroup(input);
    }

    deleteWikiGroup(input: DeleteWikiGroupInput): Promise<WikiGroupDeleteResult | null> {
        return this.entities.deleteWikiGroup(input);
    }

    createWikiIdol(input: CreateWikiIdolInput): Promise<IdolRecord> {
        return this.entities.createWikiIdol(input);
    }

    updateWikiIdol(input: UpdateWikiIdolInput): Promise<IdolRecord> {
        return this.entities.updateWikiIdol(input);
    }

    deleteWikiIdol(input: DeleteWikiIdolInput): Promise<WikiIdolDeleteResult | null> {
        return this.entities.deleteWikiIdol(input);
    }

    setAgencyIconObjectKey(agencyId: number, objectKey: string | null): Promise<void> {
        return this.entities.setAgencyIconObjectKey(agencyId, objectKey);
    }

    setIdolAvatarObjectKey(idolId: number, objectKey: string | null): Promise<void> {
        return this.entities.setIdolAvatarObjectKey(idolId, objectKey);
    }

    saveAgencyIconMedia(input: SaveWikiEntityMediaInput): Promise<WikiEntityMediaSaveResult> {
        return this.entities.saveAgencyIconMedia(input);
    }

    saveWikiGroupIconMedia(input: SaveWikiEntityMediaInput): Promise<WikiEntityMediaSaveResult> {
        return this.entities.saveWikiGroupIconMedia(input);
    }

    saveIdolAvatarMedia(input: SaveWikiEntityMediaInput): Promise<WikiEntityMediaSaveResult> {
        return this.entities.saveIdolAvatarMedia(input);
    }

    ensureWikiCategory(
        agencyId: number,
        idolId: number,
        name: string,
        storageSlug: string
    ): Promise<WikiCategoryRecord> {
        return this.entities.ensureWikiCategory(agencyId, idolId, name, storageSlug);
    }

    updateWikiCategory(input: UpdateWikiCategoryInput): Promise<WikiCategorySaveResult | null> {
        return this.entities.updateWikiCategory(input);
    }

    deleteWikiCategoryAssociation(
        agencyId: number,
        idolId: number,
        name: string
    ): Promise<WikiCategoryRecord | null> {
        return this.entities.deleteWikiCategoryAssociation(agencyId, idolId, name);
    }

    saveWikiLayout(input: WikiLayoutInput): Promise<WikiLayoutSaveResult> {
        return this.entities.saveWikiLayout(input);
    }

    listStoryContentTypes(): Promise<WikiStoryContentTypeRecord[]> {
        return this.catalog.listStoryContentTypes();
    }

    listStorySourcePlatforms(): Promise<WikiStorySourcePlatformRecord[]> {
        return this.catalog.listStorySourcePlatforms();
    }

    listStoryCoverAssets(agencyId: number): Promise<WikiStoryCoverAssetRecord[]> {
        return this.catalog.listStoryCoverAssets(agencyId);
    }

    findStoryCoverAssetById(id: number): Promise<WikiStoryCoverAssetRecord | null> {
        return this.catalog.findStoryCoverAssetById(id);
    }

    createStoryCoverAsset(input: CreateWikiStoryCoverAssetInput): Promise<WikiStoryCoverAssetRecord> {
        return this.catalog.createStoryCoverAsset(input);
    }

    updateStoryCoverAsset(
        input: UpdateWikiStoryCoverAssetInput
    ): Promise<WikiStoryCoverAssetSaveResult | null> {
        return this.catalog.updateStoryCoverAsset(input);
    }

    deleteStoryCoverAsset(id: number): Promise<WikiStoryCoverAssetDeleteResult> {
        return this.catalog.deleteStoryCoverAsset(id);
    }

    createStoryContentType(input: WikiStoryContentTypeInput): Promise<WikiStoryContentTypeRecord> {
        return this.catalog.createStoryContentType(input);
    }

    updateStoryContentType(
        id: number,
        expectedRevision: number,
        input: WikiStoryContentTypeInput
    ): Promise<WikiStoryCatalogSaveResult<WikiStoryContentTypeRecord> | null> {
        return this.catalog.updateStoryContentType(id, expectedRevision, input);
    }

    deleteStoryContentType(id: number): Promise<WikiStoryCatalogDeleteResult> {
        return this.catalog.deleteStoryContentType(id);
    }

    createStorySourcePlatform(input: WikiStorySourcePlatformInput): Promise<WikiStorySourcePlatformRecord> {
        return this.catalog.createStorySourcePlatform(input);
    }

    updateStorySourcePlatform(
        id: number,
        expectedRevision: number,
        input: WikiStorySourcePlatformInput
    ): Promise<WikiStoryCatalogSaveResult<WikiStorySourcePlatformRecord> | null> {
        return this.catalog.updateStorySourcePlatform(id, expectedRevision, input);
    }

    deleteStorySourcePlatform(id: number): Promise<WikiStoryCatalogDeleteResult> {
        return this.catalog.deleteStorySourcePlatform(id);
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
                this.entities.findAgencyByCode(input.agencyCode),
                this.catalog.findStoryCoverAssetById(coverAssetId)
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
                       AND (CAST(? AS BIGINT) IS NULL OR cards.cover_asset_id=?)
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
                   AND (CAST(? AS BIGINT) IS NULL OR cards.cover_asset_id=?)
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
        statements.push(sqlStatement(this.database,
            `UPDATE wiki_story_cards
             SET image_media_revision=image_media_revision+1
             WHERE id=? AND idol_id=? AND image_media_revision=?
               AND agency_id=(SELECT id FROM agencies WHERE code=?)`,
            [input.cardId, input.idolId, input.expectedRevision, input.agencyCode]
        ));
        const results = await this.database.batch(statements);
        const guarded = results[0]?.results[0] as { id?: unknown } | undefined;
        const ids = results.slice(1, 1 + input.links.length).map((result) => {
            const row = result.results[0] as { id?: unknown } | undefined;
            if (typeof row?.id === 'number') return row.id;
            return result.meta.changes ? result.meta.last_row_id : undefined;
        });
        if (typeof guarded?.id === 'number' &&
            ids.every((id): id is number => typeof id === 'number' && id > 0) &&
            (results.at(-1)?.meta.changes ?? 0) === 1) {
            return { status: 'added', ids, revision: input.expectedRevision + 1 };
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
        const category = (await this.entities.listWikiCategories(
            (await this.entities.findAgencyByCode(input.agencyCode))?.id ?? -1,
            input.idolId
        )).find((candidate) => candidate.id === input.categoryId);
        if (!category) throw httpError('分类不属于所选内容页', 400);
        const coverAssetId = input.coverAssetId ?? null;
        if (input.imageFile && coverAssetId !== null) {
            throw httpError('剧情卡片不能同时使用共享素材和独立图片', 400);
        }
        if (coverAssetId !== null) {
            const asset = await this.catalog.findStoryCoverAssetById(coverAssetId);
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
                `UPDATE wiki_story_cards
                 SET image_media_revision=image_media_revision+1
                 WHERE id=? AND idol_id=? AND image_media_revision=?
                   AND agency_id=(SELECT id FROM agencies WHERE code=?)`,
                [story.card_id, input.idolId, input.expectedRevision, input.agencyCode]
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
        if ((results[2]?.meta.changes ?? 0) !== 1) {
            const current = await this.findStoryCardById(
                input.agencyCode,
                input.idolId,
                story.card_id
            );
            return current
                ? { status: 'conflict', revision: current.image_media_revision }
                : null;
        }
        const referenced = new Set((results[3]?.results ?? []).map((row) =>
            (row as { image_file?: string | null }).image_file
        ).filter((value): value is string => Boolean(value)));
        const cleanupImageFiles = [...new Set([deletedLink.image_file]
            .filter((value): value is string => Boolean(value) && !referenced.has(value!))
        )];
        return {
            status: 'deleted',
            cardDeleted: false,
            revision: input.expectedRevision + 1,
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
        try {
            await this.database.transaction(async (database) => {
                const results = await database.batch([
                    sqlStatement(database,
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
                    sqlStatement(database,
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
                    throw new StoryMediaRevisionConflict();
                }
            });
        } catch (error) {
            if (!(error instanceof StoryMediaRevisionConflict)) throw error;
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

    async deleteStoryGroup(input: DeleteStoryGroupInput): Promise<DeleteStoryGroupResult> {
        const current = (await this.listStoryCards(input.agencyCode, input.idolId))
            .find((card) =>
                card.category === input.category && card.card_name === input.cardName
            );
        if (!current) return { status: 'not-found' };
        if (current.image_media_revision !== input.expectedRevision) {
            return { status: 'conflict', revision: current.image_media_revision };
        }
        const results = await this.database.batch([
            sqlStatement(this.database,
                `UPDATE wiki_story_cards SET image_media_revision=image_media_revision
                 WHERE id=? AND idol_id=? AND image_media_revision=?`,
                [current.card_id, input.idolId, input.expectedRevision]
            ),
            sqlStatement(this.database,
                `DELETE FROM wiki_story_cards
                 WHERE id=? AND idol_id=? AND image_media_revision=?`,
                [current.card_id, input.idolId, input.expectedRevision]
            )
        ]);
        if ((results[0]?.meta.changes ?? 0) === 1 &&
            (results[1]?.meta.changes ?? 0) === 1) {
            return { status: 'deleted', revision: input.expectedRevision };
        }
        const raced = (await this.listStoryCards(input.agencyCode, input.idolId))
            .find((card) => card.card_id === current.card_id);
        return raced
            ? { status: 'conflict', revision: raced.image_media_revision }
            : { status: 'not-found' };
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

    async deleteCategory(input: DeleteWikiCategoryInput): Promise<DeleteWikiCategoryResult> {
        const current = (await this.entities.listWikiCategories(input.agencyId, input.idolId))
            .find((category) => category.name === input.category);
        if (!current) return { status: 'not-found' };
        if (current.revision !== input.expectedRevision) {
            return { status: 'conflict', revision: current.revision };
        }
        const guard = `EXISTS (
            SELECT 1 FROM wiki_categories guarded
            JOIN wiki_idol_categories assignments
              ON assignments.category_id=guarded.id
             AND assignments.agency_id=guarded.agency_id
            WHERE guarded.id=? AND guarded.agency_id=? AND guarded.revision=?
              AND assignments.idol_id=?
        )`;
        const results = await this.database.batch([
            sqlStatement(this.database,
                `UPDATE wiki_categories SET revision=revision
                 WHERE id=? AND agency_id=? AND revision=?`,
                [current.id, input.agencyId, input.expectedRevision]
            ),
            sqlStatement(this.database,
                `DELETE FROM wiki_story_cards
                 WHERE agency_id=? AND idol_id=? AND category_id=? AND ${guard}`,
                [input.agencyId, input.idolId, current.id,
                    current.id, input.agencyId, input.expectedRevision, input.idolId]
            ),
            sqlStatement(this.database,
                `DELETE FROM wiki_idol_categories
                 WHERE agency_id=? AND idol_id=? AND category_id=? AND ${guard}`,
                [input.agencyId, input.idolId, current.id,
                    current.id, input.agencyId, input.expectedRevision, input.idolId]
            ),
            sqlStatement(this.database,
                `DELETE FROM wiki_categories
                 WHERE id=? AND agency_id=? AND revision=? AND NOT EXISTS (
                     SELECT 1 FROM wiki_idol_categories WHERE category_id=?
                 )`,
                [current.id, input.agencyId, input.expectedRevision, current.id]
            )
        ]);
        if ((results[0]?.meta.changes ?? 0) === 1 &&
            (results[2]?.meta.changes ?? 0) === 1) {
            return { status: 'deleted', category: current };
        }
        const raced = (await this.entities.listWikiCategories(input.agencyId, input.idolId))
            .find((category) => category.id === current.id);
        return raced
            ? { status: 'conflict', revision: raced.revision }
            : { status: 'not-found' };
    }
}
