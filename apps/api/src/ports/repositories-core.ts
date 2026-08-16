export type AdminRole = 'admin' | 'super_admin';

export interface UserRecord {
    id: number;
    username: string;
    password: string;
    dept: string;
    producername: string | null;
    admin_role: AdminRole | null;
}

export interface AdminAccountRecord {
    id: number;
    username: string;
    producername: string | null;
    admin_role: AdminRole;
}

export interface NewAdminAccountInput {
    username: string;
    passwordHash: string;
    producername: string;
}

export interface RefreshSessionRecord {
    id: string;
    user_id: number;
    token_hash: string;
    previous_token_hash: string | null;
    csrf_hash: string;
    expires_at: number;
    created_at: number;
    updated_at: number;
    revoked_at: number | null;
}

export interface NewRefreshSessionInput {
    id: string;
    userId: number;
    tokenHash: string;
    csrfHash: string;
    expiresAt: number;
    createdAt: number;
}

export interface AuthRepository {
    findUserByUsername(username: string): Promise<UserRecord | null>;
    findUserById(id: number): Promise<UserRecord | null>;
    createRefreshSession(input: NewRefreshSessionInput): Promise<void>;
    findRefreshSessionByTokenHash(tokenHash: string): Promise<RefreshSessionRecord | null>;
    rotateRefreshSession(input: {
        id: string;
        currentTokenHash: string;
        nextTokenHash: string;
        nextExpiresAt: number;
        updatedAt: number;
    }): Promise<boolean>;
    revokeRefreshSession(id: string, revokedAt: number): Promise<void>;
    deleteExpiredRefreshSessions(now: number): Promise<void>;
}

export interface AdminAccountRepository {
    ensureSuperAdmin(username?: string): Promise<void>;
    listAdminAccounts(): Promise<AdminAccountRecord[]>;
    createAdminAccount(input: NewAdminAccountInput): Promise<AdminAccountRecord>;
    deleteAdminAccount(id: number): Promise<boolean>;
}

export interface AuditLogInput {
    username: string;
    producername: string;
    action: string;
    target: string;
    ip: string;
    time: string;
}

export interface AuditRepository {
    insertAuditLog(input: AuditLogInput): Promise<void>;
    listRecentAuditLogs(limit: number): Promise<Record<string, unknown>[]>;
}

export interface NewsInput {
    title: string;
    image: string;
    thumbnail: string;
    content: string;
    date: string;
    author: string;
}

export interface NewsRepository {
    listPublicNews(): Promise<Record<string, unknown>[]>;
    findLatestPublicNewsId(): Promise<string | null>;
    listPublicNewsByCursor(
        limit: number,
        snapshotId: string,
        afterId?: string
    ): Promise<Record<string, unknown>[]>;
    listAdminNews(): Promise<Record<string, unknown>[]>;
    insertNews(input: NewsInput): Promise<number>;
    findNewsMedia(id: number): Promise<{ image: string; thumbnail: string } | null>;
    deleteNews(id: number): Promise<void>;
}

export interface EventInput {
    title: string;
    name: string;
    contact: string;
    imageUrl: string;
    operationKey?: string;
    requestFingerprint?: string;
}

export interface EventRepository {
    insertEvent(input: EventInput): Promise<number>;
    updateEvent(id: number, input: EventInput, expectedImageUrl: string): Promise<boolean>;
    findEventByOperationKey(operationKey: string): Promise<Record<string, unknown> | null>;
    markEventReady(id: number, operationKey: string): Promise<boolean>;
    countEvents(): Promise<number>;
    listEvents(limit: number, offset: number): Promise<Record<string, unknown>[]>;
    findLatestEventId(): Promise<string | null>;
    listEventsByCursor(
        limit: number,
        snapshotId: string,
        afterId?: string
    ): Promise<Record<string, unknown>[]>;
    findEvent(id: number): Promise<Record<string, unknown> | null>;
    findEventMedia(id: number): Promise<{ image_url: string } | null>;
    countEventMediaReferences(imageUrl: string): Promise<number>;
    deleteEvent(id: number): Promise<boolean>;
}

export interface PendingCardInput {
    image1Url: string;
    image2Url: string;
    hash1: string;
    hash2: string;
    ip: string;
    withdrawalTokenHash: string;
}

export interface CardMediaRecord {
    id?: number;
    image1_url: string;
    image2_url: string;
    status?: string;
    revision?: number;
}

export type NamecardSubmissionStatus =
    | 'pending'
    | 'approving'
    | 'approved'
    | 'rejected'
    | 'withdrawn';

export interface NamecardSubmissionRecord extends CardMediaRecord {
    id: number;
    status: NamecardSubmissionStatus;
    revision: number;
    created_at: string | Date | null;
}

export interface NamecardSubmissionWithHashesRecord extends NamecardSubmissionRecord {
    hash1: string;
    hash2: string;
}

export type NamecardEditResult =
    | { status: 'updated'; card: NamecardSubmissionRecord }
    | { status: 'conflict'; revision: number }
    | { status: 'not-found' };

export type NamecardApprovalClaim =
    | { status: 'claimed' | 'resumed'; card: NamecardSubmissionRecord }
    | { status: 'conflict'; revision: number }
    | { status: 'withdrawn'; revision: number }
    | { status: 'not-found' };

export type NamecardMutationResult =
    | { status: 'updated'; card: NamecardSubmissionRecord }
    | { status: 'conflict'; revision: number }
    | { status: 'withdrawn'; revision: number }
    | { status: 'not-found' };

export interface NamecardRepository {
    findCardByOrderedHashes(hash1: string, hash2: string): Promise<{ id: number } | null>;
    insertPendingCard(input: PendingCardInput): Promise<number>;
    countApprovedCards(): Promise<number>;
    countAdminCards(): Promise<number>;
    listApprovedCards(limit: number, offset: number): Promise<Record<string, unknown>[]>;
    findApprovedCardMedia(id: number): Promise<CardMediaRecord | null>;
    listAdminCards(limit: number, offset: number): Promise<Record<string, unknown>[]>;
    beginCardApproval(id: number, expectedRevision: number): Promise<NamecardApprovalClaim>;
    completeCardApproval(id: number, approvingRevision: number): Promise<NamecardMutationResult>;
    findCardMedia(id: number): Promise<CardMediaRecord | null>;
    deleteCard(id: number, expectedRevision: number): Promise<NamecardMutationResult>;
    rejectSubmission(id: number, expectedRevision: number): Promise<NamecardMutationResult>;
    purgeTerminalCards(cutoff: Date): Promise<Array<{ id: number; image1_url: string; image2_url: string }>>;
    findSubmissionByTokenHash(id: number, tokenHash: string): Promise<NamecardSubmissionRecord | null>;
    withdrawSubmission(
        id: number,
        tokenHash: string,
        expectedRevision: number
    ): Promise<NamecardMutationResult>;
    findSubmissionWithHashesByTokenHash(
        id: number,
        tokenHash: string
    ): Promise<NamecardSubmissionWithHashesRecord | null>;
    replaceSubmissionImage(
        id: number,
        tokenHash: string,
        expectedRevision: number,
        side: 'front' | 'back',
        imageUrl: string,
        hash: string
    ): Promise<NamecardEditResult>;
    resubmitSubmission(
        id: number,
        tokenHash: string,
        expectedRevision: number
    ): Promise<NamecardEditResult>;
    findCardByMediaUrl(url: string): Promise<CardMediaRecord | null>;
}

export interface ReactionRepository {
    findApprovedCard(id: number): Promise<{ id: number } | null>;
    listReactions(cardId: number): Promise<Array<{ emoji: string; count: number }>>;
    incrementReaction(cardId: number, emoji: string): Promise<void>;
    decrementAndPruneReaction(cardId: number, emoji: string): Promise<void>;
}

export type SitePackageRuntimeMode = 'safe' | 'isolated-script';

export type SitePackageRevisionState = 'ready' | 'archived';

export interface SitePackageRecord {
    id: string;
    slug: string;
    title: string;
    description: string;
    published_revision_id: string | null;
    created_by: number;
    updated_by: number;
    created_at: number;
    updated_at: number;
}

export interface SitePackageRevisionRecord {
    id: string;
    package_id: string;
    revision_number: number;
    entry_path: string;
    runtime_mode: SitePackageRuntimeMode;
    state: SitePackageRevisionState;
    file_count: number;
    total_bytes: number;
    source_key: string;
    source_sha256: string;
    manifest_key: string;
    manifest_json: string;
    preview_token_hash: string;
    created_by: number;
    created_at: number;
    published_at: number | null;
}

export interface NewSitePackageInput {
    id: string;
    slug: string;
    title: string;
    description: string;
    createdBy: number;
    createdAt: number;
}

export interface NewSitePackageRevisionInput {
    id: string;
    packageId: string;
    entryPath: string;
    runtimeMode: SitePackageRuntimeMode;
    state: SitePackageRevisionState;
    fileCount: number;
    totalBytes: number;
    sourceKey: string;
    sourceSha256: string;
    manifestKey: string;
    manifestJson: string;
    previewTokenHash: string;
    createdBy: number;
    createdAt: number;
}

export interface SitePackageWithRevisions extends SitePackageRecord {
    revisions: SitePackageRevisionRecord[];
}

export interface SitePackagePublicationResult {
    revision: SitePackageRevisionRecord;
    operation: 'publish' | 'rollback' | 'noop';
}

export interface DeleteSitePackageRevisionInput {
    packageId: string;
    revisionId: string;
    deletionJobId: string;
    deletedBy: number;
    deletedAt: number;
}

export type SitePackageRevisionDeletionResult = {
    kind: 'deleted' | 'published';
    revision: SitePackageRevisionRecord;
    sitePackage: SitePackageRecord;
    packageDeleted: boolean;
};

export interface SitePackageRepository {
    listSitePackages(): Promise<SitePackageWithRevisions[]>;
    findSitePackageById(id: string): Promise<SitePackageRecord | null>;
    findSitePackageBySlug(slug: string): Promise<SitePackageRecord | null>;
    findSitePackageRevisionById(
        packageId: string,
        revisionId: string
    ): Promise<SitePackageRevisionRecord | null>;
    findSitePackageRevisionByPreviewTokenHash(
        previewTokenHash: string
    ): Promise<(SitePackageRevisionRecord & { slug: string }) | null>;
    createSitePackageWithRevision(
        sitePackage: NewSitePackageInput,
        revision: NewSitePackageRevisionInput
    ): Promise<void>;
    createSitePackageRevision(
        revision: NewSitePackageRevisionInput
    ): Promise<SitePackageRevisionRecord>;
    publishSitePackageRevision(
        packageId: string,
        revisionId: string,
        updatedBy: number,
        publishedAt: number
    ): Promise<SitePackagePublicationResult | null>;
    deleteSitePackageRevision(
        input: DeleteSitePackageRevisionInput
    ): Promise<SitePackageRevisionDeletionResult | null>;
    rotateSitePackagePreviewToken(
        packageId: string,
        revisionId: string,
        previewTokenHash: string
    ): Promise<boolean>;
}

export const HOMEPAGE_LINK_SECTIONS = ['navigation', 'friend', 'support'] as const;

export type HomepageLinkSection = typeof HOMEPAGE_LINK_SECTIONS[number];

export interface HomepageLinkRecord {
    id: string;
    section: HomepageLinkSection;
    title: string;
    description: string;
    href: string;
    icon: string;
    accent: string;
    display_order: number;
    created_at: number;
    updated_at: number;
}

export interface NewHomepageLinkInput {
    id: string;
    section: HomepageLinkSection;
    title: string;
    description: string;
    href: string;
    icon: string;
    accent: string;
    createdAt: number;
}

export interface HomepageLinkUpdateInput {
    title: string;
    description: string;
    href: string;
    icon: string;
    accent: string;
    updatedAt: number;
}

export interface HomepageLinkRepository {
    listHomepageLinks(section?: HomepageLinkSection): Promise<HomepageLinkRecord[]>;
    findHomepageLinkById(id: string): Promise<HomepageLinkRecord | null>;
    createHomepageLink(input: NewHomepageLinkInput): Promise<HomepageLinkRecord>;
    updateHomepageLink(
        id: string,
        input: HomepageLinkUpdateInput
    ): Promise<HomepageLinkRecord | null>;
    deleteHomepageLink(id: string): Promise<boolean>;
    reorderHomepageLinks(
        section: HomepageLinkSection,
        ids: readonly string[],
        updatedAt: number
    ): Promise<boolean>;
}
