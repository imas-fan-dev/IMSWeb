/** Transient, account-scoped invalidations; the inbox GET remains authoritative. */
export interface NamecardNotificationSubscriber {
    changed(): void;
    close(): void;
}

export interface NamecardNotificationEvents {
    /** Null when unavailable or at capacity. */
    subscribe(accountId: string, subscriber: NamecardNotificationSubscriber): (() => void) | null;
    /** The caller must verify ownership before subscribing to an internal scan session ID. */
    subscribeScan?(accountId: string, sessionId: string, subscriber: NamecardNotificationSubscriber): (() => void) | null;
    close?(): Promise<void>;
}
