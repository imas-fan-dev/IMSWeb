import type {
    ArticleStatus,
    ChronicleDatePrecision,
    ChronicleSourceType,
    EditorialRepository,
    EditorialUpdateInput,
    EventKind,
    SpotlightCategory
} from '@/ports/repositories/content';
import type { ManagedSqlDatabase } from '@/infra/db/sql/database';
import { executeSql, queryAll, queryOne } from '@/infra/db/sql/query';

export class SqlEditorialRepository implements EditorialRepository {
    constructor(private readonly database: ManagedSqlDatabase) {}

    async createEventDraft(input: {
        title: string;
        kind: EventKind;
        userId: number;
    }): Promise<{ id: number; article_id: number; revision: number }> {
        return this.database.transaction(async (database) => {
            const article = await queryOne<{ id: number }>(database,
                `INSERT INTO articles (content_type, title, status, created_by, updated_by)
                 VALUES ('event', ?, 'draft', ?, ?) RETURNING id`,
                [input.title, input.userId, input.userId]
            );
            if (!article) throw new Error('Article insert did not return an ID');
            const event = await queryOne<{ id: number }>(database,
                `INSERT INTO events
                 (article_id, title, kind, publication_state, event_status)
                 VALUES (?, ?, ?, 'publishing', 'scheduled') RETURNING id`,
                [article.id, input.title, input.kind]
            );
            if (!event) throw new Error('Event insert did not return an ID');
            return { id: event.id, article_id: article.id, revision: 0 };
        });
    }

    async createChronicleDraft(input: {
        title: string;
        sourceType: ChronicleSourceType;
        userId: number;
    }): Promise<{ id: number; article_id: number; revision: number }> {
        return this.database.transaction(async (database) => {
            const article = await queryOne<{ id: number }>(database,
                `INSERT INTO articles (content_type, title, status, created_by, updated_by)
                 VALUES ('chronicle', ?, 'draft', ?, ?) RETURNING id`,
                [input.title, input.userId, input.userId]
            );
            if (!article) throw new Error('Article insert did not return an ID');
            await executeSql(database,
                `INSERT INTO chronicle_entries (article_id, source_type)
                 VALUES (?, ?)`,
                [article.id, input.sourceType]
            );
            return { id: article.id, article_id: article.id, revision: 0 };
        });
    }

    listAdminEvents(status?: ArticleStatus): Promise<Record<string, unknown>[]> {
        const condition = status ? ' AND a.status=?' : '';
        return queryAll(this.database,
            `SELECT e.id, e.article_id, e.title AS legacy_title, e.name, e.contact,
                    e.image_url, e.kind, e.start_at, e.end_at, e.timezone,
                    e.venue_name, e.address, e.registration_url, e.event_status, e.source_url,
                    e.related_links,
                    s.category AS spotlight_category, s.sort_order AS spotlight_order,
                    e.publication_state, a.content_type, a.title, a.summary,
                    a.cover_url, a.body_json, a.body_html, a.status, a.revision,
                    a.cover_focal_x, a.cover_focal_y, a.cover_zoom,
                    jsonb_build_object(
                        'focalX', a.cover_focal_x,
                        'focalY', a.cover_focal_y,
                        'zoom', a.cover_zoom
                    ) AS cover_transform,
                    a.created_by, a.updated_by, a.published_by, a.created_at,
                    a.updated_at, a.published_at
             FROM events e JOIN articles a ON a.id=e.article_id
             LEFT JOIN homepage_spotlight_entries s ON s.post_id=e.id
             WHERE a.content_type='event'${condition}
             ORDER BY a.updated_at DESC, e.id DESC`,
            status ? [status] : []
        );
    }

    findAdminEvent(id: number): Promise<Record<string, unknown> | null> {
        return queryOne(this.database,
            `SELECT e.id, e.article_id, e.title AS legacy_title, e.name, e.contact,
                    e.image_url, e.kind, e.start_at, e.end_at, e.timezone,
                    e.venue_name, e.address, e.registration_url, e.event_status, e.source_url,
                    e.related_links,
                    s.category AS spotlight_category, s.sort_order AS spotlight_order,
                    e.publication_state, a.content_type, a.title, a.summary,
                    a.cover_url, a.body_json, a.body_html, a.status, a.revision,
                    a.cover_focal_x, a.cover_focal_y, a.cover_zoom,
                    jsonb_build_object(
                        'focalX', a.cover_focal_x,
                        'focalY', a.cover_focal_y,
                        'zoom', a.cover_zoom
                    ) AS cover_transform,
                    a.created_by, a.updated_by, a.published_by, a.created_at,
                    a.updated_at, a.published_at
             FROM events e JOIN articles a ON a.id=e.article_id
             LEFT JOIN homepage_spotlight_entries s ON s.post_id=e.id
             WHERE e.id=? AND a.content_type='event'`, [id]);
    }

    findPublicEvent(id: number): Promise<Record<string, unknown> | null> {
        return queryOne(this.database,
            `SELECT e.id, e.article_id, e.title AS legacy_title, e.name, e.contact,
                    COALESCE(a.cover_url, e.image_url) AS image_url,
                    e.kind, e.start_at, e.end_at, e.timezone, e.venue_name,
                    e.address, e.registration_url, e.event_status, e.source_url,
                    e.related_links,
                    a.title, a.summary, a.body_json, a.body_html, a.status,
                    a.revision, a.created_at, a.updated_at, a.published_at,
                    a.cover_focal_x, a.cover_focal_y, a.cover_zoom,
                    jsonb_build_object(
                        'focalX', a.cover_focal_x,
                        'focalY', a.cover_focal_y,
                        'zoom', a.cover_zoom
                    ) AS cover_transform
             FROM events e JOIN articles a ON a.id=e.article_id
             WHERE e.id=? AND e.publication_state='ready'
               AND a.content_type='event' AND a.status='published'`, [id]);
    }

    async deleteEditorialEvent(id: number): Promise<boolean> {
        const result = await executeSql(this.database,
            `DELETE FROM articles WHERE id=(SELECT article_id FROM events WHERE id=? AND article_id IS NOT NULL)
             AND content_type='event'`, [id]);
        return result.meta.changes > 0;
    }

    async updateEditorialEvent(
        id: number,
        input: EditorialUpdateInput & {
            kind: EventKind;
            sourceUrl: string | null;
            name: string | null;
            contact: string | null;
            startAt: string | null;
            endAt: string | null;
            timezone: string;
            venueName: string | null;
            address: string | null;
            registrationUrl: string | null;
            eventStatus: string | null;
            coverTransform: { focalX: number; focalY: number; zoom: number };
            relatedLinks: Array<{ label: string; url: string }>;
        }
    ): Promise<{ status: 'updated' | 'conflict' | 'not-found'; revision?: number }> {
        return this.database.transaction(async (database) => {
            const current = await queryOne<{ revision: number }>(database,
                `SELECT a.revision FROM articles a JOIN events e ON e.article_id=a.id
                 WHERE e.id=? AND a.content_type='event'`, [id]);
            if (!current) return { status: 'not-found' };
            if (current.revision !== input.revision) return { status: 'conflict', revision: current.revision };
            const article = await executeSql(database,
                `UPDATE articles
                 SET title=?, summary=?, cover_url=?, body_json=?, body_html=?,
                     cover_focal_x=?, cover_focal_y=?, cover_zoom=?,
                     revision=revision+1, updated_by=?, updated_at=CURRENT_TIMESTAMP
                 WHERE id=(SELECT article_id FROM events WHERE id=?) AND revision=?`,
                [input.title, input.summary, input.coverUrl,
                    JSON.stringify(input.bodyJson), input.bodyHtml,
                    input.coverTransform.focalX, input.coverTransform.focalY,
                    input.coverTransform.zoom, input.userId, id, input.revision]
            );
            if (article.meta.changes !== 1) return { status: 'conflict', revision: input.revision };
            await executeSql(database,
                `UPDATE events SET title=?, name=?, contact=?, kind=?, start_at=?, end_at=?,
                    timezone=?, venue_name=?, address=?, registration_url=?, event_status=?, source_url=?,
                    related_links=?
                 WHERE id=?`,
                [input.title, input.name, input.contact, input.kind, input.startAt, input.endAt,
                    input.timezone, input.venueName, input.address, input.registrationUrl,
                    input.eventStatus, input.sourceUrl, JSON.stringify(input.relatedLinks), id]
            );
            return { status: 'updated', revision: input.revision + 1 };
        });
    }

    listAdminSpotlightEntries(): Promise<Record<string, unknown>[]> {
        return queryAll(this.database,
            `SELECT s.post_id, s.category, s.sort_order, a.title, a.status,
                    COALESCE(a.cover_url, e.image_url) AS image_url, e.kind,
                    jsonb_build_object(
                        'focalX', a.cover_focal_x,
                        'focalY', a.cover_focal_y,
                        'zoom', a.cover_zoom
                    ) AS cover_transform
             FROM homepage_spotlight_entries s
             JOIN events e ON e.id=s.post_id
             JOIN articles a ON a.id=e.article_id
             ORDER BY s.sort_order ASC, s.post_id ASC`
        );
    }

    async replaceHomepageSpotlightEntries(input: Array<{
        postId: number;
        category: SpotlightCategory;
    }>): Promise<{ status: 'updated' | 'invalid' }> {
        return this.database.transaction(async (database) => {
            for (const entry of input) {
                const post = await queryOne<{ id: number }>(database,
                    `SELECT e.id
                     FROM events e
                     JOIN articles a ON a.id=e.article_id
                     WHERE e.id=? AND a.content_type='event' AND a.status='published'
                     FOR UPDATE OF e, a`,
                    [entry.postId]
                );
                if (!post) return { status: 'invalid' };
            }
            await executeSql(database, 'DELETE FROM homepage_spotlight_entries');
            for (const [sortOrder, entry] of input.entries()) {
                await executeSql(database,
                    `INSERT INTO homepage_spotlight_entries (post_id, category, sort_order)
                     VALUES (?, ?, ?)`,
                    [entry.postId, entry.category, sortOrder]
                );
            }
            return { status: 'updated' };
        });
    }

    async replaceLegacyInformationSpotlightEntries(input: Array<{
        postId: number;
        category: SpotlightCategory;
        sortOrder: number;
    }>): Promise<void> {
        await this.database.transaction(async (database) => {
            const manualEntries = await queryAll<{
                post_id: number;
                category: SpotlightCategory;
            }>(database,
                `SELECT s.post_id, s.category
                 FROM homepage_spotlight_entries s
                 JOIN events e ON e.id=s.post_id
                 WHERE e.legacy_information_id IS NULL
                 ORDER BY s.sort_order ASC, s.post_id ASC
                 FOR UPDATE OF s, e`
            );
            await executeSql(database, 'DELETE FROM homepage_spotlight_entries');
            for (const entry of [...input].sort((left, right) => left.sortOrder - right.sortOrder)) {
                await executeSql(database,
                    `INSERT INTO homepage_spotlight_entries (post_id, category, sort_order)
                     VALUES (?, ?, ?)`,
                    [entry.postId, entry.category, entry.sortOrder]
                );
            }
            for (const [index, entry] of manualEntries.entries()) {
                await executeSql(database,
                    `INSERT INTO homepage_spotlight_entries (post_id, category, sort_order)
                     VALUES (?, ?, ?)`,
                    [entry.post_id, entry.category, input.length + index]
                );
            }
        });
    }

    async importLegacyInformationPost(input: {
        legacyInformationId: string;
        category: SpotlightCategory;
        title: string;
        coverUrl: string;
        sourceUrl: string | null;
        publishedAt: string;
    }): Promise<{
        id: number;
        articleId: number;
        bodyJson: Record<string, unknown>;
        imported: boolean;
    }> {
        return this.database.transaction(async (database) => {
            const existing = await queryOne<{
                id: number;
                article_id: number;
                body_json: Record<string, unknown>;
            }>(database,
                `SELECT e.id, e.article_id, a.body_json
                 FROM events e JOIN articles a ON a.id=e.article_id
                 WHERE e.legacy_information_id=? AND e.article_id IS NOT NULL`,
                [input.legacyInformationId]);
            if (existing) {
                return {
                    id: existing.id,
                    articleId: existing.article_id,
                    bodyJson: existing.body_json,
                    imported: false
                };
            }
            const article = await queryOne<{ id: number }>(database,
                `INSERT INTO articles
                 (content_type, title, cover_url, body_json, body_html, status, created_at, updated_at, published_at)
                 VALUES ('event', ?, ?, ?, ?, 'published', ?, ?, ?) RETURNING id`,
                [input.title, input.coverUrl, JSON.stringify({ type: 'doc', content: [] }), '',
                    input.publishedAt, input.publishedAt, input.publishedAt]
            );
            if (!article) throw new Error('Legacy Information article insert did not return an ID');
            const event = await queryOne<{ id: number }>(database,
                `INSERT INTO events
                 (article_id, title, kind, source_url, legacy_information_id, publication_state)
                 VALUES (?, ?, 'notice', ?, ?, 'ready') RETURNING id`,
                [article.id, input.title, input.sourceUrl, input.legacyInformationId]
            );
            if (!event) throw new Error('Legacy Information post insert did not return an ID');
            return {
                id: event.id,
                articleId: article.id,
                bodyJson: { type: 'doc', content: [] },
                imported: true
            };
        });
    }

    async replaceLegacyInformationPostBody(input: {
        legacyInformationId: string;
        bodyJson: Record<string, unknown>;
        bodyHtml: string;
    }): Promise<void> {
        const result = await executeSql(this.database,
            `UPDATE articles
             SET body_json=?, body_html=?, updated_at=CURRENT_TIMESTAMP
             WHERE id=(SELECT article_id FROM events WHERE legacy_information_id=?)`,
            [JSON.stringify(input.bodyJson), input.bodyHtml, input.legacyInformationId]
        );
        if (result.meta.changes !== 1) {
            throw new Error(`Legacy Information post ${input.legacyInformationId} was not found`);
        }
    }

    findLegacyInformationPost(legacyInformationId: string): Promise<{ id: number; articleId: number } | null> {
        return queryOne(this.database,
            `SELECT e.id, e.article_id AS "articleId" FROM events e JOIN articles a ON a.id=e.article_id
             WHERE e.legacy_information_id=? AND a.status='published'
               AND e.publication_state='ready'`, [legacyInformationId]);
    }

    listPublicSpotlightEntries(): Promise<Record<string, unknown>[]> {
        return queryAll(this.database,
            `SELECT e.id, a.title, COALESCE(a.cover_url, e.image_url) AS image_url,
                    s.category, s.sort_order,
                    jsonb_build_object(
                        'focalX', a.cover_focal_x,
                        'focalY', a.cover_focal_y,
                        'zoom', a.cover_zoom
                    ) AS cover_transform
             FROM homepage_spotlight_entries s
             JOIN events e ON e.id=s.post_id
             JOIN articles a ON a.id=e.article_id
             WHERE e.publication_state='ready' AND a.status='published'
             ORDER BY s.sort_order ASC, s.post_id ASC`
        );
    }

    listPublicChronicle(
        limit: number,
        cursor: { occurredOn: string; timelineOrder: number; articleId: string } | null
    ): Promise<Record<string, unknown>[]> {
        const cursorClause = cursor
            ? ` AND (c.occurred_on < ?
                 OR (c.occurred_on = ? AND c.timeline_order > ?)
                 OR (c.occurred_on = ? AND c.timeline_order = ? AND c.article_id < ?))`
            : '';
        const cursorValues = cursor
            ? [cursor.occurredOn, cursor.occurredOn, cursor.timelineOrder,
                cursor.occurredOn, cursor.timelineOrder, cursor.articleId]
            : [];
        return queryAll(this.database,
            `SELECT a.id AS article_id, a.title, a.summary, a.cover_url, a.body_html,
                    a.published_at, c.occurred_on, c.ended_on, c.date_precision,
                    c.source_type, c.source_event_id, c.location, c.timeline_order,
                    c.live_source_id, c.live_title, c.live_date, c.live_time,
                    c.live_location, c.live_detail_url, c.live_franchises,
                    c.live_brand_codes
             FROM chronicle_entries c JOIN articles a ON a.id=c.article_id
             WHERE a.content_type='chronicle' AND a.status='published'
               AND c.occurred_on IS NOT NULL${cursorClause}
             ORDER BY c.occurred_on DESC, c.timeline_order ASC, c.article_id DESC
             LIMIT ?`, [...cursorValues, limit]);
    }

    listAdminChronicle(status?: ArticleStatus): Promise<Record<string, unknown>[]> {
        const condition = status ? ' AND a.status=?' : '';
        return queryAll(this.database,
            `SELECT a.id AS article_id, a.title, a.summary, a.cover_url, a.body_json,
                    a.body_html, a.status, a.revision, a.created_at, a.updated_at,
                    a.published_at, c.occurred_on, c.ended_on, c.date_precision,
                    c.source_type, c.source_event_id, c.location, c.timeline_order,
                    c.live_source_id, c.live_title, c.live_date, c.live_time,
                    c.live_location, c.live_detail_url, c.live_franchises,
                    c.live_brand_codes
             FROM chronicle_entries c JOIN articles a ON a.id=c.article_id
             WHERE a.content_type='chronicle'${condition}
             ORDER BY a.updated_at DESC, a.id DESC`, status ? [status] : []);
    }

    findAdminChronicle(id: number): Promise<Record<string, unknown> | null> {
        return this.findChronicle(id, false);
    }

    findPublicChronicle(id: number): Promise<Record<string, unknown> | null> {
        return this.findChronicle(id, true);
    }

    async deleteEditorialChronicle(id: number): Promise<boolean> {
        const result = await executeSql(this.database,
            `DELETE FROM articles WHERE id=? AND content_type='chronicle'`, [id]);
        return result.meta.changes > 0;
    }

    private findChronicle(id: number, publishedOnly: boolean): Promise<Record<string, unknown> | null> {
        const status = publishedOnly ? " AND a.status='published'" : '';
        return queryOne(this.database,
            `SELECT a.id AS article_id, a.title, a.summary, a.cover_url, a.body_json,
                    a.body_html, a.status, a.revision, a.created_at, a.updated_at,
                    a.published_at, c.occurred_on, c.ended_on, c.date_precision,
                    c.source_type, c.source_event_id, c.location, c.timeline_order,
                    c.live_source_id, c.live_title, c.live_date, c.live_time,
                    c.live_location, c.live_detail_url, c.live_franchises,
                    c.live_brand_codes,
                    se.id AS source_event_id_value, se.title AS source_event_title
             FROM chronicle_entries c JOIN articles a ON a.id=c.article_id
             LEFT JOIN events se ON se.id=c.source_event_id
             WHERE a.id=? AND a.content_type='chronicle'${status}`,
            [id]);
    }

    async updateChronicle(
        id: number,
        input: EditorialUpdateInput & {
            occurredOn: string | null;
            endedOn: string | null;
            datePrecision: ChronicleDatePrecision | null;
            sourceType: ChronicleSourceType | null;
            sourceEventId: number | null;
            location: string | null;
            timelineOrder: number;
            liveSourceId: string | null;
            liveTitle: string | null;
            liveDate: string | null;
            liveTime: string | null;
            liveLocation: string | null;
            liveDetailUrl: string | null;
            liveFranchises: string[];
            liveBrandCodes: string[];
        }
    ): Promise<{ status: 'updated' | 'conflict' | 'not-found'; revision?: number }> {
        return this.database.transaction(async (database) => {
            const current = await queryOne<{ revision: number }>(database,
                `SELECT revision FROM articles WHERE id=? AND content_type='chronicle'`, [id]);
            if (!current) return { status: 'not-found' };
            if (current.revision !== input.revision) return { status: 'conflict', revision: current.revision };
            const article = await executeSql(database,
                `UPDATE articles SET title=?, summary=?, cover_url=?, body_json=?, body_html=?,
                    revision=revision+1, updated_by=?, updated_at=CURRENT_TIMESTAMP
                 WHERE id=? AND revision=?`,
                [input.title, input.summary, input.coverUrl, JSON.stringify(input.bodyJson),
                    input.bodyHtml, input.userId, id, input.revision]
            );
            if (article.meta.changes !== 1) return { status: 'conflict', revision: input.revision };
            await executeSql(database,
                `UPDATE chronicle_entries SET occurred_on=?, ended_on=?, date_precision=?,
                    source_type=?, source_event_id=?, location=?, timeline_order=?,
                    live_source_id=?, live_title=?, live_date=?, live_time=?, live_location=?,
                    live_detail_url=?, live_franchises=?, live_brand_codes=?
                 WHERE article_id=?`,
                [input.occurredOn, input.endedOn, input.datePrecision, input.sourceType,
                    input.sourceEventId, input.location, input.timelineOrder, input.liveSourceId,
                    input.liveTitle, input.liveDate, input.liveTime, input.liveLocation,
                    input.liveDetailUrl, JSON.stringify(input.liveFranchises),
                    JSON.stringify(input.liveBrandCodes), id]
            );
            return { status: 'updated', revision: input.revision + 1 };
        });
    }

    async setArticleStatus(
        articleId: number,
        status: ArticleStatus,
        expectedRevision: number,
        userId: number
    ): Promise<{ status: 'updated' | 'conflict' | 'not-found'; revision?: number }> {
        return this.database.transaction(async (database) => {
            const current = await queryOne<{ revision: number }>(database,
                `SELECT revision FROM articles WHERE id=?`, [articleId]);
            if (!current) return { status: 'not-found' };
            if (current.revision !== expectedRevision) return { status: 'conflict', revision: current.revision };
            const result = await executeSql(database,
                `UPDATE articles SET status=?, revision=revision+1, updated_by=?,
                    updated_at=CURRENT_TIMESTAMP,
                    published_by=CASE WHEN ?='published' THEN ? ELSE published_by END,
                    published_at=CASE WHEN ?='published' THEN CURRENT_TIMESTAMP ELSE published_at END
                 WHERE id=? AND revision=?`,
                [status, userId, status, userId, status, articleId, expectedRevision]
            );
            if (result.meta.changes !== 1) return { status: 'conflict', revision: expectedRevision };
            await executeSql(database,
                `UPDATE events SET publication_state=CASE WHEN ?='published' THEN 'ready' ELSE 'publishing' END
                 WHERE article_id=?`, [status, articleId]
            );
            return { status: 'updated', revision: expectedRevision + 1 };
        });
    }

    insertArticleAsset(input: {
        articleId: number;
        objectKey: string;
        publicPath: string;
        usage: 'cover' | 'body';
        altText: string;
        userId: number | null;
    }): Promise<Record<string, unknown>> {
        return queryOne<Record<string, unknown>>(this.database,
            `INSERT INTO article_assets
             (article_id, object_key, public_path, asset_usage, alt_text, created_by)
             VALUES (?, ?, ?, ?, ?, ?) RETURNING id, article_id, object_key, public_path,
                asset_usage, alt_text, created_at`,
            [input.articleId, input.objectKey, input.publicPath, input.usage, input.altText, input.userId]
        ).then((asset) => {
            if (!asset) throw new Error('Article asset insert did not return an asset');
            return asset;
        });
    }

    findEditorialArticle(articleId: number): Promise<Record<string, unknown> | null> {
        return queryOne(this.database,
            `SELECT id, content_type, cover_url, body_json, status, revision
             FROM articles WHERE id=?`, [articleId]);
    }

    findArticleAsset(articleId: number, assetId: number): Promise<Record<string, unknown> | null> {
        return queryOne(this.database,
            `SELECT id, article_id, object_key, public_path, asset_usage, alt_text, created_at
             FROM article_assets WHERE article_id=? AND id=?`, [articleId, assetId]);
    }

    findArticleAssetByObjectKey(
        articleId: number,
        objectKey: string
    ): Promise<Record<string, unknown> | null> {
        return queryOne(this.database,
            `SELECT id, article_id, object_key, public_path, asset_usage, alt_text, created_at
             FROM article_assets WHERE article_id=? AND object_key=?`,
            [articleId, objectKey]);
    }

    listArticleAssets(articleId: number): Promise<Record<string, unknown>[]> {
        return queryAll(this.database,
            `SELECT id, article_id, object_key, public_path, asset_usage, alt_text, created_at
             FROM article_assets WHERE article_id=? ORDER BY asset_usage ASC, id ASC`, [articleId]);
    }

    deleteArticleAsset(articleId: number, assetId: number): Promise<Record<string, unknown> | null> {
        return queryOne(this.database,
            `DELETE FROM article_assets WHERE article_id=? AND id=?
             RETURNING id, article_id, object_key, public_path, asset_usage, alt_text, created_at`,
            [articleId, assetId]);
    }

}
