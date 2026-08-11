import type {
    AdminAccountRecord,
    AdminAccountRepository,
    AuditLogInput,
    AuditRepository,
    AuthRepository,
    CardMediaRecord,
    EventRepository,
    EventInput,
    HomepageLinkRecord,
    HomepageLinkRepository,
    HomepageLinkSection,
    HomepageLinkUpdateInput,
    NamecardRepository,
    NamecardApprovalClaim,
    NamecardMutationResult,
    NamecardSubmissionRecord,
    NewAdminAccountInput,
    NewHomepageLinkInput,
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
    AdminAccountRepository,
    AuditRepository,
    NewsRepository,
    EventRepository,
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

    findUserByUsername(username: string): Promise<UserRecord | null> {
        return queryOne<UserRecord>(this.database, 'SELECT * FROM users WHERE username=?', [username]);
    }

    findUserById(id: number): Promise<UserRecord | null> {
        return queryOne<UserRecord>(this.database, 'SELECT * FROM users WHERE id=?', [id]);
    }

    async ensureSuperAdmin(username?: string): Promise<void> {
        const current = await queryAll<AdminAccountRecord>(this.database,
            `SELECT id, username, producername, admin_role
             FROM users WHERE dept='op' AND admin_role='super_admin'`
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
            `UPDATE users SET admin_role='super_admin'
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
             FROM users
             WHERE dept='op' AND admin_role IN ('admin', 'super_admin')
             ORDER BY CASE admin_role WHEN 'super_admin' THEN 0 ELSE 1 END, id`
        );
    }

    async createAdminAccount(input: NewAdminAccountInput): Promise<AdminAccountRecord> {
        const created = await queryOne<AdminAccountRecord>(this.database,
            `INSERT INTO users (username, password, dept, producername, admin_role)
             VALUES (?, ?, 'op', ?, 'admin')
             RETURNING id, username, producername, admin_role`,
            [input.username, input.passwordHash, input.producername]
        );
        if (!created) throw new Error('Failed to create administrator account');
        return created;
    }

    async deleteAdminAccount(id: number): Promise<boolean> {
        const result = await executeSql(this.database,
            `DELETE FROM users WHERE id=? AND dept='op' AND admin_role='admin'`,
            [id]
        );
        return result.meta.changes === 1;
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
            "SELECT CAST(COUNT(*) AS INTEGER) AS total FROM events WHERE publication_state='ready'"
        );
        return row?.total ?? 0;
    }

    listEvents(limit: number, offset: number): Promise<Record<string, unknown>[]> {
        return queryAll(this.database,
            `SELECT id, title, name, contact, image_url, created_at
             FROM events WHERE publication_state='ready'
             ORDER BY id DESC LIMIT ? OFFSET ?`,
            [limit, offset]
        );
    }

    async findLatestEventId(): Promise<string | null> {
        const row = await queryOne<{ id: string | null }>(
            this.database,
            "SELECT CAST(MAX(id) AS TEXT) AS id FROM events WHERE publication_state='ready'"
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
                `SELECT id, title, name, contact, image_url, created_at FROM events
                 WHERE publication_state='ready' AND id<=? AND id<? ORDER BY id DESC LIMIT ?`,
                [snapshotId, afterId, limit]
            );
        }
        return queryAll(this.database,
            `SELECT id, title, name, contact, image_url, created_at FROM events
             WHERE publication_state='ready' AND id<=? ORDER BY id DESC LIMIT ?`,
            [snapshotId, limit]
        );
    }

    findEvent(id: number): Promise<Record<string, unknown> | null> {
        return queryOne(this.database,
            `SELECT id, title, name, contact, image_url, created_at FROM events
             WHERE id=? AND publication_state='ready'`, [id]);
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

    findCardByOrderedHashes(hash1: string, hash2: string): Promise<{ id: number } | null> {
        return queryOne(this.database, 'SELECT id FROM cards WHERE hash1=? AND hash2=?', [hash1, hash2]);
    }

    async insertPendingCard(input: PendingCardInput): Promise<number> {
        const result = await queryOne<{ id: number }>(this.database,
            `INSERT INTO cards
             (image1_url, image2_url, hash1, hash2, ip, status, withdrawal_token_hash)
             VALUES (?, ?, ?, ?, ?, 'pending', ?) RETURNING id`,
            [
                input.image1Url,
                input.image2Url,
                input.hash1,
                input.hash2,
                input.ip,
                input.withdrawalTokenHash
            ]
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

    async countAdminCards(): Promise<number> {
        const row = await queryOne<{ total: number }>(this.database,
            'SELECT CAST(COUNT(*) AS INTEGER) AS total FROM cards'
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
            `SELECT id, image1_url, image2_url, status, revision
             FROM cards ORDER BY id DESC LIMIT ? OFFSET ?`,
            [limit, offset]
        );
    }

    async beginCardApproval(
        id: number,
        expectedRevision: number
    ): Promise<NamecardApprovalClaim> {
        const claimed = await queryOne<NamecardSubmissionRecord>(this.database,
            `UPDATE cards SET status='approving', revision=revision+1
             WHERE id=? AND status='pending' AND revision=?
             RETURNING id, image1_url, image2_url, status, revision, created_at`,
            [id, expectedRevision]
        );
        if (claimed) return { status: 'claimed', card: claimed };
        const current = await queryOne<NamecardSubmissionRecord>(this.database,
            `SELECT id, image1_url, image2_url, status, revision, created_at
             FROM cards WHERE id=?`,
            [id]
        );
        if (!current) return { status: 'not-found' };
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
        const updated = await queryOne<NamecardSubmissionRecord>(this.database,
            `UPDATE cards SET status='approved', revision=revision+1
             WHERE id=? AND status='approving' AND revision=?
             RETURNING id, image1_url, image2_url, status, revision, created_at`,
            [id, approvingRevision]
        );
        if (updated) return { status: 'updated', card: updated };
        const current = await queryOne<NamecardSubmissionRecord>(this.database,
            `SELECT id, image1_url, image2_url, status, revision, created_at
             FROM cards WHERE id=?`,
            [id]
        );
        if (!current) return { status: 'not-found' };
        if (current.status === 'approved' && current.revision === approvingRevision + 1) {
            return { status: 'updated', card: current };
        }
        return { status: 'conflict', revision: current.revision };
    }

    findCardMedia(id: number): Promise<CardMediaRecord | null> {
        return queryOne(this.database,
            'SELECT id, image1_url, image2_url, status, revision FROM cards WHERE id=?',
            [id]
        );
    }

    async deleteCard(id: number, expectedRevision: number): Promise<NamecardMutationResult> {
        const deleted = await queryOne<NamecardSubmissionRecord>(this.database,
            `DELETE FROM cards WHERE id=? AND revision=?
             RETURNING id, image1_url, image2_url, status, revision, created_at`,
            [id, expectedRevision]
        );
        if (deleted) return { status: 'updated', card: deleted };
        const current = await queryOne<{ revision: number }>(this.database,
            'SELECT revision FROM cards WHERE id=?', [id]);
        return current
            ? { status: 'conflict', revision: current.revision }
            : { status: 'not-found' };
    }

    findSubmissionByTokenHash(
        id: number,
        tokenHash: string
    ): Promise<NamecardSubmissionRecord | null> {
        return queryOne(this.database,
            `SELECT id, image1_url, image2_url, status, revision, created_at
             FROM cards WHERE id=? AND withdrawal_token_hash=?`,
            [id, tokenHash]
        );
    }

    async withdrawSubmission(
        id: number,
        tokenHash: string,
        expectedRevision: number
    ): Promise<NamecardMutationResult> {
        const withdrawn = await queryOne<NamecardSubmissionRecord>(this.database,
            `UPDATE cards
             SET status='withdrawn', withdrawn_at=CURRENT_TIMESTAMP, revision=revision+1
             WHERE id=? AND withdrawal_token_hash=? AND status='pending' AND revision=?
             RETURNING id, image1_url, image2_url, status, revision, created_at`,
            [id, tokenHash, expectedRevision]
        );
        if (withdrawn) return { status: 'updated', card: withdrawn };
        const current = await this.findSubmissionByTokenHash(id, tokenHash);
        if (!current) return { status: 'not-found' };
        return { status: 'conflict', revision: current.revision };
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
             ON CONFLICT(card_id, emoji) DO UPDATE SET count=card_emojis.count+1`,
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
