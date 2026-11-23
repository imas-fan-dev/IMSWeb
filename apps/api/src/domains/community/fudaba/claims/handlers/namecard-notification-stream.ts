import type { FailureMessageResponse } from '@imsweb/contracts/common';
import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import { platformAccountRepository, services } from '@/middleware/hono-context';

const HEARTBEAT_MS = 20_000;
const RECHECK_SESSION_MS = 60_000;
const encoder = new TextEncoder();
const changedFrame = encoder.encode('event: inbox.changed\ndata: {}\n\n');
const heartbeatFrame = encoder.encode(': heartbeat\n\n');

export function handleNamecardNotificationStream(c: Context<AppEnvironment>): Response {
    c.header('Cache-Control', 'private, no-store, no-transform');
    // Hono dispatches HEAD to the GET handler but discards the body.
    if (c.req.raw.method === 'HEAD') return c.body(null, 204);

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

    function cleanup() {
        if (stopped) return false;
        stopped = true;
        unsubscribe?.();
        signal.removeEventListener('abort', close);
        clearTimeout(expiry);
        clearInterval(heartbeat);
        clearTimeout(recheck);
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

    unsubscribe = services(c).namecardNotificationEvents?.subscribe(claims.id, { changed, close });
    if (!unsubscribe) {
        close();
        c.header('Retry-After', '5');
        return c.json({ success: false, message: '消息实时连接暂不可用' } satisfies FailureMessageResponse, 503);
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
    }

    return c.body(stream, 200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'X-Accel-Buffering': 'no'
    });
}
