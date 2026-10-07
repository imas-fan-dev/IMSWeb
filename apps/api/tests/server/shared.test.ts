// Merged from 2 sibling files that each keep their own describe block.
// The block around every contribution gives it its own scope, so identically
// named fixtures from different files cannot clash.

import { assertContractJson as assertRawJsonConforms } from '../contracts/contract-json';
import { createHonoApp, type AppEnvironment } from '@/app';
import { authenticateBackoffice } from '@/middleware/hono-auth';
import { jsonBodyLimit } from '@/middleware/json-body-limit';
import { enforceRateLimit } from '@/middleware/rate-limit';
import { jsonValidator } from '@/middleware/request-validation';
import type { RuntimeServices } from '@/ports/runtime-services';
import { errorResponseSchema, failureMessageResponseSchema } from '@imsweb/contracts/common';
import { ADMIN_API_PATH_PREFIX, ADMIN_EXCHANGE_PATH_PREFIX, adminApiPath, adminExchangePath, API_PATH_PREFIX, apiPath, EXCHANGE_PATH_PREFIX, exchangePath, platformAuthPath, siteContentPath, WIKI_PATH_PREFIX, wikiPath } from '@imsweb/contracts/paths';
import { Hono } from 'hono';
import assert from 'node:assert/strict';
import { test } from 'vitest';

// shared-json-error-contract.test.ts
{
    test.describe('shared json error contract', () => {
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
    });
}

// shared-paths.test.ts
{
    test.describe('shared paths', () => {
        test('shared path prefixes compose the canonical API and delivery paths', () => {
            assert.equal(API_PATH_PREFIX, '/api');
            assert.equal(ADMIN_API_PATH_PREFIX, '/api/admin');
            assert.equal(EXCHANGE_PATH_PREFIX, '/api/community/exchange');
            assert.equal(ADMIN_EXCHANGE_PATH_PREFIX, '/api/admin/community/exchange');
            assert.equal(WIKI_PATH_PREFIX, '/api/wiki');
            assert.equal(apiPath('/health/ready'), '/api/health/ready');
            assert.equal(adminApiPath('/auth/session'), '/api/admin/auth/session');
            assert.equal(exchangePath('/me/cards/:id'), '/api/community/exchange/me/cards/:id');
            assert.equal(platformAuthPath('/register'), '/api/platform/auth/register');
            assert.equal(wikiPath('/catalog'), '/api/wiki/catalog');
            assert.equal(siteContentPath('/_preview/:token'), '/site-content/_preview/:token');
        });

        test('shared path builders normalize suffix separators without duplicate slashes', () => {
            assert.equal(apiPath(), '/api');
            assert.equal(apiPath('health/ready'), '/api/health/ready');
            assert.equal(adminExchangePath('//cards'), '/api/admin/community/exchange/cards');
        });
    });
}
