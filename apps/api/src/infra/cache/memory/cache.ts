import type { CacheStore } from "@/ports/cache";

interface MemoryCacheEntry {
    value: string;
    expiresAt: number;
}

export class MemoryCache implements CacheStore {
    private readonly values = new Map<string, MemoryCacheEntry>();

    constructor(private readonly now: () => number = Date.now) {}

    async get(key: string): Promise<string | null> {
        const entry = this.values.get(key);
        if (!entry) return null;
        if (entry.expiresAt <= this.now()) {
            this.values.delete(key);
            return null;
        }
        return entry.value;
    }

    async set(key: string, value: string, ttlSeconds: number): Promise<void> {
        if (!Number.isSafeInteger(ttlSeconds) || ttlSeconds < 1) {
            throw new Error("Cache TTL must be a positive safe integer");
        }
        this.values.set(key, {
            value,
            expiresAt: this.now() + ttlSeconds * 1000,
        });
    }

    async delete(key: string): Promise<void> {
        this.values.delete(key);
    }

    async ping(): Promise<void> {}

    async close(): Promise<void> {
        this.values.clear();
    }
}
