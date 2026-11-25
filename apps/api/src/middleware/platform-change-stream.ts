import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import { platformAccountRepository } from '@/middleware/hono-context';
import type { NamecardNotificationSubscriber } from '@/ports/namecard-notification-events';

const HEARTBEAT_MS = 20_000;
const RECHECK_SESSION_MS = 60_000;
const encoder = new TextEncoder();
const heartbeatFrame = encoder.encode(': heartbeat\n\n');

/** Private SSE invalidations with bounded buffering and platform session lifetime checks. */
export function openPlatformChangeStream(
    c: Context<AppEnvironment>,
    event: 'inbox.changed' | 'scan.changed',
    subscribe: (subscriber: NamecardNotificationSubscriber) => (() => void) | null | undefined,
    changeAt?: number,
): ReadableStream<Uint8Array> | null {
    const changedFrame = encoder.encode(`event: ${event}\ndata: {}\n\n`);

    const claims = c.get('platformUser')!;
    const expiresAt = Math.min(claims.exp * 1_000, c.get('platformSessionExpiresAt')!);
    const repository = platformAccountRepository(c);
    const signal = c.req.raw.signal;
    let unsubscribe: (() => void) | null | undefined;
    let controller: ReadableStreamDefaultController<Uint8Array>;
    let waiting = false;
    let pendingChange = false;
    let stopped = false;
    let expiry: ReturnType<typeof setTimeout>;
    let heartbeat: ReturnType<typeof setInterval>;
    let recheck: ReturnType<typeof setTimeout>;
    let scheduledChange: ReturnType<typeof setTimeout> | undefined;

    function cleanup() {
        if (stopped) return false;
        stopped = true;
        unsubscribe?.();
        signal.removeEventListener('abort', close);
        clearTimeout(expiry);
        clearInterval(heartbeat);
        clearTimeout(recheck);
        clearTimeout(scheduledChange);
        return true;
    }

    function close() {
        if (cleanup()) controller.close();
    }

    function flush(allowHeartbeat = false) {
        if (stopped) return;
        if (Date.now() >= expiresAt) return close();
        if (!waiting || (!pendingChange && !allowHeartbeat)) return;
        waiting = false;
        controller.enqueue(pendingChange ? changedFrame.slice() : heartbeatFrame.slice());
        pendingChange = false;
    }

    function changed() {
        pendingChange = true;
        flush();
    }

    async function checkSession() {
        try {
            const [session, identity] = await Promise.all([
                repository.findRefreshSessionById(claims.sessionId),
                repository.findAccountWithProfileById(claims.id)
            ]);
            if (stopped) return;
            if (
                !session || session.account_id !== claims.id || session.revoked_at !== null ||
                session.expires_at <= Date.now() || !identity ||
                identity.account.token_version !== claims.tokenVersion ||
                identity.account.status === 'suspended' || identity.account.status === 'deleted'
            ) return close();
            recheck = setTimeout(() => void checkSession(), RECHECK_SESSION_MS);
        } catch {
            close();
        }
    }

    const stream = new ReadableStream<Uint8Array>({
        start(value) { controller = value; },
        pull() {
            waiting = true;
            flush();
        },
        cancel() { cleanup(); }
    }, { highWaterMark: 0 });

    unsubscribe = subscribe({ changed, close });
    if (!unsubscribe) {
        close();
        return null;
    }
    signal.addEventListener('abort', close, { once: true });
    if (signal.aborted || expiresAt <= Date.now()) {
        close();
    } else {
        expiry = setTimeout(close, expiresAt - Date.now());
        heartbeat = setInterval(() => flush(true), HEARTBEAT_MS);
        // Stagger the checks so mass reconnects do not keep hitting the DB together.
        recheck = setTimeout(() => void checkSession(), RECHECK_SESSION_MS * (0.75 + Math.random() * 0.25));
        // Subscribe first: even a reconnect after lost hints refreshes the REST snapshot.
        changed();
        if (changeAt !== undefined && changeAt > Date.now() && changeAt < expiresAt) {
            scheduledChange = setTimeout(changed, Math.max(0, changeAt - Date.now()));
        }
    }

    return stream;
}
