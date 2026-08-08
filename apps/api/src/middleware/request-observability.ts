import type { MiddlewareHandler } from 'hono';
import type { AppEnvironment } from '@/app';

function durationMilliseconds(startedAt: number): number {
    return Math.round((performance.now() - startedAt) * 100) / 100;
}

export function requestCompletionLogger(enabled: boolean): MiddlewareHandler<AppEnvironment> {
    return async (c, next) => {
        if (!enabled) return next();
        const startedAt = performance.now();
        await next();
        console.info(JSON.stringify({
            event: 'http_request_completed',
            requestId: c.get('requestId'),
            method: c.req.method,
            path: c.req.path,
            status: c.res.status,
            durationMs: durationMilliseconds(startedAt)
        }));
    };
}
