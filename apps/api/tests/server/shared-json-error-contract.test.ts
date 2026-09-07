import assert from 'node:assert/strict';
import test from 'node:test';
import {
    errorResponseSchema,
    failureMessageResponseSchema,
} from '@imsweb/contracts/common';
import { Hono } from 'hono';
import { createHonoApp, type AppEnvironment } from '@/app';
import { authenticateBackoffice } from '@/middleware/hono-auth';
import { jsonBodyLimit } from '@/middleware/json-body-limit';
import { enforceRateLimit } from '@/middleware/rate-limit';
import { jsonValidator } from '@/middleware/request-validation';
import type { RuntimeServices } from '@/ports/runtime-services';

async function assertRawJsonConforms(
    response: Response,
    status: number,
    schema: { parse(value: unknown): unknown },
): Promise<void> {
    assert.equal(response.status, status);
    assert.match(response.headers.get('content-type') ?? '', /^application\/json/i);
    const raw = await response.json();
    assert.deepEqual(schema.parse(raw), raw);
}

test('shared middleware JSON errors conform to their common contracts', async () => {
    const authApp = new Hono<AppEnvironment>();
    authApp.get('/protected', authenticateBackoffice, (c) => c.json({ reached: true }));
    await assertRawJsonConforms(
        await authApp.request('/protected'),
        401,
        failureMessageResponseSchema,
    );

    const rateApp = new Hono<AppEnvironment>();
    rateApp.use('*', async (c, next) => {
        c.set('services', {
            rateLimiter: {
                async consume() {
                    return { allowed: false, remaining: 0, resetAt: Date.now() + 1_000 };
                },
            },
        } as RuntimeServices);
        await next();
    });
    rateApp.get('/limited', async (c) => {
        return (await enforceRateLimit(c, {
            bucket: 'contract',
            limit: 1,
            windowSeconds: 60,
        })) ?? c.json({ reached: true });
    });
    const rateLimited = await rateApp.request('/limited');
    await assertRawJsonConforms(rateLimited, 429, errorResponseSchema);
    assert.equal(typeof rateLimited.headers.get('retry-after'), 'string');

    const bodyLimitApp = new Hono<AppEnvironment>();
    bodyLimitApp.use('*', jsonBodyLimit(1));
    bodyLimitApp.post('/api/reactions', (c) => c.json({ reached: true }));
    await assertRawJsonConforms(
        await bodyLimitApp.request('/api/reactions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': '2',
            },
            body: '{}',
        }),
        413,
        errorResponseSchema,
    );

    const validationApp = new Hono();
    validationApp.post('/validated', jsonValidator(() => {
        throw Object.assign(new Error('invalid input'), { status: 400 });
    }), (c) => c.json({ reached: true }));
    await assertRawJsonConforms(
        await validationApp.request('/validated', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: '{}',
        }),
        400,
        errorResponseSchema,
    );
});

test('central application JSON errors conform to the common error contract', async () => {
    const app = createHonoApp(() => ({}));
    app.get('/api/contract-error/:status', (c) => {
        throw Object.assign(new Error('expected client error'), {
            status: Number(c.req.param('status')),
        });
    });

    await assertRawJsonConforms(
        await app.request('/api/contract-error/409'),
        409,
        errorResponseSchema,
    );
    await assertRawJsonConforms(
        await app.request('/api/contract-error/500'),
        500,
        errorResponseSchema,
    );
});
