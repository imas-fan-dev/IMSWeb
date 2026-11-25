import { Client } from 'pg';
import { postgresPoolConfig, type PostgresConnectionOptions } from '@/infra/db/postgresql/connection';
import type { NamecardNotificationEvents, NamecardNotificationSubscriber } from '@/ports/namecard-notification-events';

const INBOX_CHANNEL = 'ims_namecard_inbox_changed';
const SCAN_CHANNEL = 'ims_namecard_scan_changed';
const MAX_PER_ACCOUNT = 8;
const MAX_PER_PROCESS = 2048;
const MIN_RETRY_MS = 1_000;
const MAX_RETRY_MS = 30_000;

export class PostgresNamecardNotificationListener implements NamecardNotificationEvents {
    private readonly topics = new Map<string, Set<NamecardNotificationSubscriber>>();
    private readonly accountCounts = new Map<string, number>();
    private size = 0;
    private client?: Client;
    private ready = false;
    private stopped = false;
    private retry?: ReturnType<typeof setTimeout>;
    private retryMs = MIN_RETRY_MS;
    private closing?: Promise<void>;

    constructor(private readonly options: PostgresConnectionOptions) {}

    start(): void {
        if (this.stopped || this.client || this.retry) return;
        const client = new Client({
            ...postgresPoolConfig(this.options),
            application_name: 'imsweb-api-inbox-listener',
            keepAlive: true,
            keepAliveInitialDelayMillis: 15_000,
            query_timeout: this.options.statementTimeoutMs,
        });
        this.client = client;
        const disconnected = () => {
            if (this.client !== client || this.stopped) return;
            this.client = undefined;
            this.ready = false;
            this.closeSubscribers();
            console.warn(JSON.stringify({ event: 'namecard_notification_listener_disconnected' }));
            void this.endClient(client);
            const delay = this.retryMs;
            this.retryMs = Math.min(delay * 2, MAX_RETRY_MS);
            this.retry = setTimeout(() => {
                this.retry = undefined;
                this.start();
            }, delay);
            this.retry.unref();
        };
        client.on('error', disconnected);
        client.on('end', disconnected);
        client.on('notification', ({ channel, payload }) => {
            if (this.client !== client || !this.ready || !payload) return;
            if (channel !== INBOX_CHANNEL && channel !== SCAN_CHANNEL) return;
            for (const subscriber of this.topics.get(`${channel}:${payload}`) ?? []) subscriber.changed();
        });
        void (async () => {
            try {
                await client.connect();
                await client.query(`LISTEN ${INBOX_CHANNEL}`);
                await client.query(`LISTEN ${SCAN_CHANNEL}`);
                if (this.client === client && !this.stopped) {
                    this.ready = true;
                    this.retryMs = MIN_RETRY_MS;
                }
            } catch {
                disconnected();
            }
        })();
    }

    subscribe(accountId: string, subscriber: NamecardNotificationSubscriber): (() => void) | null {
        return this.subscribeTopic(accountId, `${INBOX_CHANNEL}:${accountId}`, subscriber);
    }

    subscribeScan(accountId: string, sessionId: string, subscriber: NamecardNotificationSubscriber): (() => void) | null {
        return this.subscribeTopic(accountId, `${SCAN_CHANNEL}:${sessionId}`, subscriber);
    }

    private subscribeTopic(accountId: string, key: string, subscriber: NamecardNotificationSubscriber): (() => void) | null {
        const count = this.accountCounts.get(accountId) ?? 0;
        if (!this.ready || this.stopped || this.size >= MAX_PER_PROCESS || count >= MAX_PER_ACCOUNT) return null;
        const topic = this.topics.get(key) ?? new Set<NamecardNotificationSubscriber>();
        if (topic.has(subscriber)) return null;
        this.topics.set(key, topic);
        this.accountCounts.set(accountId, count + 1);
        topic.add(subscriber);
        this.size++;
        return () => {
            if (!topic.delete(subscriber)) return;
            this.size--;
            if (!topic.size) this.topics.delete(key);
            const remaining = (this.accountCounts.get(accountId) ?? 1) - 1;
            if (remaining) this.accountCounts.set(accountId, remaining);
            else this.accountCounts.delete(accountId);
        };
    }

    private closeSubscribers(): void {
        for (const topic of this.topics.values()) {
            for (const subscriber of topic) subscriber.close();
            topic.clear();
        }
        this.topics.clear();
        this.accountCounts.clear();
        this.size = 0;
    }

    drain(): void {
        this.stopped = true;
        this.ready = false;
        clearTimeout(this.retry);
        this.closeSubscribers();
    }

    close(): Promise<void> {
        this.drain();
        const client = this.client;
        this.client = undefined;
        if (client) this.closing = this.endClient(client);
        return this.closing ?? Promise.resolve();
    }

    private async endClient(client: Client): Promise<void> {
        try {
            await client.end();
        } catch {
            console.warn(JSON.stringify({ event: 'namecard_notification_listener_close_failed' }));
        }
    }
}
