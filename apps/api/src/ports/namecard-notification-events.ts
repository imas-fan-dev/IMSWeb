/** Transient, account-scoped invalidations; the inbox GET remains authoritative. */
export interface NamecardNotificationSubscriber {
    changed(): void;
    close(): void;
}

export interface NamecardNotificationEvents {
    /** Null when unavailable or at capacity. */
    subscribe(accountId: string, subscriber: NamecardNotificationSubscriber): (() => void) | null;
    close?(): Promise<void>;
}
