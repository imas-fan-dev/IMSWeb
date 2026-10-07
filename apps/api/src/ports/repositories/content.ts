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
        afterId?: string,
    ): Promise<Record<string, unknown>[]>;
    listAdminNews(): Promise<Record<string, unknown>[]>;
    insertNews(input: NewsInput): Promise<number>;
    findNewsMedia(
        id: number,
    ): Promise<{ image: string; thumbnail: string } | null>;
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
    updateEvent(
        id: number,
        input: EventInput,
        expectedImageUrl: string,
    ): Promise<boolean>;
    findEventByOperationKey(
        operationKey: string,
    ): Promise<Record<string, unknown> | null>;
    markEventReady(id: number, operationKey: string): Promise<boolean>;
    countEvents(): Promise<number>;
    listEvents(
        limit: number,
        offset: number,
    ): Promise<Record<string, unknown>[]>;
    findLatestEventId(): Promise<string | null>;
    listEventsByCursor(
        limit: number,
        snapshotId: string,
        afterId?: string,
    ): Promise<Record<string, unknown>[]>;
    findEvent(id: number): Promise<Record<string, unknown> | null>;
    findEventMedia(id: number): Promise<{ image_url: string } | null>;
    countEventMediaReferences(imageUrl: string): Promise<number>;
    deleteEvent(id: number): Promise<boolean>;
}

export type ArticleContentType = "event" | "chronicle";
export type ArticleStatus = "draft" | "published" | "archived";
export type EventKind = "event" | "notice";
export type SpotlightCategory = "activity" | "fan";
export type ChronicleSourceType = "official" | "community";
export type ChronicleDatePrecision = "year" | "month" | "day";

export interface EditorialDraftRecord {
    id: number;
    article_id: number;
    revision: number;
}

export interface EditorialUpdateInput {
    title: string;
    summary: string;
    coverUrl: string | null;
    bodyJson: Record<string, unknown>;
    bodyHtml: string;
    revision: number;
    userId: number;
}

export interface EditorialCoverTransform {
    focalX: number;
    focalY: number;
    zoom: number;
}

export interface EditorialRelatedLink {
    label: string;
    url: string;
}

export interface EditorialStatusResult {
    status: "updated" | "conflict" | "not-found";
    revision?: number;
}

export interface EditorialEventUpdateInput extends EditorialUpdateInput {
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
    coverTransform: EditorialCoverTransform;
    relatedLinks: EditorialRelatedLink[];
}

export interface EditorialChronicleUpdateInput extends EditorialUpdateInput {
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

export interface EditorialChronicleCursor {
    occurredOn: string;
    timelineOrder: number;
    articleId: string;
}

export interface EditorialRepository {
    createEventDraft(input: {
        title: string;
        kind: EventKind;
        userId: number;
    }): Promise<EditorialDraftRecord>;
    createChronicleDraft(input: {
        title: string;
        sourceType: ChronicleSourceType;
        userId: number;
    }): Promise<EditorialDraftRecord>;
    listAdminEvents(status?: ArticleStatus): Promise<Record<string, unknown>[]>;
    findAdminEvent(id: number): Promise<Record<string, unknown> | null>;
    findPublicEvent(id: number): Promise<Record<string, unknown> | null>;
    deleteEditorialEvent(id: number): Promise<boolean>;
    updateEditorialEvent(
        id: number,
        input: EditorialEventUpdateInput,
    ): Promise<EditorialStatusResult>;
    listAdminSpotlightEntries(): Promise<Record<string, unknown>[]>;
    replaceHomepageSpotlightEntries(
        input: Array<{ postId: number; category: SpotlightCategory }>,
    ): Promise<{ status: "updated" | "invalid" }>;
    importLegacyInformationPost(input: {
        legacyInformationId: string;
        category: SpotlightCategory;
        title: string;
        coverUrl: string;
        sourceUrl: string | null;
        bodyJson: Record<string, unknown>;
        bodyHtml: string;
        publishedAt: string;
    }): Promise<{ id: number; imported: boolean }>;
    findLegacyInformationPost(
        legacyInformationId: string,
    ): Promise<{ id: number } | null>;
    listPublicSpotlightEntries(): Promise<Record<string, unknown>[]>;
    listPublicChronicle(
        limit: number,
        cursor: EditorialChronicleCursor | null,
    ): Promise<Record<string, unknown>[]>;
    listAdminChronicle(
        status?: ArticleStatus,
    ): Promise<Record<string, unknown>[]>;
    findAdminChronicle(id: number): Promise<Record<string, unknown> | null>;
    findPublicChronicle(id: number): Promise<Record<string, unknown> | null>;
    deleteEditorialChronicle(id: number): Promise<boolean>;
    updateChronicle(
        id: number,
        input: EditorialChronicleUpdateInput,
    ): Promise<EditorialStatusResult>;
    setArticleStatus(
        articleId: number,
        status: ArticleStatus,
        expectedRevision: number,
        userId: number,
    ): Promise<EditorialStatusResult>;
    insertArticleAsset(input: {
        articleId: number;
        objectKey: string;
        publicPath: string;
        usage: "cover" | "body";
        altText: string;
        userId: number;
    }): Promise<Record<string, unknown>>;
    findEditorialArticle(
        articleId: number,
    ): Promise<Record<string, unknown> | null>;
    findArticleAsset(
        articleId: number,
        assetId: number,
    ): Promise<Record<string, unknown> | null>;
    listArticleAssets(articleId: number): Promise<Record<string, unknown>[]>;
    deleteArticleAsset(
        articleId: number,
        assetId: number,
    ): Promise<Record<string, unknown> | null>;
}

export const HOMEPAGE_LINK_SECTIONS = [
    "navigation",
    "friend",
    "support",
] as const;

export type HomepageLinkSection = (typeof HOMEPAGE_LINK_SECTIONS)[number];

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
    listHomepageLinks(
        section?: HomepageLinkSection,
    ): Promise<HomepageLinkRecord[]>;
    findHomepageLinkById(id: string): Promise<HomepageLinkRecord | null>;
    createHomepageLink(
        input: NewHomepageLinkInput,
    ): Promise<HomepageLinkRecord>;
    updateHomepageLink(
        id: string,
        input: HomepageLinkUpdateInput,
    ): Promise<HomepageLinkRecord | null>;
    deleteHomepageLink(id: string): Promise<boolean>;
    reorderHomepageLinks(
        section: HomepageLinkSection,
        ids: readonly string[],
        updatedAt: number,
    ): Promise<boolean>;
}
