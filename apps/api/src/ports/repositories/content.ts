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
