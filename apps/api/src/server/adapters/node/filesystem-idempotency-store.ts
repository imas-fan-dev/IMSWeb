import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type {
    IdempotencyClaim,
    IdempotencyResponse,
    IdempotencyStore
} from '@/ports/idempotency-store';

interface StoredClaim {
    scope: string;
    key: string;
    fingerprint: string;
    state: 'started' | 'completed' | 'failed';
    response?: IdempotencyResponse;
    updatedAt: number;
    generation?: number;
}

const STALE_AFTER_MS = 5 * 60 * 1000;

export class FilesystemIdempotencyStore implements IdempotencyStore {
    private readonly queues = new Map<string, Promise<void>>();

    constructor(private readonly directory: string) {}

    private identity(scope: string, key: string): string {
        return crypto.createHash('sha256').update(scope).update('\0').update(key).digest('hex');
    }

    private filePath(identity: string): string {
        return path.join(this.directory, `${identity}.json`);
    }

    private async read(identity: string): Promise<StoredClaim | null> {
        try {
            return JSON.parse(await fs.readFile(this.filePath(identity), 'utf8')) as StoredClaim;
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
            throw error;
        }
    }

    private async write(identity: string, record: StoredClaim): Promise<void> {
        await fs.mkdir(this.directory, { recursive: true, mode: 0o700 });
        const destination = this.filePath(identity);
        const temporary = `${destination}.${process.pid}.${crypto.randomUUID()}.tmp`;
        try {
            await fs.writeFile(temporary, JSON.stringify(record), { flag: 'wx', mode: 0o600 });
            await fs.rename(temporary, destination);
        } finally {
            await fs.rm(temporary, { force: true }).catch(() => undefined);
        }
    }

    private async exclusive<T>(identity: string, operation: () => Promise<T>): Promise<T> {
        const previous = this.queues.get(identity) ?? Promise.resolve();
        let release!: () => void;
        const current = new Promise<void>((resolve) => { release = resolve; });
        const queued = previous.catch(() => undefined).then(() => current);
        this.queues.set(identity, queued);
        await previous.catch(() => undefined);
        try {
            return await operation();
        } finally {
            release();
            if (this.queues.get(identity) === queued) this.queues.delete(identity);
        }
    }

    async claim(scope: string, key: string, fingerprint: string): Promise<IdempotencyClaim> {
        const identity = this.identity(scope, key);
        return this.exclusive(identity, async () => {
            const existing = await this.read(identity);
            if (!existing) {
                await this.write(identity, {
                    scope, key, fingerprint, state: 'started', updatedAt: Date.now(), generation: 1
                });
                return { kind: 'acquired', recovered: false, generation: 1 };
            }
            if (existing.scope !== scope || existing.key !== key || existing.fingerprint !== fingerprint) {
                return { kind: 'conflict' };
            }
            if (existing.state === 'completed' && existing.response) {
                return { kind: 'replay', response: existing.response };
            }
            if (existing.state === 'started' && Date.now() - existing.updatedAt < STALE_AFTER_MS) {
                return { kind: 'in-progress' };
            }
            const generation = (existing.generation ?? 1) + 1;
            await this.write(identity, {
                ...existing,
                state: 'started',
                response: undefined,
                updatedAt: Date.now(),
                generation
            });
            return { kind: 'acquired', recovered: true, generation };
        });
    }

    async isCurrent(
        scope: string,
        key: string,
        fingerprint: string,
        generation: number
    ): Promise<boolean> {
        const identity = this.identity(scope, key);
        return this.exclusive(identity, async () => {
            const existing = await this.read(identity);
            return existing?.scope === scope && existing.key === key &&
                existing.fingerprint === fingerprint && existing.state === 'started' &&
                (existing.generation ?? 1) === generation;
        });
    }

    async complete(
        scope: string,
        key: string,
        fingerprint: string,
        generation: number,
        response: IdempotencyResponse
    ): Promise<void> {
        const identity = this.identity(scope, key);
        await this.exclusive(identity, async () => {
            const existing = await this.read(identity);
            if (existing?.scope === scope && existing.key === key &&
                existing.fingerprint === fingerprint &&
                (existing.generation ?? 1) === generation && existing.state === 'completed') {
                return;
            }
            if (!existing || existing.scope !== scope || existing.key !== key ||
                existing.fingerprint !== fingerprint || existing.state !== 'started' ||
                (existing.generation ?? 1) !== generation) {
                throw new Error('Idempotency lease is no longer current');
            }
            await this.write(identity, {
                ...existing,
                state: 'completed',
                response,
                updatedAt: Date.now()
            });
        });
    }

    async fail(
        scope: string,
        key: string,
        fingerprint: string,
        generation: number
    ): Promise<void> {
        const identity = this.identity(scope, key);
        await this.exclusive(identity, async () => {
            const existing = await this.read(identity);
            if (!existing || existing.scope !== scope || existing.key !== key ||
                existing.fingerprint !== fingerprint || existing.state !== 'started' ||
                (existing.generation ?? 1) !== generation) return;
            await this.write(identity, { ...existing, state: 'failed', updatedAt: Date.now() });
        });
    }
}
