import type { FailureMessageResponse } from '@imsweb/contracts/common';
import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import { services } from '@/middleware/hono-context';
import { openPlatformChangeStream } from '@/middleware/platform-change-stream';

export function handleNamecardNotificationStream(c: Context<AppEnvironment>): Response {
    c.header('Cache-Control', 'private, no-store, no-transform');
    // Hono dispatches HEAD to the GET handler but discards the body.
    if (c.req.raw.method === 'HEAD') return c.body(null, 204);

    const accountId = c.get('platformUser')!.id;
    const events = services(c).namecardNotificationEvents;
    const stream = openPlatformChangeStream(c, 'inbox.changed', (subscriber) =>
        events?.subscribe(accountId, subscriber));
    if (stream) return c.body(stream, 200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'X-Accel-Buffering': 'no'
    });
    c.header('Retry-After', '5');
    return c.json({ success: false, message: '消息实时连接暂不可用' } satisfies FailureMessageResponse, 503);
}
