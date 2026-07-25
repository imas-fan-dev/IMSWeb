export interface UserRecord {
    id: number;
    username: string;
    password: string;
    dept: string;
    producername: string | null;
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
}

export interface EventRepository {
    insertEvent(input: EventInput): Promise<number>;
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
    deleteEvent(id: number): Promise<boolean>;
}

export interface PendingCardInput {
    image1Url: string;
    image2Url: string;
    hash1: string;
    hash2: string;
    ip: string;
}

export interface CardMediaRecord {
    id?: number;
    image1_url: string;
    image2_url: string;
    status?: string;
}

export interface NamecardRepository {
    findCardByOrderedHashes(hash1: string, hash2: string): Promise<{ id: number } | null>;
    insertPendingCard(input: PendingCardInput): Promise<number>;
    countApprovedCards(): Promise<number>;
    listApprovedCards(limit: number, offset: number): Promise<Record<string, unknown>[]>;
    findApprovedCardMedia(id: number): Promise<CardMediaRecord | null>;
    listAdminCards(limit: number, offset: number): Promise<Record<string, unknown>[]>;
    approveCard(id: number): Promise<void>;
    findCardMedia(id: number): Promise<CardMediaRecord | null>;
    deleteCard(id: number): Promise<void>;
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
    rotateSitePackagePreviewToken(
        packageId: string,
        revisionId: string,
        previewTokenHash: string
    ): Promise<boolean>;
}

export interface AgencyRecord {
    id: number;
    code: string;
    name_cn: string;
    color: string;
    wiki_enabled: boolean;
    display_order: number;
    banner_title: string;
    icon_object_key: string | null;
    fallback_artwork_object_key: string | null;
    layout_revision: number;
}

export interface IdolRecord {
    id: number;
    agency_id: number;
    name_cn: string;
    folder_name: string;
    color: string | null;
    wiki_enabled: boolean;
    display_order: number;
    text_color: string;
    avatar_object_key: string | null;
    avatar_fit: 'cover' | 'contain';
}

export interface IdolWithAgencyRecord extends IdolRecord {
    agency_code: string;
    agency_name: string;
    agency_color: string;
}

export interface WikiGroupRecord {
    id: number;
    agency_id: number;
    code: string;
    name: string;
    color: string;
    icon_object_key: string | null;
    display_order: number;
    is_fallback: boolean;
}

export interface WikiGroupMemberRecord {
    agency_id: number;
    group_id: number;
    idol_id: number;
    display_order: number;
}

export interface WikiCategoryRecord {
    id: number;
    agency_id: number;
    name: string;
    storage_slug: string;
    background_eligible: boolean;
    display_order: number;
    show_when_empty: boolean;
}

export interface WikiBackgroundRecord extends StoryRecord {
    agency_id: number;
    agency_code: string;
    agency_name: string;
    idol_name: string;
    idol_folder_name: string;
}

export interface WikiLayoutInput {
    agencyId: number;
    expectedRevision: number;
    groups: Array<{
        id: number;
        idolIds: number[];
    }>;
}

export type WikiLayoutSaveResult =
    | { status: 'saved'; revision: number }
    | { status: 'conflict'; revision: number };

export interface StoryRecord {
    id: number;
    idol_id: number;
    category: string;
    card_name: string;
    up_name: string;
    video_title: string;
    url: string;
    subtitle: string | null;
    image_file: string | null;
}

export interface NewStoryInput {
    agencyCode: string;
    idolId: number;
    category: string;
    cardName: string;
    upName: string;
    videoTitle: string;
    url: string;
    subtitle: string;
    imageFile: string | null;
}

export interface UpdateStoryInput extends NewStoryInput {
    id: number;
    imageFile: string | null;
}

export interface StoryRepository {
    listThemeColors(): Promise<Record<string, string>>;
    listAgencies(): Promise<AgencyRecord[]>;
    listIdolsWithAgencies(): Promise<IdolWithAgencyRecord[]>;
    listWikiGroups(agencyId?: number): Promise<WikiGroupRecord[]>;
    findWikiGroupById(id: number): Promise<WikiGroupRecord | null>;
    listWikiGroupMembers(agencyId?: number): Promise<WikiGroupMemberRecord[]>;
    listWikiCategories(agencyId: number, idolId: number): Promise<WikiCategoryRecord[]>;
    findAgencyByName(name: string): Promise<AgencyRecord | null>;
    findAgencyByCode(code: string): Promise<AgencyRecord | null>;
    findAgencyById(id: number): Promise<AgencyRecord | null>;
    findIdolByAgencyAndName(agencyId: number, idolName: string): Promise<IdolRecord | null>;
    findIdolById(id: number): Promise<IdolRecord | null>;
    setAgencyIconObjectKey(agencyId: number, objectKey: string | null): Promise<void>;
    setIdolAvatarObjectKey(idolId: number, objectKey: string | null): Promise<void>;
    ensureWikiCategory(
        agencyId: number,
        idolId: number,
        name: string,
        storageSlug: string
    ): Promise<WikiCategoryRecord>;
    deleteWikiCategoryAssociation(
        agencyId: number,
        idolId: number,
        name: string
    ): Promise<WikiCategoryRecord | null>;
    saveWikiLayout(input: WikiLayoutInput): Promise<WikiLayoutSaveResult>;
    listStories(agencyCode: string, idolId: number): Promise<StoryRecord[]>;
    sampleStory(agencyCode: string, categories: readonly string[]): Promise<(StoryRecord & {
        idol_name: string;
        agency_name: string;
    }) | null>;
    sampleWikiBackground(): Promise<WikiBackgroundRecord | null>;
    insertStoryReturningId(input: NewStoryInput): Promise<number>;
    setStoryImage(agencyCode: string, id: number, imageFile: string): Promise<void>;
    findFirstStoryByCard(
        agencyCode: string,
        idolId: number,
        category: string,
        cardName: string
    ): Promise<StoryRecord | null>;
    findStoryById(
        agencyCode: string,
        idolId: number,
        id: number
    ): Promise<StoryRecord | null>;
    updateStory(input: UpdateStoryInput): Promise<void>;
    updateStoryAndRenameGroup(input: {
        story: UpdateStoryInput;
        rename?: {
            oldCategory: string;
            oldCardName: string;
            category: string;
            cardName: string;
            subtitle: string;
        };
    }): Promise<void>;
    renameStoryGroup(input: {
        agencyCode: string;
        idolId: number;
        oldCategory: string;
        oldCardName: string;
        category: string;
        cardName: string;
        subtitle: string;
        excludeId: number;
    }): Promise<void>;
    listStoryGroupForDelete(
        agencyCode: string,
        idolId: number,
        category: string,
        cardName: string
    ): Promise<StoryRecord[]>;
    deleteStoryGroup(
        agencyCode: string,
        idolId: number,
        category: string,
        cardName: string
    ): Promise<void>;
    listCategoryImages(
        agencyCode: string,
        idolId: number,
        category: string
    ): Promise<Array<{ image_file: string | null }>>;
    deleteCategory(agencyCode: string, idolId: number, category: string): Promise<void>;
}

export interface RepositoryServices {
    auth: AuthRepository;
    audit: AuditRepository;
    news: NewsRepository;
    events: EventRepository;
    namecards: NamecardRepository;
    reactions: ReactionRepository;
    sitePackages: SitePackageRepository;
    story: StoryRepository;
}
