export interface UserRecord {
    id: number;
    username: string;
    password: string;
    dept: string;
    producername: string | null;
}

export interface AuditLogInput {
    username: string;
    producername: string;
    action: string;
    target: string;
    ip: string;
    time: string;
}

export interface NewsInput {
    title: string;
    image: string;
    thumbnail: string;
    content: string;
    date: string;
    author: string;
}

export interface EventInput {
    title: string;
    name: string;
    contact: string;
    imageUrl: string;
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

export interface CoreRepository {
    initialize(): Promise<void>;
    close(): Promise<void>;

    findUserByUsername(username: string): Promise<UserRecord | null>;
    findUserById(id: number): Promise<UserRecord | null>;
    insertAuditLog(input: AuditLogInput): Promise<void>;
    listRecentAuditLogs(limit: number): Promise<Record<string, unknown>[]>;

    listPublicNews(): Promise<Record<string, unknown>[]>;
    listAdminNews(): Promise<Record<string, unknown>[]>;
    insertNews(input: NewsInput): Promise<number>;
    findNewsMedia(id: number): Promise<{ image: string; thumbnail: string } | null>;
    deleteNews(id: number): Promise<void>;

    insertEvent(input: EventInput): Promise<number>;
    countEvents(): Promise<number>;
    listEvents(limit: number, offset: number): Promise<Record<string, unknown>[]>;
    findEvent(id: number): Promise<Record<string, unknown> | null>;
    findEventMedia(id: number): Promise<{ image_url: string } | null>;
    deleteEvent(id: number): Promise<boolean>;

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

    findApprovedCard(id: number): Promise<{ id: number } | null>;
    listReactions(cardId: number): Promise<Array<{ emoji: string; count: number }>>;
    incrementReaction(cardId: number, emoji: string): Promise<void>;
    decrementAndPruneReaction(cardId: number, emoji: string): Promise<void>;
}
