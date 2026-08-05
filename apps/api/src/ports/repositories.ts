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

export interface AgencyRecord {
    id: number;
    code: string;
    name_cn: string;
    color: string;
    wiki_enabled: boolean;
    display_order: number;
    banner_title: string;
    icon_object_key: string | null;
    icon_fit: 'cover' | 'contain';
    icon_focal_x: number;
    icon_focal_y: number;
    icon_zoom: number;
    icon_rotation: 0 | 90 | 180 | 270;
    icon_media_revision: number;
    fallback_artwork_object_key: string | null;
    layout_revision: number;
}

export type WikiEntryKind = 'idol' | 'unit' | 'story' | 'other';
export type WikiStoryEntrySubtype = 'main' | 'event' | 'special' | 'other';

export interface IdolRecord {
    id: number;
    agency_id: number;
    name_cn: string;
    folder_name: string;
    color: string | null;
    wiki_enabled: boolean;
    display_order: number;
    text_color: string;
    wiki_url: string | null;
    avatar_object_key: string | null;
    avatar_fit: 'cover' | 'contain';
    avatar_focal_x: number;
    avatar_focal_y: number;
    avatar_zoom: number;
    avatar_rotation: 0 | 90 | 180 | 270;
    avatar_media_revision: number;
    entry_kind: WikiEntryKind;
    entry_subtype: WikiStoryEntrySubtype | null;
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
    icon_fit: 'cover' | 'contain';
    icon_focal_x: number;
    icon_focal_y: number;
    icon_zoom: number;
    icon_rotation: 0 | 90 | 180 | 270;
    icon_media_revision: number;
    display_order: number;
    is_fallback: boolean;
}

export interface WikiGroupMemberRecord {
    agency_id: number;
    group_id: number;
    idol_id: number;
    display_order: number;
}

export interface WikiImageTransform {
    fit: 'cover' | 'contain';
    focalX: number;
    focalY: number;
    zoom: number;
    rotation: 0 | 90 | 180 | 270;
}

export interface SaveWikiEntityMediaInput {
    id: number;
    expectedRevision: number;
    objectKey: string | null;
    transform: WikiImageTransform;
}

export type WikiEntityMediaSaveResult =
    | {
        status: 'saved';
        revision: number;
        previousObjectKey: string | null;
    }
    | {
        status: 'conflict';
        revision: number;
    };

export interface CreateWikiAgencyInput {
    code: string;
    name: string;
    color: string;
    bannerTitle: string;
    wikiEnabled: boolean;
}

export interface UpdateWikiAgencyInput {
    id: number;
    name: string;
    color: string;
    bannerTitle: string;
    wikiEnabled: boolean;
}

export interface CreateWikiGroupInput {
    agencyId: number;
    code: string;
    name: string;
    color: string;
}

export interface UpdateWikiGroupInput {
    id: number;
    code: string;
    name: string;
    color: string;
}

export interface CreateWikiIdolInput {
    agencyId: number;
    name: string;
    folderName: string;
    color: string | null;
    textColor: string;
    wikiUrl?: string | null;
    imageFit: 'cover' | 'contain';
    wikiEnabled: boolean;
    groupIds: number[];
    entryKind?: WikiEntryKind;
    entrySubtype?: WikiStoryEntrySubtype | null;
}

export interface UpdateWikiIdolInput {
    id: number;
    name: string;
    color: string | null;
    textColor: string;
    wikiUrl?: string | null;
    imageFit: 'cover' | 'contain';
    wikiEnabled: boolean;
    groupIds: number[];
    entryKind?: WikiEntryKind;
    entrySubtype?: WikiStoryEntrySubtype | null;
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

export interface UpdateWikiCategoryInput {
    agencyId: number;
    idolId: number;
    id: number;
    name: string;
    expectedName: string;
}

export type WikiCategorySaveResult =
    | { status: 'saved'; category: WikiCategoryRecord }
    | { status: 'conflict'; currentName: string };

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
    card_id: number;
    idol_id: number;
    category: string;
    card_name: string;
    up_name: string;
    video_title: string;
    url: string;
    content_type_id: number;
    content_type_name: string;
    content_type_icon_name: string;
    source_platform_id: number;
    source_platform_name: string;
    subtitle: string | null;
    image_file: string | null;
    cover_asset_id?: number | null;
    cover_asset_name?: string | null;
    cover_asset_object_key?: string | null;
    cover_asset_revision?: number | null;
    cover_asset_presentation_policy?: WikiStoryCoverPresentationPolicy | null;
    image_fit: 'cover' | 'contain';
    image_focal_x: number;
    image_focal_y: number;
    image_zoom: number;
    image_rotation: 0 | 90 | 180 | 270;
    image_media_revision: number;
}

export interface StoryCardRecord {
    card_id: number;
    idol_id: number;
    category: string;
    card_name: string;
    subtitle: string | null;
    image_file: string | null;
    cover_asset_id?: number | null;
    cover_asset_name?: string | null;
    cover_asset_object_key?: string | null;
    cover_asset_revision?: number | null;
    cover_asset_presentation_policy?: WikiStoryCoverPresentationPolicy | null;
    image_fit: 'cover' | 'contain';
    image_focal_x: number;
    image_focal_y: number;
    image_zoom: number;
    image_rotation: 0 | 90 | 180 | 270;
    image_media_revision: number;
}

export interface NewStoryInput {
    agencyCode: string;
    idolId: number;
    category: string;
    cardName: string;
    upName: string;
    videoTitle: string;
    url: string;
    contentTypeId: number;
    sourcePlatformId: number;
    subtitle: string;
    imageFile: string | null;
    coverAssetId?: number | null;
    imageTransform: WikiImageTransform;
}

export interface NewStoryLinkInput {
    upName: string;
    videoTitle: string;
    url: string;
    contentTypeId: number;
    sourcePlatformId: number;
}

export interface WikiStoryContentTypeRecord {
    id: number;
    name: string;
    icon_name: string;
    description: string;
    display_order: number;
    is_active: boolean;
    revision: number;
}

export interface WikiStorySourcePlatformRecord {
    id: number;
    name: string;
    homepage_url: string;
    description: string;
    display_order: number;
    is_active: boolean;
    revision: number;
}

export interface WikiStoryCatalogOptionInput {
    name: string;
    description: string;
    isActive: boolean;
}

export interface WikiStoryContentTypeInput extends WikiStoryCatalogOptionInput {
    iconName: string;
}

export interface WikiStorySourcePlatformInput extends WikiStoryCatalogOptionInput {
    homepageUrl: string;
}

export type WikiStoryCatalogSaveResult<T> =
    | { status: 'saved'; option: T }
    | { status: 'conflict'; revision: number };

export type WikiStoryCatalogDeleteResult =
    | { status: 'deleted' }
    | { status: 'in-use' }
    | { status: 'not-found' };

export interface NewStoryBatchInput {
    agencyCode: string;
    idolId: number;
    category: string;
    cardName: string;
    subtitle: string;
    imageFile: string | null;
    coverAssetId?: number | null;
    imageTransform: WikiImageTransform;
    links: NewStoryLinkInput[];
}

export interface AddStoryCardSourcesInput {
    agencyCode: string;
    idolId: number;
    cardId: number;
    expectedRevision: number;
    links: NewStoryLinkInput[];
}

export type AddStoryCardSourcesResult =
    | { status: 'added'; ids: number[]; revision: number }
    | { status: 'conflict'; revision: number };

export interface DeleteStoryLinkInput {
    agencyCode: string;
    idolId: number;
    id: number;
    expectedRevision: number;
}

export type DeleteStoryLinkResult =
    | {
        status: 'deleted';
        cardDeleted: boolean;
        revision: number;
        cleanupImageFiles: string[];
    }
    | { status: 'conflict'; revision: number };

export interface UpdateStoryInput extends NewStoryInput {
    id: number;
    imageFile: string | null;
    expectedMediaRevision: number;
}

export interface UpdateStoryCardInput {
    agencyCode: string;
    idolId: number;
    id: number;
    categoryId: number;
    cardName: string;
    subtitle: string;
    imageFile: string | null;
    coverAssetId?: number | null;
    imageTransform: WikiImageTransform;
    expectedRevision: number;
}

export type WikiStoryCardSaveResult =
    | { status: 'saved'; revision: number }
    | { status: 'conflict'; revision: number };

export type WikiStoryCoverPresentationPolicy = 'inherit' | 'contain';

export interface WikiStoryCoverAssetRecord {
    id: number;
    agency_id: number;
    name: string;
    object_key: string;
    presentation_policy: WikiStoryCoverPresentationPolicy;
    display_order: number;
    is_active: boolean;
    revision: number;
    usage_count: number;
}

export interface CreateWikiStoryCoverAssetInput {
    agencyId: number;
    name: string;
    objectKey: string;
    presentationPolicy: WikiStoryCoverPresentationPolicy;
}

export interface UpdateWikiStoryCoverAssetInput {
    id: number;
    agencyId: number;
    name: string;
    objectKey: string;
    presentationPolicy: WikiStoryCoverPresentationPolicy;
    isActive: boolean;
    expectedRevision: number;
}

export type WikiStoryCoverAssetSaveResult =
    | {
        status: 'saved';
        asset: WikiStoryCoverAssetRecord;
        previousObjectKey: string | null;
    }
    | { status: 'conflict'; revision: number };

export type WikiStoryCoverAssetDeleteResult =
    | { status: 'deleted'; objectKey: string }
    | { status: 'in-use'; usageCount: number }
    | { status: 'not-found' };

export interface DeleteWikiGroupInput {
    id: number;
    expectedRevision: number;
}

export type WikiGroupDeleteResult =
    | { status: 'deleted'; group: WikiGroupRecord }
    | { status: 'conflict'; revision: number };

export interface DeleteWikiIdolInput {
    id: number;
    expectedRevision: number;
}

export type WikiIdolDeleteResult =
    | {
        status: 'deleted';
        idol: IdolRecord;
        cardCount: number;
        storyCount: number;
    }
    | { status: 'conflict'; revision: number };

export interface StoryRepository {
    listThemeColors(): Promise<Record<string, string>>;
    listAgencies(): Promise<AgencyRecord[]>;
    listIdolsWithAgencies(): Promise<IdolWithAgencyRecord[]>;
    listWikiGroups(agencyId?: number): Promise<WikiGroupRecord[]>;
    findWikiGroupById(id: number): Promise<WikiGroupRecord | null>;
    listWikiGroupMembers(agencyId?: number): Promise<WikiGroupMemberRecord[]>;
    listWikiCategories(agencyId: number, idolId: number): Promise<WikiCategoryRecord[]>;
    listStoryContentTypes(): Promise<WikiStoryContentTypeRecord[]>;
    listStorySourcePlatforms(): Promise<WikiStorySourcePlatformRecord[]>;
    listStoryCoverAssets(agencyId: number): Promise<WikiStoryCoverAssetRecord[]>;
    findStoryCoverAssetById(id: number): Promise<WikiStoryCoverAssetRecord | null>;
    createStoryCoverAsset(
        input: CreateWikiStoryCoverAssetInput
    ): Promise<WikiStoryCoverAssetRecord>;
    updateStoryCoverAsset(
        input: UpdateWikiStoryCoverAssetInput
    ): Promise<WikiStoryCoverAssetSaveResult | null>;
    deleteStoryCoverAsset(id: number): Promise<WikiStoryCoverAssetDeleteResult>;
    createStoryContentType(
        input: WikiStoryContentTypeInput
    ): Promise<WikiStoryContentTypeRecord>;
    updateStoryContentType(
        id: number,
        expectedRevision: number,
        input: WikiStoryContentTypeInput
    ): Promise<WikiStoryCatalogSaveResult<WikiStoryContentTypeRecord> | null>;
    deleteStoryContentType(id: number): Promise<WikiStoryCatalogDeleteResult>;
    createStorySourcePlatform(
        input: WikiStorySourcePlatformInput
    ): Promise<WikiStorySourcePlatformRecord>;
    updateStorySourcePlatform(
        id: number,
        expectedRevision: number,
        input: WikiStorySourcePlatformInput
    ): Promise<WikiStoryCatalogSaveResult<WikiStorySourcePlatformRecord> | null>;
    deleteStorySourcePlatform(id: number): Promise<WikiStoryCatalogDeleteResult>;
    findAgencyByName(name: string): Promise<AgencyRecord | null>;
    findAgencyByCode(code: string): Promise<AgencyRecord | null>;
    findAgencyById(id: number): Promise<AgencyRecord | null>;
    findIdolByAgencyAndName(agencyId: number, idolName: string): Promise<IdolRecord | null>;
    findIdolById(id: number): Promise<IdolRecord | null>;
    createWikiAgency(input: CreateWikiAgencyInput): Promise<AgencyRecord>;
    updateWikiAgency(input: UpdateWikiAgencyInput): Promise<AgencyRecord>;
    createWikiGroup(input: CreateWikiGroupInput): Promise<WikiGroupRecord>;
    updateWikiGroup(input: UpdateWikiGroupInput): Promise<WikiGroupRecord>;
    deleteWikiGroup(input: DeleteWikiGroupInput): Promise<WikiGroupDeleteResult | null>;
    createWikiIdol(input: CreateWikiIdolInput): Promise<IdolRecord>;
    updateWikiIdol(input: UpdateWikiIdolInput): Promise<IdolRecord>;
    deleteWikiIdol(input: DeleteWikiIdolInput): Promise<WikiIdolDeleteResult | null>;
    saveAgencyIconMedia(
        input: SaveWikiEntityMediaInput
    ): Promise<WikiEntityMediaSaveResult>;
    saveWikiGroupIconMedia(
        input: SaveWikiEntityMediaInput
    ): Promise<WikiEntityMediaSaveResult>;
    saveIdolAvatarMedia(
        input: SaveWikiEntityMediaInput
    ): Promise<WikiEntityMediaSaveResult>;
    setAgencyIconObjectKey(agencyId: number, objectKey: string | null): Promise<void>;
    setIdolAvatarObjectKey(idolId: number, objectKey: string | null): Promise<void>;
    ensureWikiCategory(
        agencyId: number,
        idolId: number,
        name: string,
        storageSlug: string
    ): Promise<WikiCategoryRecord>;
    updateWikiCategory(input: UpdateWikiCategoryInput): Promise<WikiCategorySaveResult | null>;
    deleteWikiCategoryAssociation(
        agencyId: number,
        idolId: number,
        name: string
    ): Promise<WikiCategoryRecord | null>;
    saveWikiLayout(input: WikiLayoutInput): Promise<WikiLayoutSaveResult>;
    listStoryCards(agencyCode: string, idolId: number): Promise<StoryCardRecord[]>;
    listStories(agencyCode: string, idolId: number): Promise<StoryRecord[]>;
    sampleStory(agencyCode: string, categories: readonly string[]): Promise<(StoryRecord & {
        idol_name: string;
        agency_name: string;
    }) | null>;
    sampleWikiBackground(): Promise<WikiBackgroundRecord | null>;
    insertStoryReturningId(input: NewStoryInput): Promise<number>;
    insertStoryBatchReturningIds(input: NewStoryBatchInput): Promise<number[]>;
    addStoryCardSources(input: AddStoryCardSourcesInput): Promise<AddStoryCardSourcesResult>;
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
    findStoryCardById(
        agencyCode: string,
        idolId: number,
        cardId: number
    ): Promise<StoryCardRecord | null>;
    updateStoryCard(input: UpdateStoryCardInput): Promise<WikiStoryCardSaveResult>;
    deleteStoryLink(input: DeleteStoryLinkInput): Promise<DeleteStoryLinkResult | null>;
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
    adminAccounts: AdminAccountRepository;
    audit: AuditRepository;
    news: NewsRepository;
    events: EventRepository;
    namecards: NamecardRepository;
    reactions: ReactionRepository;
    homepageLinks: HomepageLinkRepository;
    sitePackages: SitePackageRepository;
    story: StoryRepository;
}
