import {
    VALKEY_RATE_LIMIT_SCRIPT,
} from '@/infra/cache/valkey/rate-limiter';

interface FakeWindowState {
    resetAtMs: number;
    consumed: number;
}

/**
 * In-process stand-in for the Valkey rate-limit script. One instance models
 * one shared Valkey, so several ValkeyRateLimiter clients pointed at the same
 * fake exercise the cross-replica sharing semantics; each EVAL executes
 * synchronously, matching the single-threaded atomicity of the real server.
 */
export class FakeValkeyRateLimitServer {
    readonly windows = new Map<string, FakeWindowState>();
    readonly identities = new Map<string, Set<string>>();
    readonly expirations = new Map<string, number>();

    consumedFor(windowKey: string): number {
        return this.windows.get(windowKey)?.consumed ?? 0;
    }

    async sendCommand<T = unknown>(args: readonly string[]): Promise<T> {
        const [
            command,
            script,
            keyCount,
            windowKey,
            identityKey,
            nowArg,
            limitArg,
            windowMsArg,
            member,
        ] = args;
        if (
            command !== 'EVAL' ||
            script !== VALKEY_RATE_LIMIT_SCRIPT ||
            keyCount !== '2' ||
            !windowKey ||
            !identityKey ||
            member === undefined
        ) {
            throw new Error(`Unsupported fake Valkey command: ${String(command)}`);
        }
        const now = Number(nowArg);
        const limit = Number(limitArg);
        const windowMs = Number(windowMsArg);
        let window = this.windows.get(windowKey);
        if (!window || window.resetAtMs <= now) {
            window = { resetAtMs: now + windowMs, consumed: 0 };
            this.windows.set(windowKey, window);
            this.identities.delete(identityKey);
        }
        this.expirations.set(windowKey, window.resetAtMs);
        const remainingBefore = Math.max(0, limit - window.consumed);
        if (member) {
            const members = this.identities.get(identityKey);
            if (members?.has(member)) {
                return [1, remainingBefore, window.resetAtMs] as T;
            }
        }
        if (window.consumed >= limit) {
            return [0, 0, window.resetAtMs] as T;
        }
        if (member) {
            const members = this.identities.get(identityKey) ?? new Set<string>();
            members.add(member);
            this.identities.set(identityKey, members);
            this.expirations.set(identityKey, window.resetAtMs);
        }
        window.consumed += 1;
        return [1, Math.max(0, limit - window.consumed), window.resetAtMs] as T;
    }
}
