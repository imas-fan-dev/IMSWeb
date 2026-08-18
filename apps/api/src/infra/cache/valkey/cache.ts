import { createClient, type RedisClientType } from "redis";
import type { NodeCacheConfig } from "@/config/cache";
import type { CacheStore } from "@/ports/cache";

interface ValkeyClientLike {
    connect(): Promise<unknown>;
    sendCommand<T = unknown>(args: readonly string[]): Promise<T>;
    close(): Promise<void>;
    destroy?(): void;
    on(event: "error", listener: (error: unknown) => void): unknown;
}

function assertTtl(ttlSeconds: number): void {
    if (!Number.isSafeInteger(ttlSeconds) || ttlSeconds < 1) {
        throw new Error("Cache TTL must be a positive safe integer");
    }
}

function assertCacheKey(key: string): void {
    if (!key || key.length > 512 || /[\0-\x20\x7f]/.test(key)) {
        throw new Error(
            "Cache key must be a non-empty printable value no longer than 512 characters",
        );
    }
}

export interface ValkeyCacheOptions {
    keyPrefix: string;
}

export class ValkeyCache implements CacheStore {
    constructor(
        private readonly client: ValkeyClientLike,
        private readonly options: ValkeyCacheOptions,
    ) {}

    private key(key: string): string {
        assertCacheKey(key);
        return `${this.options.keyPrefix}${key}`;
    }

    async get(key: string): Promise<string | null> {
        const value = await this.client.sendCommand<string | null>([
            "GET",
            this.key(key),
        ]);
        return value === null ? null : String(value);
    }

    async set(key: string, value: string, ttlSeconds: number): Promise<void> {
        assertTtl(ttlSeconds);
        await this.client.sendCommand([
            "SET",
            this.key(key),
            value,
            "EX",
            String(ttlSeconds),
        ]);
    }

    async delete(key: string): Promise<void> {
        await this.client.sendCommand(["DEL", this.key(key)]);
    }

    async ping(): Promise<void> {
        const result = await this.client.sendCommand<string>(["PING"]);
        if (result !== "PONG")
            throw new Error(
                "Valkey health check returned an unexpected response",
            );
    }

    async close(): Promise<void> {
        await this.client.close();
    }
}

function clientForConfig(config: NodeCacheConfig): RedisClientType {
    if (!config.valkeyUrl)
        throw new Error("Valkey URL is required for the Valkey cache backend");
    const client = createClient({
        url: config.valkeyUrl,
        socket: { connectTimeout: config.connectTimeoutMs },
    });
    client.on("error", (error) => {
        const code =
            (error as NodeJS.ErrnoException | undefined)?.code || "UNKNOWN";
        console.error(JSON.stringify({ event: "valkey_client_error", code }));
    });
    return client;
}

/**
 * One connected client is shared by every Valkey-backed cache service in a
 * runtime; closing the ValkeyCache built on it closes the shared connection.
 */
export async function createValkeyClient(
    config: NodeCacheConfig,
): Promise<RedisClientType> {
    const client = clientForConfig(config);
    try {
        await client.connect();
    } catch (error) {
        client.destroy();
        throw error;
    }
    return client;
}
