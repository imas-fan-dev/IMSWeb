import { Client } from 'pg';
import { postgresPoolConfig, type PostgresConnectionOptions } from '@/infra/db/postgresql/connection';
import type { NamecardNotificationEvents, NamecardNotificationSubscriber } from '@/ports/namecard-notification-events';

const CHANNEL = 'ims_namecard_inbox_changed';
const MAX_PER_ACCOUNT = 8;
const MAX_PER_PROCESS = 2048;
const MIN_RETRY_MS = 1_000;
const MAX_RETRY_MS = 30_000;

export class PostgresNamecardNotificationListener implements NamecardNotificationEvents {
    private readonly accounts = new Map<string, Set<NamecardNotificationSubscriber>>();
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
            if (this.client !== client || !this.ready || channel !== CHANNEL || !payload) return;
            for (const subscriber of this.accounts.get(payload) ?? []) subscriber.changed();
        });
        void (async () => {
            try {
                await client.connect();
                await client.query(`LISTEN ${CHANNEL}`);
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
        if (!this.ready || this.stopped || this.size >= MAX_PER_PROCESS) return null;
        const account = this.accounts.get(accountId) ?? new Set<NamecardNotificationSubscriber>();
        if (account.size >= MAX_PER_ACCOUNT) return null;
        this.accounts.set(accountId, account);
        account.add(subscriber);
        this.size++;
        return () => {
            if (!account.delete(subscriber)) return;
            this.size--;
            if (!account.size) this.accounts.delete(accountId);
        };
    }

    private closeSubscribers(): void {
        const accounts = [...this.accounts.values()];
        for (const account of accounts) {
            for (const subscriber of account) subscriber.close();
            account.clear();
        }
        this.accounts.clear();
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
