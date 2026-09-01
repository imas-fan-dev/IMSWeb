import type {
    AdminAccountRecord,
    AdminAccountRepository,
    ArticleStatus,
    AuditLogInput,
    AuditRepository,
    BackofficeAccountRecord,
    BackofficeAuthRepository,
    BackofficeRefreshSessionRecord,
    CardIdolSelectionRecord,
    CardMediaRecord,
    ChronicleDatePrecision,
    ChronicleSourceType,
    DeleteAdminAccountResult,
    DeleteSitePackageRevisionInput,
    EventInput,
    EventKind,
    EditorialRepository,
    EditorialUpdateInput,
    EventRepository,
    HomepageLinkRecord,
    HomepageLinkRepository,
    HomepageLinkSection,
    HomepageLinkUpdateInput,
    NamecardRepository,
    NamecardApprovalClaim,
    NamecardEditResult,
    NamecardMutationResult,
    NamecardPublicRecord,
    NamecardSubmissionKind,
    NamecardSubmissionRecord,
    NamecardSubmissionWithHashesRecord,
    NewAdminAccountInput,
    NewHomepageLinkInput,
    NewBackofficeRefreshSessionInput,
    NewSitePackageInput,
    NewSitePackageRevisionInput,
    NewsRepository,
    NewsInput,
    PendingCardInput,
    ReactionRepository,
    SitePackageRecord,
    SitePackagePublicationResult,
    SitePackageRepository,
    SitePackageRevisionDeletionResult,
    SitePackageRevisionRecord,
    SitePackageWithRevisions,
    SpotlightCategory
} from '@/ports/repositories';
import type {
    ManagedSqlDatabase,
    SqlDatabase,
    SqlSchemaStrategy
} from '@/infra/db/sql/database';
import { executeSql, queryAll, queryOne, sqlStatement } from '@/infra/db/sql/query';
import {
    namecardOriginalUrlFromObjectKey,
    publicMediaObjectKey
} from '@/utils/storage/business-object-keys';

type NamecardSubmissionRow = Omit<NamecardSubmissionRecord, 'favorite_idols'>;

type NamecardIdolRow = {
    card_id: number | string;
    idol_id: number | string;
    agency_code: string;
    name_cn: string;
    display_order: number | string;
};

// The legacy/guest compatibility surface (numeric card_number ids) only ever
// covers rows unified from the anonymous namecard flow; exchange-owned cards
// keep their own TEXT-id routes through the Fudaba domain.
const NAMECARD_COMPAT_ORIGIN = "origin IN ('guest', 'legacy')";

const NAMECARD_COLUMNS = `id AS internal_id, card_number, front_object_key,
    back_object_key, publication_status, revision, series_code, origin,
    created_at`;

type NamecardCardRow = {
    internal_id: string;
    card_number: number | string;
    front_object_key: string;
    back_object_key: string;
    publication_status: string;
    revision: number | string;
    series_code: string | null;
    origin: string;
    created_at: string | Date | null;
};

function toLegacyNamecardStatus(status: string): NamecardSubmissionRecord['status'] {
    return (status === 'published' ? 'approved' : status) as NamecardSubmissionRecord['status'];
}

export class SqlCoreRepository implements
    BackofficeAuthRepository,
    AdminAccountRepository,
    AuditRepository,
    NewsRepository,
    EventRepository,
    EditorialRepository,
    NamecardRepository,
    ReactionRepository,
    HomepageLinkRepository,
    SitePackageRepository {
    private initialized?: Promise<void>;

    constructor(
        private readonly database: ManagedSqlDatabase,
        private readonly schema: SqlSchemaStrategy
    ) {}

    initialize(): Promise<void> {
        this.initialized ??= this.schema.initializeCore(this.database);
        return this.initialized;
    }

    close(): Promise<void> {
        return this.database.close();
    }

    findUserByUsername(username: string): Promise<BackofficeAccountRecord | null> {
        return queryOne<BackofficeAccountRecord>(
            this.database,
            `SELECT * FROM ${this.backofficeAccountsTable} WHERE username=?`,
            [username]
        );
    }

    findUserById(id: number): Promise<BackofficeAccountRecord | null> {
        return queryOne<BackofficeAccountRecord>(
            this.database,
            `SELECT * FROM ${this.backofficeAccountsTable} WHERE id=?`,
            [id]
        );
    }

    async ensureSuperAdmin(username?: string): Promise<void> {
        const current = await queryAll<AdminAccountRecord>(this.database,
            `SELECT id, username, producername, admin_role
             FROM ${this.backofficeAccountsTable}
             WHERE dept='op' AND admin_role='super_admin'`
        );
        if (current.length > 1) throw new Error('Multiple super administrators are configured');
        if (current.length === 1) {
            if (username && current[0]!.username !== username) {
                throw new Error(
                    'IMS_SUPER_ADMIN_USERNAME does not match the configured super administrator'
                );
            }
            return;
        }
        if (!username) {
            throw new Error(
                'IMS_SUPER_ADMIN_USERNAME is required until a super administrator is configured'
            );
        }
        const target = await this.findUserByUsername(username);
        if (!target || target.dept !== 'op') {
            throw new Error('IMS_SUPER_ADMIN_USERNAME must identify an existing op account');
        }
        const result = await executeSql(this.database,
            `UPDATE ${this.backofficeAccountsTable} SET admin_role='super_admin'
             WHERE id=? AND dept='op' AND admin_role='admin'`,
            [target.id]
        );
        if (result.meta.changes !== 1) {
            throw new Error('Failed to configure the super administrator');
        }
    }

    listAdminAccounts(): Promise<AdminAccountRecord[]> {
        return queryAll<AdminAccountRecord>(this.database,
            `SELECT id, username, producername, admin_role
             FROM ${this.backofficeAccountsTable}
             WHERE dept='op' AND admin_role IN ('admin', 'super_admin')
             ORDER BY CASE admin_role WHEN 'super_admin' THEN 0 ELSE 1 END, id`
        );
    }

    async createAdminAccount(input: NewAdminAccountInput): Promise<AdminAccountRecord> {
        const created = await queryOne<AdminAccountRecord>(this.database,
            `INSERT INTO ${this.backofficeAccountsTable}
             (username, password, dept, producername, admin_role)
             VALUES (?, ?, 'op', ?, 'admin')
             RETURNING id, username, producername, admin_role`,
            [input.username, input.passwordHash, input.producername]
        );
        if (!created) throw new Error('Failed to create administrator account');
        return created;
    }

    async deleteAdminAccount(id: number): Promise<DeleteAdminAccountResult> {
        try {
            const result = await executeSql(this.database,
                `DELETE FROM ${this.backofficeAccountsTable}
                 WHERE id=? AND dept='op' AND admin_role='admin'`,
                [id]
            );
            return result.meta.changes === 1 ? 'deleted' : 'not-deletable';
        } catch (error) {
            if (this.isModerationActorReference(error)) return 'moderation-history';
            throw error;
        }
    }

    private isModerationActorReference(error: unknown): boolean {
        if (!(error instanceof Error)) return false;
        const databaseError = error as Error & { code?: string; constraint?: string };
        if (databaseError.code === '23001' || databaseError.code === '23503') {
            return new Set([
                'fudaba_moderation_cases_backoffice_actor_fk',
                'fudaba_office_public_locations_reviewed_by_fkey'
            ]).has(databaseError.constraint ?? '');
        }
        return databaseError.code?.startsWith('SQLITE_CONSTRAINT') === true &&
            /FOREIGN KEY constraint failed/i.test(databaseError.message);
    }

    async createRefreshSession(input: NewBackofficeRefreshSessionInput): Promise<void> {
        await executeSql(this.database,
            `INSERT INTO ${this.backofficeRefreshSessionsTable}
             (id, ${this.backofficeRefreshAccountIdColumn}, token_hash,
              previous_token_hash, csrf_hash,
              expires_at, created_at, updated_at, revoked_at)
             VALUES (?, ?, ?, NULL, ?, ?, ?, ?, NULL)`,
            [
                input.id,
                input.accountId,
                input.tokenHash,
                input.csrfHash,
                input.expiresAt,
                input.createdAt,
                input.createdAt
            ]
        );
    }

    findRefreshSessionByTokenHash(
        tokenHash: string
    ): Promise<BackofficeRefreshSessionRecord | null> {
        return queryOne<BackofficeRefreshSessionRecord>(this.database,
            `SELECT id, ${this.backofficeRefreshAccountIdColumn} AS account_id,
                    token_hash, previous_token_hash, csrf_hash, expires_at,
                    created_at, updated_at, revoked_at
             FROM ${this.backofficeRefreshSessionsTable}
             WHERE token_hash=? OR previous_token_hash=?
             ORDER BY CASE WHEN token_hash=? THEN 0 ELSE 1 END
             LIMIT 1`,
            [tokenHash, tokenHash, tokenHash]
        );
    }

    async rotateRefreshSession(input: {
        id: string;
        currentTokenHash: string;
        nextTokenHash: string;
        nextExpiresAt: number;
        updatedAt: number;
    }): Promise<boolean> {
        const result = await executeSql(this.database,
            `UPDATE ${this.backofficeRefreshSessionsTable}
             SET previous_token_hash=token_hash, token_hash=?, expires_at=?, updated_at=?
             WHERE id=? AND token_hash=? AND revoked_at IS NULL AND expires_at>?`,
            [
                input.nextTokenHash,
                input.nextExpiresAt,
                input.updatedAt,
                input.id,
                input.currentTokenHash,
                input.updatedAt
            ]
        );
        return result.meta.changes === 1;
    }

    async revokeRefreshSession(id: string, revokedAt: number): Promise<void> {
        await executeSql(this.database,
            `UPDATE ${this.backofficeRefreshSessionsTable}
             SET revoked_at=COALESCE(revoked_at, ?), updated_at=?
             WHERE id=?`,
            [revokedAt, revokedAt, id]
        );
    }

    async deleteExpiredRefreshSessions(now: number): Promise<void> {
        await executeSql(
            this.database,
            `DELETE FROM ${this.backofficeRefreshSessionsTable} WHERE expires_at<=?`,
            [now]
        );
    }

    private get backofficeAccountsTable(): 'backoffice_accounts' {
        return 'backoffice_accounts';
    }

    private get backofficeRefreshSessionsTable():
        'auth_refresh_sessions' | 'backoffice_refresh_sessions' {
        return 'backoffice_refresh_sessions';
    }

    private get backofficeRefreshAccountIdColumn(): 'account_id' {
        return 'account_id';
    }

    async insertAuditLog(input: AuditLogInput): Promise<void> {
        await executeSql(this.database,
            'INSERT INTO logs (username, producername, action, target, ip, time) VALUES (?, ?, ?, ?, ?, ?)',
            [input.username, input.producername, input.action, input.target, input.ip, input.time]
        );
    }

    listRecentAuditLogs(limit: number): Promise<Record<string, unknown>[]> {
        return queryAll(this.database, 'SELECT * FROM logs ORDER BY id DESC LIMIT ?', [limit]);
    }

    listPublicNews(): Promise<Record<string, unknown>[]> {
        return queryAll(this.database,
            'SELECT id, title, thumbnail, content, date FROM news ORDER BY id DESC'
        );
    }

    async findLatestPublicNewsId(): Promise<string | null> {
        const row = await queryOne<{ id: string | null }>(
            this.database,
            'SELECT CAST(MAX(id) AS TEXT) AS id FROM news'
        );
        return row?.id ?? null;
    }

    listPublicNewsByCursor(
        limit: number,
        snapshotId: string,
        afterId?: string
    ): Promise<Record<string, unknown>[]> {
        if (afterId) {
            return queryAll(this.database,
                `SELECT id, title, thumbnail, content, date FROM news
                 WHERE id<=? AND id<? ORDER BY id DESC LIMIT ?`,
                [snapshotId, afterId, limit]
            );
        }
        return queryAll(this.database,
            `SELECT id, title, thumbnail, content, date FROM news
             WHERE id<=? ORDER BY id DESC LIMIT ?`,
            [snapshotId, limit]
        );
    }

    listAdminNews(): Promise<Record<string, unknown>[]> {
        return queryAll(this.database, 'SELECT * FROM news ORDER BY id DESC');
    }

    async insertNews(input: NewsInput): Promise<number> {
        const result = await queryOne<{ id: number }>(this.database,
            `INSERT INTO news (title, image, thumbnail, content, date, author)
             VALUES (?, ?, ?, ?, ?, ?) RETURNING id`,
            [input.title, input.image, input.thumbnail, input.content, input.date, input.author]
        );
        if (!result) throw new Error('News insert did not return an ID');
        return result.id;
    }

    findNewsMedia(id: number): Promise<{ image: string; thumbnail: string } | null> {
        return queryOne(this.database, 'SELECT image, thumbnail FROM news WHERE id=?', [id]);
    }

    async deleteNews(id: number): Promise<void> {
        await executeSql(this.database, 'DELETE FROM news WHERE id=?', [id]);
    }

    async insertEvent(input: EventInput): Promise<number> {
        const result = input.operationKey
            ? await queryOne<{ id: number }>(this.database,
                `INSERT INTO events
                 (title, name, contact, image_url, operation_key, request_fingerprint,
                  publication_state)
                 VALUES (?, ?, ?, ?, ?, ?, 'publishing')
                 ON CONFLICT (operation_key) WHERE operation_key IS NOT NULL
                 DO UPDATE SET operation_key=EXCLUDED.operation_key
                 WHERE events.request_fingerprint=EXCLUDED.request_fingerprint
                 RETURNING id`,
                [
                    input.title,
                    input.name,
                    input.contact,
                    input.imageUrl,
                    input.operationKey,
                    input.requestFingerprint
                ]
            )
            : await queryOne<{ id: number }>(this.database,
                `INSERT INTO events (title, name, contact, image_url, publication_state)
                 VALUES (?, ?, ?, ?, 'ready') RETURNING id`,
                [input.title, input.name, input.contact, input.imageUrl]
            );
        if (!result) throw new Error('Event insert did not return an ID');
        return result.id;
    }

    async updateEvent(
        id: number,
        input: EventInput,
        expectedImageUrl: string
    ): Promise<boolean> {
        const result = await executeSql(
            this.database,
            `UPDATE events
             SET title=?, name=?, contact=?, image_url=?
             WHERE id=? AND image_url=?`,
            [
                input.title,
                input.name,
                input.contact,
                input.imageUrl,
                id,
                expectedImageUrl
            ]
        );
        return result.meta.changes > 0;
    }

    findEventByOperationKey(operationKey: string): Promise<Record<string, unknown> | null> {
        return queryOne(this.database, 'SELECT * FROM events WHERE operation_key=?', [operationKey]);
    }

    async markEventReady(id: number, operationKey: string): Promise<boolean> {
        const result = await executeSql(this.database,
            `UPDATE events SET publication_state='ready'
             WHERE id=? AND operation_key=? AND publication_state='publishing'`,
            [id, operationKey]
        );
        if (result.meta.changes === 1) return true;
        const current = await this.findEventByOperationKey(operationKey);
        return current?.id === id && current.publication_state === 'ready';
    }

    async countEvents(): Promise<number> {
        const row = await queryOne<{ total: number }>(
            this.database,
            `SELECT CAST(COUNT(*) AS INTEGER) AS total
             FROM events e LEFT JOIN articles a ON a.id=e.article_id
             WHERE e.publication_state='ready'
               AND (e.article_id IS NULL OR a.status='published')`
        );
        return row?.total ?? 0;
    }

    listEvents(limit: number, offset: number): Promise<Record<string, unknown>[]> {
        return queryAll(this.database,
            `SELECT e.id, COALESCE(a.title, e.title) AS title, e.name, e.contact,
                    COALESCE(a.cover_url, e.image_url) AS image_url, e.created_at,
                    e.kind, e.source_url, COALESCE(a.summary, '') AS summary,
                    e.start_at, e.end_at, e.venue_name, e.event_status,
                    jsonb_build_object(
                        'focalX', COALESCE(a.cover_focal_x, 0.5),
                        'focalY', COALESCE(a.cover_focal_y, 0.5),
                        'zoom', COALESCE(a.cover_zoom, 1)
                    ) AS cover_transform
             FROM events e LEFT JOIN articles a ON a.id=e.article_id
             WHERE e.publication_state='ready'
               AND (e.article_id IS NULL OR a.status='published')
             ORDER BY e.id DESC LIMIT ? OFFSET ?`,
            [limit, offset]
        );
    }

    async findLatestEventId(): Promise<string | null> {
        const row = await queryOne<{ id: string | null }>(
            this.database,
            `SELECT CAST(MAX(e.id) AS TEXT) AS id
             FROM events e LEFT JOIN articles a ON a.id=e.article_id
             WHERE e.publication_state='ready'
               AND (e.article_id IS NULL OR a.status='published')`
        );
        return row?.id ?? null;
    }

    listEventsByCursor(
        limit: number,
        snapshotId: string,
        afterId?: string
    ): Promise<Record<string, unknown>[]> {
        if (afterId) {
            return queryAll(this.database,
                `SELECT e.id, COALESCE(a.title, e.title) AS title, e.name, e.contact,
                        COALESCE(a.cover_url, e.image_url) AS image_url, e.created_at,
                        e.kind, e.source_url, COALESCE(a.summary, '') AS summary,
                        e.start_at, e.end_at, e.venue_name, e.event_status,
                        jsonb_build_object(
                            'focalX', COALESCE(a.cover_focal_x, 0.5),
                            'focalY', COALESCE(a.cover_focal_y, 0.5),
                            'zoom', COALESCE(a.cover_zoom, 1)
                        ) AS cover_transform
                 FROM events e LEFT JOIN articles a ON a.id=e.article_id
                 WHERE e.publication_state='ready' AND e.id<=? AND e.id<?
                   AND (e.article_id IS NULL OR a.status='published')
                 ORDER BY e.id DESC LIMIT ?`,
                [snapshotId, afterId, limit]
            );
        }
        return queryAll(this.database,
            `SELECT e.id, COALESCE(a.title, e.title) AS title, e.name, e.contact,
                    COALESCE(a.cover_url, e.image_url) AS image_url, e.created_at,
                    e.kind, e.source_url, COALESCE(a.summary, '') AS summary,
                    e.start_at, e.end_at, e.venue_name, e.event_status,
                    jsonb_build_object(
                        'focalX', COALESCE(a.cover_focal_x, 0.5),
                        'focalY', COALESCE(a.cover_focal_y, 0.5),
                        'zoom', COALESCE(a.cover_zoom, 1)
                    ) AS cover_transform
             FROM events e LEFT JOIN articles a ON a.id=e.article_id
             WHERE e.publication_state='ready' AND e.id<=?
               AND (e.article_id IS NULL OR a.status='published')
             ORDER BY e.id DESC LIMIT ?`,
            [snapshotId, limit]
        );
    }

    findEvent(id: number): Promise<Record<string, unknown> | null> {
        return queryOne(this.database,
            `SELECT e.id, COALESCE(a.title, e.title) AS title, e.name, e.contact,
                    COALESCE(a.cover_url, e.image_url) AS image_url, e.created_at,
                    jsonb_build_object(
                        'focalX', COALESCE(a.cover_focal_x, 0.5),
                        'focalY', COALESCE(a.cover_focal_y, 0.5),
                        'zoom', COALESCE(a.cover_zoom, 1)
                    ) AS cover_transform
             FROM events e LEFT JOIN articles a ON a.id=e.article_id
             WHERE e.id=? AND e.publication_state='ready'
               AND (e.article_id IS NULL OR a.status='published')`, [id]);
    }

    findEventMedia(id: number): Promise<{ image_url: string } | null> {
        return queryOne(this.database, 'SELECT image_url FROM events WHERE id=?', [id]);
    }

    async countEventMediaReferences(imageUrl: string): Promise<number> {
        const row = await queryOne<{ count: number }>(
            this.database,
            'SELECT COUNT(*) AS count FROM events WHERE image_url=?',
            [imageUrl]
        );
        return row?.count ?? 0;
    }

    async deleteEvent(id: number): Promise<boolean> {
        const result = await executeSql(this.database, 'DELETE FROM events WHERE id=?', [id]);
        return result.meta.changes > 0;
    }

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

    async importLegacyInformationPost(input: {
        legacyInformationId: string;
        category: SpotlightCategory;
        title: string;
        coverUrl: string;
        sourceUrl: string | null;
        bodyJson: Record<string, unknown>;
        bodyHtml: string;
        publishedAt: string;
    }): Promise<{ id: number; imported: boolean }> {
        return this.database.transaction(async (database) => {
            const existing = await queryOne<{ id: number }>(database,
                'SELECT id FROM events WHERE legacy_information_id=?', [input.legacyInformationId]);
            if (existing) return { id: existing.id, imported: false };
            const article = await queryOne<{ id: number }>(database,
                `INSERT INTO articles
                 (content_type, title, cover_url, body_json, body_html, status, created_at, updated_at, published_at)
                 VALUES ('event', ?, ?, ?, ?, 'published', ?, ?, ?) RETURNING id`,
                [input.title, input.coverUrl, JSON.stringify(input.bodyJson), input.bodyHtml,
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
            await executeSql(database,
                `INSERT INTO homepage_spotlight_entries (post_id, category, sort_order)
                 VALUES (?, ?, COALESCE((SELECT MAX(sort_order) + 1 FROM homepage_spotlight_entries), 0))`,
                [event.id, input.category]
            );
            return { id: event.id, imported: true };
        });
    }

    findLegacyInformationPost(legacyInformationId: string): Promise<{ id: number } | null> {
        return queryOne(this.database,
            `SELECT e.id FROM events e JOIN articles a ON a.id=e.article_id
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
        userId: number;
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

    findCardByOrderedHashes(hash1: string, hash2: string): Promise<{ id: number } | null> {
        return queryOne(this.database,
            `SELECT card.card_number AS id
             FROM namecard_guest_attributes guest
             JOIN fudaba_cards card ON card.id=guest.card_id
             WHERE guest.hash1=? AND guest.hash2=?
               AND card.publication_status NOT IN ('withdrawn','rejected')`,
            [hash1, hash2]
        );
    }

    private async validateNamecardSelection(
        database: SqlDatabase,
        seriesCode: string | null,
        idolIds: readonly number[],
        submissionKind: NamecardSubmissionKind
    ): Promise<CardIdolSelectionRecord[]> {
        if (submissionKind === 'guest' && !seriesCode) {
            throw new Error('Guest namecard submissions require a series code');
        }
        if (submissionKind === 'guest' && (idolIds.length < 1 || idolIds.length > 20)) {
            throw new Error('Guest namecard submissions require between 1 and 20 idols');
        }
        if (idolIds.length > 20 || new Set(idolIds).size !== idolIds.length) {
            throw new Error('Namecard idol selections must be unique and contain at most 20 idols');
        }
        if (seriesCode) {
            const series = await queryOne<{ code: string }>(
                database,
                'SELECT code FROM agencies WHERE code=?',
                [seriesCode]
            );
            if (!series) throw new Error('Namecard series does not exist');
        }
        if (!idolIds.length) return [];
        const placeholders = idolIds.map(() => '?').join(', ');
        const rows = await queryAll<Omit<NamecardIdolRow, 'card_id' | 'display_order'>>(
            database,
            `SELECT idol.id AS idol_id, agency.code AS agency_code, idol.name_cn
             FROM idols idol
             JOIN agencies agency ON agency.id=idol.agency_id
             WHERE idol.id IN (${placeholders}) AND idol.deleted_at IS NULL`,
            idolIds
        );
        const byId = new Map(rows.map((row) => [Number(row.idol_id), row]));
        if (byId.size !== idolIds.length) {
            throw new Error('One or more selected namecard idols do not exist');
        }
        return idolIds.map((idolId, displayOrder) => {
            const idol = byId.get(idolId)!;
            return {
                idol_id: idolId,
                agency_code: idol.agency_code,
                name_cn: idol.name_cn,
                display_order: displayOrder
            };
        });
    }

    private async listNamecardIdols(
        database: SqlDatabase,
        internalIds: readonly string[]
    ): Promise<Map<string, CardIdolSelectionRecord[]>> {
        const grouped = new Map<string, CardIdolSelectionRecord[]>();
        for (const internalId of internalIds) grouped.set(internalId, []);
        if (!internalIds.length) return grouped;
        const placeholders = internalIds.map(() => '?').join(', ');
        const rows = await queryAll<NamecardIdolRow>(
            database,
            `SELECT selected.card_id, selected.idol_id, agency.code AS agency_code,
                    idol.name_cn, selected.display_order
             FROM fudaba_card_idols selected
             JOIN idols idol ON idol.id=selected.idol_id
             JOIN agencies agency ON agency.id=idol.agency_id
             WHERE selected.card_id IN (${placeholders})
             ORDER BY selected.card_id, selected.display_order`,
            internalIds
        );
        for (const row of rows) {
            grouped.get(String(row.card_id))?.push({
                idol_id: Number(row.idol_id),
                agency_code: row.agency_code,
                name_cn: row.name_cn,
                display_order: Number(row.display_order)
            });
        }
        return grouped;
    }

    private namecardRecordFromRow(row: NamecardCardRow): NamecardSubmissionRow {
        return {
            id: Number(row.card_number),
            image1_url: namecardOriginalUrlFromObjectKey(row.front_object_key),
            image2_url: namecardOriginalUrlFromObjectKey(row.back_object_key),
            status: toLegacyNamecardStatus(row.publication_status),
            revision: Number(row.revision),
            series_code: row.series_code,
            submission_kind: row.origin === 'guest' ? 'guest' : 'legacy',
            created_at: row.created_at
        };
    }

    private async attachNamecardIdols(
        database: SqlDatabase,
        rows: readonly NamecardCardRow[]
    ): Promise<Array<NamecardSubmissionRow & { favorite_idols: CardIdolSelectionRecord[] }>> {
        const idols = await this.listNamecardIdols(database, rows.map((row) => row.internal_id));
        return rows.map((row) => {
            const favoriteIdols = idols.get(row.internal_id) ?? [];
            const record = this.namecardRecordFromRow(row);
            return {
                ...record,
                favorite_idols: favoriteIdols,
                seriesCode: record.series_code ?? null,
                submissionKind: record.submission_kind ?? 'legacy',
                favoriteIdols
            };
        });
    }

    private async attachOneNamecard(
        database: SqlDatabase,
        row: NamecardCardRow | null
    ): Promise<NamecardSubmissionRecord | null> {
        if (!row) return null;
        return (await this.attachNamecardIdols(database, [row]))[0] ?? null;
    }

    async insertPendingCard(input: PendingCardInput): Promise<number> {
        const submissionKind = input.submissionKind ?? 'guest';
        const idolIds = input.idolIds ?? [];
        const idPrefix = submissionKind === 'legacy' ? 'legacy' : 'guest';
        const frontKey = publicMediaObjectKey(input.image1Url);
        const backKey = publicMediaObjectKey(input.image2Url);
        return this.database.transaction(async (database) => {
            const idols = await this.validateNamecardSelection(
                database,
                input.seriesCode ?? null,
                idolIds,
                submissionKind
            );
            const created = await queryOne<{ id: string; card_number: number | string }>(
                database,
                `WITH allocated AS (
                     SELECT nextval('public.namecard_number_seq') AS card_number
                 )
                 INSERT INTO fudaba_cards
                    (id, card_number, origin, series_code, producer_name,
                     display_name, front_object_key, back_object_key, accent,
                     bio, trade_note, available, media_rights_status,
                     publication_status, revision, created_at, updated_at)
                 SELECT ? || '-' || allocated.card_number::text, allocated.card_number,
                        ?, ?, ?, ?, ?, ?, ?, ?, NULL, FALSE, 'unknown', 'pending',
                        0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
                 FROM allocated
                 RETURNING id, card_number`,
                [
                    idPrefix,
                    idPrefix,
                    input.seriesCode ?? null,
                    input.producerName ?? null,
                    input.displayName ?? null,
                    frontKey,
                    backKey,
                    input.accent ?? null,
                    input.bio ?? null
                ]
            );
            if (!created) throw new Error('Card insert did not return an ID');
            if (idols.length) {
                await database.batch(idols.map((idol) => database.prepare(
                    `INSERT INTO fudaba_card_idols (card_id, idol_id, display_order)
                     VALUES (?, ?, ?)`
                ).bind(created.id, idol.idol_id, idol.display_order)));
            }
            await executeSql(database,
                `INSERT INTO namecard_guest_attributes
                    (card_id, hash1, hash2, submitted_ip, withdrawal_token_hash)
                 VALUES (?, ?, ?, ?, ?)`,
                [created.id, input.hash1, input.hash2, input.ip, input.withdrawalTokenHash]
            );
            return Number(created.card_number);
        });
    }

    async countApprovedCards(): Promise<number> {
        const row = await queryOne<{ total: number }>(this.database,
            `SELECT CAST(COUNT(*) AS INTEGER) AS total FROM fudaba_cards
             WHERE ${NAMECARD_COMPAT_ORIGIN} AND publication_status='published'
               AND deleted_at IS NULL`
        );
        return row?.total ?? 0;
    }

    async countAdminCards(): Promise<number> {
        const row = await queryOne<{ total: number }>(this.database,
            `SELECT CAST(COUNT(*) AS INTEGER) AS total FROM fudaba_cards
             WHERE ${NAMECARD_COMPAT_ORIGIN}
               AND publication_status NOT IN ('withdrawn','rejected')
               AND deleted_at IS NULL`
        );
        return row?.total ?? 0;
    }

    async listApprovedCards(limit: number, offset: number): Promise<NamecardPublicRecord[]> {
        const rows = await queryAll<NamecardCardRow>(this.database,
            `SELECT ${NAMECARD_COLUMNS} FROM fudaba_cards
             WHERE ${NAMECARD_COMPAT_ORIGIN} AND publication_status='published'
               AND deleted_at IS NULL
             ORDER BY card_number DESC LIMIT ? OFFSET ?`,
            [limit, offset]
        );
        return await this.attachNamecardIdols(this.database, rows) as NamecardPublicRecord[];
    }

    async findApprovedCardMedia(id: number): Promise<CardMediaRecord | null> {
        const row = await queryOne<NamecardCardRow>(this.database,
            `SELECT ${NAMECARD_COLUMNS} FROM fudaba_cards
             WHERE card_number=? AND ${NAMECARD_COMPAT_ORIGIN}
               AND publication_status='published' AND deleted_at IS NULL`,
            [id]
        );
        return this.attachOneNamecard(this.database, row);
    }

    async listAdminCards(limit: number, offset: number): Promise<NamecardSubmissionRecord[]> {
        const rows = await queryAll<NamecardCardRow>(this.database,
            `SELECT ${NAMECARD_COLUMNS} FROM fudaba_cards
             WHERE ${NAMECARD_COMPAT_ORIGIN}
               AND publication_status NOT IN ('withdrawn','rejected')
               AND deleted_at IS NULL
             ORDER BY card_number DESC LIMIT ? OFFSET ?`,
            [limit, offset]
        );
        return this.attachNamecardIdols(this.database, rows);
    }

    async beginCardApproval(
        id: number,
        expectedRevision: number
    ): Promise<NamecardApprovalClaim> {
        const claimedRow = await queryOne<NamecardCardRow>(this.database,
            `UPDATE fudaba_cards SET publication_status='approving', revision=revision+1,
                    updated_at=CURRENT_TIMESTAMP
             WHERE card_number=? AND ${NAMECARD_COMPAT_ORIGIN}
               AND publication_status='pending' AND revision=? AND deleted_at IS NULL
             RETURNING ${NAMECARD_COLUMNS}`,
            [id, expectedRevision]
        );
        const claimed = await this.attachOneNamecard(this.database, claimedRow);
        if (claimed) return { status: 'claimed', card: claimed };
        const current = await this.findSubmission(id);
        if (!current) return { status: 'not-found' };
        if (current.status === 'withdrawn') {
            return { status: 'withdrawn', revision: current.revision };
        }
        if (
            current.status === 'approving' &&
            (current.revision === expectedRevision || current.revision === expectedRevision + 1)
        ) {
            return { status: 'resumed', card: current };
        }
        return { status: 'conflict', revision: current.revision };
    }

    async completeCardApproval(
        id: number,
        approvingRevision: number
    ): Promise<NamecardMutationResult> {
        const updatedRow = await queryOne<NamecardCardRow>(this.database,
            `UPDATE fudaba_cards
             SET publication_status='published', media_rights_status='approved',
                 revision=revision+1, updated_at=CURRENT_TIMESTAMP
             WHERE card_number=? AND ${NAMECARD_COMPAT_ORIGIN}
               AND publication_status='approving' AND revision=? AND deleted_at IS NULL
             RETURNING ${NAMECARD_COLUMNS}`,
            [id, approvingRevision]
        );
        const updated = await this.attachOneNamecard(this.database, updatedRow);
        if (updated) return { status: 'updated', card: updated };
        const current = await this.findSubmission(id);
        if (!current) return { status: 'not-found' };
        if (current.status === 'approved' && current.revision === approvingRevision + 1) {
            return { status: 'updated', card: current };
        }
        return { status: 'conflict', revision: current.revision };
    }

    async findCardMedia(id: number): Promise<CardMediaRecord | null> {
        return this.findSubmission(id);
    }

    async deleteCard(id: number, expectedRevision: number): Promise<NamecardMutationResult> {
        return this.database.transaction(async (database) => {
            const currentRow = await queryOne<NamecardCardRow>(database,
                `SELECT ${NAMECARD_COLUMNS} FROM fudaba_cards
                 WHERE card_number=? AND ${NAMECARD_COMPAT_ORIGIN} AND deleted_at IS NULL
                 FOR UPDATE`,
                [id]
            );
            const current = await this.attachOneNamecard(database, currentRow);
            if (!current) return { status: 'not-found' };
            if (current.revision !== expectedRevision) {
                return { status: 'conflict', revision: current.revision };
            }
            const deleted = await executeSql(
                database,
                `DELETE FROM fudaba_cards WHERE card_number=? AND revision=? AND ${NAMECARD_COMPAT_ORIGIN}`,
                [id, expectedRevision]
            );
            return deleted.meta.changes === 1
                ? { status: 'updated', card: current }
                : { status: 'conflict', revision: current.revision };
        });
    }

    async rejectSubmission(
        id: number,
        expectedRevision: number
    ): Promise<NamecardMutationResult> {
        return this.database.transaction(async (database) => {
            const updatedRow = await queryOne<NamecardCardRow>(database,
                `UPDATE fudaba_cards SET publication_status='rejected', revision=revision+1,
                        updated_at=CURRENT_TIMESTAMP
                 WHERE card_number=? AND ${NAMECARD_COMPAT_ORIGIN}
                   AND publication_status='pending' AND revision=? AND deleted_at IS NULL
                 RETURNING ${NAMECARD_COLUMNS}`,
                [id, expectedRevision]
            );
            if (updatedRow) {
                await executeSql(database,
                    'UPDATE namecard_guest_attributes SET rejected_at=CURRENT_TIMESTAMP WHERE card_id=?',
                    [updatedRow.internal_id]
                );
                const updated = await this.attachOneNamecard(database, updatedRow);
                return { status: 'updated', card: updated! };
            }
            const current = await this.findSubmission(id, database);
            if (!current) return { status: 'not-found' };
            if (current.status === 'withdrawn') {
                return { status: 'withdrawn', revision: current.revision };
            }
            return { status: 'conflict', revision: current.revision };
        });
    }

    async purgeTerminalCards(
        cutoff: Date
    ): Promise<Array<{ id: number; image1_url: string; image2_url: string }>> {
        const rows = await queryAll<{
            card_number: number | string;
            front_object_key: string;
            back_object_key: string;
        }>(this.database,
            `DELETE FROM fudaba_cards
             WHERE id IN (
                 SELECT card.id FROM fudaba_cards card
                 JOIN namecard_guest_attributes guest ON guest.card_id=card.id
                 WHERE card.${NAMECARD_COMPAT_ORIGIN}
                   AND card.publication_status IN ('withdrawn','rejected')
                   AND COALESCE(guest.withdrawn_at, guest.rejected_at, card.created_at) <= ?
             )
             RETURNING card_number, front_object_key, back_object_key`,
            [cutoff]
        );
        return rows.map((row) => ({
            id: Number(row.card_number),
            image1_url: namecardOriginalUrlFromObjectKey(row.front_object_key),
            image2_url: namecardOriginalUrlFromObjectKey(row.back_object_key)
        }));
    }

    private async findSubmission(
        id: number,
        database: SqlDatabase = this.database
    ): Promise<NamecardSubmissionRecord | null> {
        const row = await queryOne<NamecardCardRow>(database,
            `SELECT ${NAMECARD_COLUMNS} FROM fudaba_cards
             WHERE card_number=? AND ${NAMECARD_COMPAT_ORIGIN} AND deleted_at IS NULL`,
            [id]
        );
        return this.attachOneNamecard(database, row);
    }

    async findSubmissionByTokenHash(
        id: number,
        tokenHash: string,
        database: SqlDatabase = this.database
    ): Promise<NamecardSubmissionRecord | null> {
        const row = await queryOne<NamecardCardRow>(database,
            `SELECT ${NAMECARD_COLUMNS} FROM fudaba_cards card
             JOIN namecard_guest_attributes guest ON guest.card_id=card.id
             WHERE card.card_number=? AND card.${NAMECARD_COMPAT_ORIGIN}
               AND card.deleted_at IS NULL AND guest.withdrawal_token_hash=?`,
            [id, tokenHash]
        );
        return this.attachOneNamecard(database, row);
    }

    async findSubmissionWithHashesByTokenHash(
        id: number,
        tokenHash: string
    ): Promise<NamecardSubmissionWithHashesRecord | null> {
        const row = await queryOne<NamecardCardRow & { hash1: string; hash2: string }>(
            this.database,
            `SELECT ${NAMECARD_COLUMNS}, guest.hash1, guest.hash2
             FROM fudaba_cards card
             JOIN namecard_guest_attributes guest ON guest.card_id=card.id
             WHERE card.card_number=? AND card.${NAMECARD_COMPAT_ORIGIN}
               AND card.deleted_at IS NULL AND guest.withdrawal_token_hash=?`,
            [id, tokenHash]
        );
        if (!row) return null;
        const attached = await this.attachOneNamecard(this.database, row);
        if (!attached) return null;
        return { ...attached, hash1: row.hash1, hash2: row.hash2 };
    }

    async withdrawSubmission(
        id: number,
        tokenHash: string,
        expectedRevision: number
    ): Promise<NamecardMutationResult> {
        return this.database.transaction(async (database) => {
            const updatedRow = await queryOne<NamecardCardRow>(database,
                `UPDATE fudaba_cards card
                 SET publication_status='withdrawn', revision=revision+1,
                     updated_at=CURRENT_TIMESTAMP
                 FROM namecard_guest_attributes guest
                 WHERE guest.card_id=card.id AND card.card_number=?
                   AND card.${NAMECARD_COMPAT_ORIGIN}
                   AND guest.withdrawal_token_hash=? AND card.publication_status='pending'
                   AND card.revision=? AND card.deleted_at IS NULL
                 RETURNING card.id AS internal_id, card.card_number,
                           card.front_object_key, card.back_object_key,
                           card.publication_status, card.revision,
                           card.series_code, card.origin, card.created_at`,
                [id, tokenHash, expectedRevision]
            );
            if (updatedRow) {
                await executeSql(database,
                    'UPDATE namecard_guest_attributes SET withdrawn_at=CURRENT_TIMESTAMP WHERE card_id=?',
                    [updatedRow.internal_id]
                );
                const updated = await this.attachOneNamecard(database, updatedRow);
                return { status: 'updated', card: updated! };
            }
            const current = await this.findSubmissionByTokenHash(id, tokenHash, database);
            if (!current) return { status: 'not-found' };
            return { status: 'conflict', revision: current.revision };
        });
    }

    async replaceSubmissionImage(
        id: number,
        tokenHash: string,
        expectedRevision: number,
        side: 'front' | 'back',
        imageUrl: string,
        hash: string
    ): Promise<NamecardEditResult> {
        const objectKeyColumn = side === 'front' ? 'front_object_key' : 'back_object_key';
        const hashColumn = side === 'front' ? 'hash1' : 'hash2';
        const key = publicMediaObjectKey(imageUrl);
        return this.database.transaction(async (database) => {
            const updatedRow = await queryOne<NamecardCardRow>(database,
                `UPDATE fudaba_cards card
                 SET ${objectKeyColumn}=?, revision=revision+1, updated_at=CURRENT_TIMESTAMP
                 FROM namecard_guest_attributes guest
                 WHERE guest.card_id=card.id AND card.card_number=?
                   AND card.${NAMECARD_COMPAT_ORIGIN}
                   AND guest.withdrawal_token_hash=?
                   AND card.publication_status IN ('withdrawn','rejected')
                   AND card.revision=? AND card.deleted_at IS NULL
                 RETURNING card.id AS internal_id, card.card_number,
                           card.front_object_key, card.back_object_key,
                           card.publication_status, card.revision,
                           card.series_code, card.origin, card.created_at`,
                [key, id, tokenHash, expectedRevision]
            );
            if (updatedRow) {
                await executeSql(database,
                    `UPDATE namecard_guest_attributes SET ${hashColumn}=? WHERE card_id=?`,
                    [hash, updatedRow.internal_id]
                );
                const updated = await this.attachOneNamecard(database, updatedRow);
                return { status: 'updated', card: updated! };
            }
            const current = await this.findSubmissionByTokenHash(id, tokenHash, database);
            if (!current) return { status: 'not-found' };
            return { status: 'conflict', revision: current.revision };
        });
    }

    async resubmitSubmission(
        id: number,
        tokenHash: string,
        expectedRevision: number
    ): Promise<NamecardEditResult> {
        return this.database.transaction(async (database) => {
            const updatedRow = await queryOne<NamecardCardRow>(database,
                `UPDATE fudaba_cards card
                 SET publication_status='pending', revision=revision+1,
                     updated_at=CURRENT_TIMESTAMP
                 FROM namecard_guest_attributes guest
                 WHERE guest.card_id=card.id AND card.card_number=?
                   AND card.${NAMECARD_COMPAT_ORIGIN}
                   AND guest.withdrawal_token_hash=?
                   AND card.publication_status IN ('withdrawn','rejected')
                   AND card.revision=? AND card.deleted_at IS NULL
                 RETURNING card.id AS internal_id, card.card_number,
                           card.front_object_key, card.back_object_key,
                           card.publication_status, card.revision,
                           card.series_code, card.origin, card.created_at`,
                [id, tokenHash, expectedRevision]
            );
            if (updatedRow) {
                await executeSql(database,
                    `UPDATE namecard_guest_attributes
                     SET withdrawn_at=NULL, rejected_at=NULL WHERE card_id=?`,
                    [updatedRow.internal_id]
                );
                const updated = await this.attachOneNamecard(database, updatedRow);
                return { status: 'updated', card: updated! };
            }
            const current = await this.findSubmissionByTokenHash(id, tokenHash, database);
            if (!current) return { status: 'not-found' };
            return { status: 'conflict', revision: current.revision };
        });
    }

    async findCardByMediaUrl(url: string): Promise<CardMediaRecord | null> {
        let key: string;
        try {
            key = publicMediaObjectKey(url);
        } catch {
            return null;
        }
        const row = await queryOne<NamecardCardRow>(this.database,
            `SELECT ${NAMECARD_COLUMNS} FROM fudaba_cards
             WHERE (front_object_key=? OR back_object_key=?) AND ${NAMECARD_COMPAT_ORIGIN}
               AND deleted_at IS NULL LIMIT 1`,
            [key, key]
        );
        return this.attachOneNamecard(this.database, row);
    }

    findApprovedCard(id: number): Promise<{ id: number } | null> {
        return queryOne(this.database,
            `SELECT card_number AS id FROM fudaba_cards
             WHERE card_number=? AND ${NAMECARD_COMPAT_ORIGIN}
               AND publication_status='published' AND deleted_at IS NULL`,
            [id]
        );
    }

    listReactions(cardId: number): Promise<Array<{ emoji: string; count: number }>> {
        return queryAll(this.database,
            `SELECT reaction.emoji, reaction.count
             FROM namecard_reactions reaction
             JOIN fudaba_cards card ON card.id=reaction.card_id
             WHERE card.card_number=?
             ORDER BY reaction.count DESC`,
            [cardId]
        );
    }

    async incrementReaction(cardId: number, emoji: string): Promise<void> {
        await executeSql(this.database,
            `INSERT INTO namecard_reactions (card_id, emoji, count)
             SELECT id, ?, 1 FROM fudaba_cards WHERE card_number=?
             ON CONFLICT(card_id, emoji) DO UPDATE SET count=namecard_reactions.count+1`,
            [emoji, cardId]
        );
    }

    async decrementAndPruneReaction(cardId: number, emoji: string): Promise<void> {
        await this.database.batch([
            sqlStatement(this.database,
                `UPDATE namecard_reactions SET count=count-1
                 WHERE emoji=? AND count>0
                   AND card_id=(SELECT id FROM fudaba_cards WHERE card_number=?)`,
                [emoji, cardId]
            ),
            sqlStatement(this.database,
                `DELETE FROM namecard_reactions WHERE emoji=? AND count<=0
                   AND card_id=(SELECT id FROM fudaba_cards WHERE card_number=?)`,
                [emoji, cardId]
            )
        ]);
    }

    listHomepageLinks(section?: HomepageLinkSection): Promise<HomepageLinkRecord[]> {
        return section
            ? queryAll<HomepageLinkRecord>(this.database,
                `SELECT * FROM homepage_links WHERE section=?
                 ORDER BY display_order, id`,
                [section]
            )
            : queryAll<HomepageLinkRecord>(this.database,
                'SELECT * FROM homepage_links ORDER BY section, display_order, id'
            );
    }

    findHomepageLinkById(id: string): Promise<HomepageLinkRecord | null> {
        return queryOne(this.database, 'SELECT * FROM homepage_links WHERE id=?', [id]);
    }

    async createHomepageLink(input: NewHomepageLinkInput): Promise<HomepageLinkRecord> {
        const created = await queryOne<HomepageLinkRecord>(this.database,
            `INSERT INTO homepage_links
             (id, section, title, description, href, icon, accent, display_order,
              created_at, updated_at)
             SELECT ?, ?, ?, ?, ?, ?, ?, COALESCE(MAX(display_order) + 1, 0), ?, ?
             FROM homepage_links WHERE section=?
             RETURNING *`,
            [
                input.id,
                input.section,
                input.title,
                input.description,
                input.href,
                input.icon,
                input.accent,
                input.createdAt,
                input.createdAt,
                input.section
            ]
        );
        if (!created) throw new Error('Homepage link insert failed');
        return created;
    }

    updateHomepageLink(
        id: string,
        input: HomepageLinkUpdateInput
    ): Promise<HomepageLinkRecord | null> {
        return queryOne<HomepageLinkRecord>(this.database,
            `UPDATE homepage_links
             SET title=?, description=?, href=?, icon=?, accent=?, updated_at=?
             WHERE id=? RETURNING *`,
            [
                input.title,
                input.description,
                input.href,
                input.icon,
                input.accent,
                input.updatedAt,
                id
            ]
        );
    }

    async deleteHomepageLink(id: string): Promise<boolean> {
        const result = await executeSql(this.database, 'DELETE FROM homepage_links WHERE id=?', [id]);
        return result.meta.changes === 1;
    }

    async reorderHomepageLinks(
        section: HomepageLinkSection,
        ids: readonly string[],
        updatedAt: number
    ): Promise<boolean> {
        if (!ids.length) return (await this.listHomepageLinks(section)).length === 0;
        const positions = ids.map(() => 'WHEN ? THEN ?').join(' ');
        const placeholders = ids.map(() => '?').join(', ');
        const values: unknown[] = [];
        ids.forEach((id, index) => values.push(id, index));
        values.push(updatedAt, section, ...ids, section, ids.length);
        const result = await executeSql(this.database,
            `UPDATE homepage_links
             SET display_order=CASE id ${positions} ELSE display_order END,
                 updated_at=?
             WHERE section=? AND id IN (${placeholders})
               AND (SELECT COUNT(*) FROM homepage_links WHERE section=?)=?`,
            values
        );
        return result.meta.changes === ids.length;
    }

    async listSitePackages(): Promise<SitePackageWithRevisions[]> {
        const packages = await queryAll<SitePackageRecord>(this.database,
            'SELECT * FROM site_packages ORDER BY updated_at DESC, slug ASC'
        );
        if (!packages.length) return [];
        const revisions = await queryAll<SitePackageRevisionRecord>(this.database,
            `SELECT * FROM site_package_revisions
             ORDER BY package_id ASC, revision_number DESC`
        );
        const byPackage = new Map<string, SitePackageRevisionRecord[]>();
        for (const revision of revisions) {
            const current = byPackage.get(revision.package_id) || [];
            current.push(revision);
            byPackage.set(revision.package_id, current);
        }
        return packages.map((sitePackage) => ({
            ...sitePackage,
            revisions: byPackage.get(sitePackage.id) || []
        }));
    }

    findSitePackageById(id: string): Promise<SitePackageRecord | null> {
        return queryOne(this.database, 'SELECT * FROM site_packages WHERE id=?', [id]);
    }

    findSitePackageBySlug(slug: string): Promise<SitePackageRecord | null> {
        return queryOne(this.database, 'SELECT * FROM site_packages WHERE slug=?', [slug]);
    }

    findSitePackageRevisionById(
        packageId: string,
        revisionId: string
    ): Promise<SitePackageRevisionRecord | null> {
        return queryOne(this.database,
            'SELECT * FROM site_package_revisions WHERE package_id=? AND id=?',
            [packageId, revisionId]
        );
    }

    findSitePackageRevisionByPreviewTokenHash(
        previewTokenHash: string
    ): Promise<(SitePackageRevisionRecord & { slug: string }) | null> {
        return queryOne(this.database,
            `SELECT r.*, p.slug
             FROM site_package_revisions r
             INNER JOIN site_packages p ON p.id=r.package_id
             WHERE r.preview_token_hash=?`,
            [previewTokenHash]
        );
    }

    async createSitePackageWithRevision(
        sitePackage: NewSitePackageInput,
        revision: NewSitePackageRevisionInput
    ): Promise<void> {
        if (sitePackage.id !== revision.packageId) {
            throw new Error('Site package revision belongs to another package');
        }
        await this.database.batch([
            sqlStatement(this.database,
                `INSERT INTO site_packages
                 (id, slug, title, description, published_revision_id,
                  created_by, updated_by, created_at, updated_at)
                 VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?)`,
                [
                    sitePackage.id,
                    sitePackage.slug,
                    sitePackage.title,
                    sitePackage.description,
                    sitePackage.createdBy,
                    sitePackage.createdBy,
                    sitePackage.createdAt,
                    sitePackage.createdAt
                ]
            ),
            this.sitePackageRevisionStatement(revision, 1)
        ]);
    }

    async createSitePackageRevision(
        revision: NewSitePackageRevisionInput
    ): Promise<SitePackageRevisionRecord> {
        await this.database.batch([
            sqlStatement(this.database,
                'UPDATE site_packages SET updated_by=?, updated_at=? WHERE id=?',
                [revision.createdBy, revision.createdAt, revision.packageId]
            ),
            this.nextSitePackageRevisionStatement(revision)
        ]);
        const created = await this.findSitePackageRevisionById(revision.packageId, revision.id);
        if (!created) throw new Error('Site package revision insert failed');
        return created;
    }

    async publishSitePackageRevision(
        packageId: string,
        revisionId: string,
        updatedBy: number,
        publishedAt: number
    ): Promise<SitePackagePublicationResult | null> {
        const results = await this.database.batch([
            sqlStatement(this.database,
                `UPDATE site_packages
                 SET published_revision_id=?, updated_by=?, updated_at=?
                 WHERE id=? AND EXISTS (
                     SELECT 1 FROM site_package_revisions AS revision
                     WHERE revision.package_id=? AND revision.id=? AND revision.state='ready'
                       AND (
                           revision.published_at IS NULL
                           OR site_packages.published_revision_id=?
                       )
                 )`,
                [
                    revisionId,
                    updatedBy,
                    publishedAt,
                    packageId,
                    packageId,
                    revisionId,
                    revisionId
                ]
            ),
            sqlStatement(this.database,
                `UPDATE site_packages
                 SET published_revision_id=?, updated_by=?, updated_at=?
                 WHERE id=?
                   AND (published_revision_id IS NULL OR published_revision_id<>?)
                   AND EXISTS (
                     SELECT 1 FROM site_package_revisions AS revision
                     WHERE revision.package_id=? AND revision.id=? AND revision.state='ready'
                       AND revision.published_at IS NOT NULL
                 )`,
                [
                    revisionId,
                    updatedBy,
                    publishedAt,
                    packageId,
                    revisionId,
                    packageId,
                    revisionId
                ]
            ),
            sqlStatement(this.database,
                `UPDATE site_package_revisions SET published_at=COALESCE(published_at, ?)
                 WHERE package_id=? AND id=? AND state='ready'`,
                [publishedAt, packageId, revisionId]
            )
        ]);
        const operation = (results[0]?.meta.changes ?? 0) > 0
            ? 'publish'
            : (results[1]?.meta.changes ?? 0) > 0
                ? 'rollback'
                : null;
        const [revision, currentPackage] = await Promise.all([
            this.findSitePackageRevisionById(packageId, revisionId),
            operation ? Promise.resolve(null) : this.findSitePackageById(packageId)
        ]);
        if (
            !operation &&
            revision?.state === 'ready' &&
            currentPackage?.published_revision_id === revisionId
        ) {
            return { revision, operation: 'noop' };
        }
        if (!operation) return null;
        if (!revision) throw new Error('Published site package revision could not be read');
        return { revision, operation };
    }

    deleteSitePackageRevision(
        input: DeleteSitePackageRevisionInput
    ): Promise<SitePackageRevisionDeletionResult | null> {
        return this.database.transaction(async (database) => {
            const sitePackage = await queryOne<SitePackageRecord>(
                database,
                'SELECT * FROM site_packages WHERE id=? FOR UPDATE',
                [input.packageId]
            );
            if (!sitePackage) return null;
            const revision = await queryOne<SitePackageRevisionRecord>(
                database,
                'SELECT * FROM site_package_revisions WHERE package_id=? AND id=?',
                [input.packageId, input.revisionId]
            );
            if (!revision) return null;
            if (sitePackage.published_revision_id === revision.id) {
                return {
                    kind: 'published',
                    revision,
                    sitePackage,
                    packageDeleted: false
                };
            }
            const prefix = `site-packages/${input.packageId}/revisions/${input.revisionId}/`;
            await database.prepare(
                `INSERT INTO object_deletion_jobs
                    (id, resource_type, resource_id, target_kind, target, state,
                     attempts, next_attempt_at, created_at, updated_at)
                 VALUES (?, 'site-package-revision', ?, 'prefix', ?, 'pending', 0, ?, ?, ?)`
            ).bind(
                input.deletionJobId,
                input.revisionId,
                prefix,
                input.deletedAt,
                input.deletedAt,
                input.deletedAt
            ).run();
            const deleted = await database.prepare(
                `DELETE FROM site_package_revisions
                 WHERE package_id=? AND id=?`
            ).bind(input.packageId, input.revisionId).run();
            if (deleted.meta.changes !== 1) {
                throw new Error('Site package revision delete lost its lock');
            }
            const removedPackage = await database.prepare(
                `DELETE FROM site_packages
                 WHERE id=? AND published_revision_id IS NULL
                   AND NOT EXISTS (
                       SELECT 1 FROM site_package_revisions WHERE package_id=?
                   )`
            ).bind(input.packageId, input.packageId).run();
            const packageDeleted = removedPackage.meta.changes === 1;
            if (!packageDeleted) {
                await database.prepare(
                    `UPDATE site_packages SET updated_by=?, updated_at=? WHERE id=?`
                ).bind(input.deletedBy, input.deletedAt, input.packageId).run();
            }
            return { kind: 'deleted', revision, sitePackage, packageDeleted };
        });
    }

    async rotateSitePackagePreviewToken(
        packageId: string,
        revisionId: string,
        previewTokenHash: string
    ): Promise<boolean> {
        const result = await executeSql(this.database,
            `UPDATE site_package_revisions SET preview_token_hash=?
             WHERE package_id=? AND id=?`,
            [previewTokenHash, packageId, revisionId]
        );
        return result.meta.changes > 0;
    }

    private sitePackageRevisionStatement(
        revision: NewSitePackageRevisionInput,
        revisionNumber: number
    ) {
        return sqlStatement(this.database,
            `INSERT INTO site_package_revisions
             (id, package_id, revision_number, entry_path, runtime_mode, state,
              file_count, total_bytes, source_key, source_sha256, manifest_key,
              manifest_json, preview_token_hash, created_by, created_at, published_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
            [
                revision.id,
                revision.packageId,
                revisionNumber,
                revision.entryPath,
                revision.runtimeMode,
                revision.state,
                revision.fileCount,
                revision.totalBytes,
                revision.sourceKey,
                revision.sourceSha256,
                revision.manifestKey,
                revision.manifestJson,
                revision.previewTokenHash,
                revision.createdBy,
                revision.createdAt
            ]
        );
    }

    private nextSitePackageRevisionStatement(revision: NewSitePackageRevisionInput) {
        return sqlStatement(this.database,
            `INSERT INTO site_package_revisions
             (id, package_id, revision_number, entry_path, runtime_mode, state,
              file_count, total_bytes, source_key, source_sha256, manifest_key,
              manifest_json, preview_token_hash, created_by, created_at, published_at)
             SELECT ?, ?, CAST(COALESCE(MAX(revision_number), 0) + 1 AS INTEGER),
                    ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL
             FROM site_package_revisions WHERE package_id=?`,
            [
                revision.id,
                revision.packageId,
                revision.entryPath,
                revision.runtimeMode,
                revision.state,
                revision.fileCount,
                revision.totalBytes,
                revision.sourceKey,
                revision.sourceSha256,
                revision.manifestKey,
                revision.manifestJson,
                revision.previewTokenHash,
                revision.createdBy,
                revision.createdAt,
                revision.packageId
            ]
        );
    }
}
