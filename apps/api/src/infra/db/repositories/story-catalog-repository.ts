import type {
    CreateWikiStoryCoverAssetInput,
    UpdateWikiStoryCoverAssetInput,
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
import type { ManagedSqlDatabase } from '@/infra/db/sql/database';
import { queryAll, queryOne } from '@/infra/db/sql/query';
import { booleanValue } from '@/infra/db/repositories/story-rows';
import { httpError } from '@/infra/db/repositories/story-conflicts';

export class SqlStoryCatalogRepository {
    constructor(private readonly database: ManagedSqlDatabase) {}

    listStoryContentTypes(): Promise<WikiStoryContentTypeRecord[]> {
        return queryAll<WikiStoryContentTypeRecord>(this.database,
            `SELECT id, name, icon_name, description, display_order, is_active, revision
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
        input: WikiStoryContentTypeInput
    ): Promise<WikiStoryContentTypeRecord> {
        const option = await queryOne<WikiStoryContentTypeRecord>(this.database,
            `INSERT INTO wiki_story_content_types
                (name, icon_name, description, display_order, is_active)
             VALUES (?, ?, ?, COALESCE((SELECT MAX(display_order) + 1
                                        FROM wiki_story_content_types), 0), ?)
             RETURNING id, name, icon_name, description, display_order, is_active, revision`,
            [input.name, input.iconName, input.description, input.isActive]
        );
        if (!option) throw new Error('Wiki story content type was not created');
        return { ...option, is_active: booleanValue(option.is_active) };
    }

    async updateStoryContentType(
        id: number,
        expectedRevision: number,
        input: WikiStoryContentTypeInput
    ): Promise<WikiStoryCatalogSaveResult<WikiStoryContentTypeRecord> | null> {
        const option = await queryOne<WikiStoryContentTypeRecord>(this.database,
            `UPDATE wiki_story_content_types
             SET name=?, icon_name=?, description=?, is_active=?, revision=revision+1
             WHERE id=? AND revision=?
             RETURNING id, name, icon_name, description, display_order, is_active, revision`,
            [input.name, input.iconName, input.description, input.isActive, id, expectedRevision]
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
}
