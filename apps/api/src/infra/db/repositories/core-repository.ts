import type {
    AuditLogInput,
    AuditRepository,
    AuthRepository,
    CardMediaRecord,
    EventRepository,
    EventInput,
    NamecardRepository,
    NewRefreshSessionInput,
    NewSitePackageInput,
    NewSitePackageRevisionInput,
    NewsRepository,
    NewsInput,
    PendingCardInput,
    ReactionRepository,
    RefreshSessionRecord,
    SitePackageRecord,
    SitePackagePublicationResult,
    SitePackageRepository,
    SitePackageRevisionRecord,
    SitePackageWithRevisions,
    UserRecord
} from '@/ports/repositories';
import type {
    ManagedSqlDatabase,
    SqlSchemaStrategy
} from '@/infra/db/sql/database';
import { executeSql, queryAll, queryOne, sqlStatement } from '@/infra/db/sql/query';

export class SqlCoreRepository implements
    AuthRepository,
    AuditRepository,
    NewsRepository,
    EventRepository,
    NamecardRepository,
    ReactionRepository,
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

    findUserByUsername(username: string): Promise<UserRecord | null> {
        return queryOne<UserRecord>(this.database, 'SELECT * FROM users WHERE username=?', [username]);
    }

    findUserById(id: number): Promise<UserRecord | null> {
        return queryOne<UserRecord>(this.database, 'SELECT * FROM users WHERE id=?', [id]);
    }

    async createRefreshSession(input: NewRefreshSessionInput): Promise<void> {
        await executeSql(this.database,
            `INSERT INTO auth_refresh_sessions
             (id, user_id, token_hash, previous_token_hash, csrf_hash,
              expires_at, created_at, updated_at, revoked_at)
             VALUES (?, ?, ?, NULL, ?, ?, ?, ?, NULL)`,
            [
                input.id,
                input.userId,
                input.tokenHash,
                input.csrfHash,
                input.expiresAt,
                input.createdAt,
                input.createdAt
            ]
        );
    }

    findRefreshSessionByTokenHash(tokenHash: string): Promise<RefreshSessionRecord | null> {
        return queryOne<RefreshSessionRecord>(this.database,
            `SELECT * FROM auth_refresh_sessions
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
            `UPDATE auth_refresh_sessions
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
            `UPDATE auth_refresh_sessions
             SET revoked_at=COALESCE(revoked_at, ?), updated_at=?
             WHERE id=?`,
            [revokedAt, revokedAt, id]
        );
    }

    async deleteExpiredRefreshSessions(now: number): Promise<void> {
        await executeSql(
            this.database,
            'DELETE FROM auth_refresh_sessions WHERE expires_at<=?',
            [now]
        );
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
        const result = await queryOne<{ id: number }>(this.database,
            `INSERT INTO events (title, name, contact, image_url)
             VALUES (?, ?, ?, ?) RETURNING id`,
            [input.title, input.name, input.contact, input.imageUrl]
        );
        if (!result) throw new Error('Event insert did not return an ID');
        return result.id;
    }

    async countEvents(): Promise<number> {
        const row = await queryOne<{ total: number }>(
            this.database,
            'SELECT CAST(COUNT(*) AS INTEGER) AS total FROM events'
        );
        return row?.total ?? 0;
    }

    listEvents(limit: number, offset: number): Promise<Record<string, unknown>[]> {
        return queryAll(this.database,
            'SELECT * FROM events ORDER BY id DESC LIMIT ? OFFSET ?',
            [limit, offset]
        );
    }

    async findLatestEventId(): Promise<string | null> {
        const row = await queryOne<{ id: string | null }>(
            this.database,
            'SELECT CAST(MAX(id) AS TEXT) AS id FROM events'
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
                `SELECT * FROM events
                 WHERE id<=? AND id<? ORDER BY id DESC LIMIT ?`,
                [snapshotId, afterId, limit]
            );
        }
        return queryAll(this.database,
            'SELECT * FROM events WHERE id<=? ORDER BY id DESC LIMIT ?',
            [snapshotId, limit]
        );
    }

    findEvent(id: number): Promise<Record<string, unknown> | null> {
        return queryOne(this.database, 'SELECT * FROM events WHERE id=?', [id]);
    }

    findEventMedia(id: number): Promise<{ image_url: string } | null> {
        return queryOne(this.database, 'SELECT image_url FROM events WHERE id=?', [id]);
    }

    async deleteEvent(id: number): Promise<boolean> {
        const result = await executeSql(this.database, 'DELETE FROM events WHERE id=?', [id]);
        return result.meta.changes > 0;
    }

    findCardByOrderedHashes(hash1: string, hash2: string): Promise<{ id: number } | null> {
        return queryOne(this.database, 'SELECT id FROM cards WHERE hash1=? AND hash2=?', [hash1, hash2]);
    }

    async insertPendingCard(input: PendingCardInput): Promise<number> {
        const result = await queryOne<{ id: number }>(this.database,
            `INSERT INTO cards (image1_url, image2_url, hash1, hash2, ip, status)
             VALUES (?, ?, ?, ?, ?, 'pending') RETURNING id`,
            [input.image1Url, input.image2Url, input.hash1, input.hash2, input.ip]
        );
        if (!result) throw new Error('Card insert did not return an ID');
        return result.id;
    }

    async countApprovedCards(): Promise<number> {
        const row = await queryOne<{ total: number }>(this.database,
            "SELECT CAST(COUNT(*) AS INTEGER) AS total FROM cards WHERE status='approved'"
        );
        return row?.total ?? 0;
    }

    listApprovedCards(limit: number, offset: number): Promise<Record<string, unknown>[]> {
        return queryAll(this.database,
            `SELECT id, image1_url, image2_url, status, created_at FROM cards
             WHERE status='approved' ORDER BY id DESC LIMIT ? OFFSET ?`,
            [limit, offset]
        );
    }

    findApprovedCardMedia(id: number): Promise<CardMediaRecord | null> {
        return queryOne(this.database,
            "SELECT id, image1_url, image2_url, status FROM cards WHERE id=? AND status='approved'",
            [id]
        );
    }

    listAdminCards(limit: number, offset: number): Promise<Record<string, unknown>[]> {
        return queryAll(this.database,
            'SELECT id, image1_url, image2_url, status FROM cards ORDER BY id DESC LIMIT ? OFFSET ?',
            [limit, offset]
        );
    }

    async approveCard(id: number): Promise<void> {
        await executeSql(this.database, "UPDATE cards SET status='approved' WHERE id=?", [id]);
    }

    findCardMedia(id: number): Promise<CardMediaRecord | null> {
        return queryOne(this.database,
            'SELECT id, image1_url, image2_url, status FROM cards WHERE id=?',
            [id]
        );
    }

    async deleteCard(id: number): Promise<void> {
        await executeSql(this.database, 'DELETE FROM cards WHERE id=?', [id]);
    }

    findCardByMediaUrl(url: string): Promise<CardMediaRecord | null> {
        return queryOne(this.database,
            'SELECT id, image1_url, image2_url, status FROM cards WHERE image1_url=? OR image2_url=? LIMIT 1',
            [url, url]
        );
    }

    findApprovedCard(id: number): Promise<{ id: number } | null> {
        return queryOne(this.database, "SELECT id FROM cards WHERE id=? AND status='approved'", [id]);
    }

    listReactions(cardId: number): Promise<Array<{ emoji: string; count: number }>> {
        return queryAll(this.database,
            'SELECT emoji, count FROM card_emojis WHERE card_id=? ORDER BY count DESC',
            [cardId]
        );
    }

    async incrementReaction(cardId: number, emoji: string): Promise<void> {
        await executeSql(this.database,
            `INSERT INTO card_emojis (card_id, emoji, count) VALUES (?, ?, 1)
             ON CONFLICT(card_id, emoji) DO UPDATE SET count=count+1`,
            [cardId, emoji]
        );
    }

    async decrementAndPruneReaction(cardId: number, emoji: string): Promise<void> {
        await this.database.batch([
            sqlStatement(this.database,
                'UPDATE card_emojis SET count=count-1 WHERE card_id=? AND emoji=?',
                [cardId, emoji]
            ),
            sqlStatement(this.database,
                'DELETE FROM card_emojis WHERE card_id=? AND emoji=? AND count<=0',
                [cardId, emoji]
            )
        ]);
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

export { SqlCoreRepository as SqliteCoreRepository };
