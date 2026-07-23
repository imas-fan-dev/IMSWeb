import { env } from 'cloudflare:workers';
import {
    applyD1Migrations,
    createExecutionContext,
    reset,
    waitOnExecutionContext
} from 'cloudflare:test';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    assertCoreAuthContract,
    assertIdempotentReplayContract,
    assertJsonResponse,
    assertMediaRangeContract,
    assertMultipartParserContract,
    assertReactionContract,
    assertRejectedJwtContract
} from '../contracts/runtime-contracts.js';
import { workerApp } from '@/worker';
import worker from '@/worker';
import { createCloudflareServices } from '@/adapters/cloudflare/cloudflare-services';
import { R2ObjectStorage, fetchFinalR2Object } from
    '@/adapters/cloudflare/r2-object-storage';
import { StandardUploadParser } from '@/adapters/shared/standard-upload-parser';
import { D1UploadStateMachine } from
    '@/adapters/cloudflare/upload-state-machine';
import { D1IdempotencyStore } from
    '@/adapters/cloudflare/d1-idempotency-store';
import { D1CompensationService } from
    '@/adapters/cloudflare/d1-compensation-service';
import { D1CoreRepository } from
    '@/adapters/cloudflare/d1-core-repository';
import type { WorkerBindings } from
    '@/adapters/cloudflare/worker-bindings';
import { createHonoApp } from '@/app';
import type { ImageProcessor } from '@/ports/image-processor';
import type { ObjectStorage } from '@/ports/object-storage';
import type { RuntimeServices } from '@/ports/runtime-services';
import type { UploadParser } from '@/ports/upload-parser';
import { md5Hex } from '@/shared/md5';
import { serializeInformationIndex } from '@/domains/information/data';

const bindings = env as Cloudflare.Env & WorkerBindings;
const EXPECTED_SECURITY_HEADERS = {
    'cross-origin-opener-policy': 'same-origin',
    'cross-origin-resource-policy': 'cross-origin',
    'origin-agent-cluster': '?1',
    'referrer-policy': 'no-referrer',
    'strict-transport-security': 'max-age=31536000; includeSubDomains',
    'x-content-type-options': 'nosniff',
    'x-dns-prefetch-control': 'off',
    'x-download-options': 'noopen',
    'x-frame-options': 'SAMEORIGIN',
    'x-permitted-cross-domain-policies': 'none',
    'x-xss-protection': '0'
} as const;

function expectHelmetCompatibleSecurityHeaders(response: Response): void {
    for (const [name, value] of Object.entries(EXPECTED_SECURITY_HEADERS)) {
        expect(response.headers.get(name), name).toBe(value);
    }
    for (const name of [
        'content-security-policy',
        'cross-origin-embedder-policy',
        'x-powered-by'
    ]) {
        expect(response.headers.get(name), name).toBeNull();
    }
}

async function tableNames(database: D1Database): Promise<string[]> {
    const result = await database.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    ).all<{ name: string }>();
    return result.results.map((row) => row.name);
}

async function applyCoreMigrations(): Promise<void> {
    await applyD1Migrations(bindings.CORE_DB, bindings.TEST_CORE_MIGRATIONS);
}

async function applyStoryMigrations(): Promise<void> {
    await applyD1Migrations(bindings.STORY_DB, bindings.TEST_STORY_MIGRATIONS);
}

async function sha256(value: Uint8Array): Promise<string> {
    const digest = await crypto.subtle.digest('SHA-256', Uint8Array.from(value).buffer);
    return [...new Uint8Array(digest)]
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('');
}

function decodeJwtPart(token: string, index: number): Record<string, unknown> {
    const part = token.split('.')[index];
    if (!part) throw new Error('JWT part is missing');
    const normalized = part.replaceAll('-', '+').replaceAll('_', '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    return JSON.parse(atob(padded)) as Record<string, unknown>;
}

function responseCookies(response: Response): string[] {
    const headers = response.headers as Headers & { getSetCookie?: () => string[] };
    const values = headers.getSetCookie?.();
    if (values?.length) return values;
    const raw = response.headers.get('set-cookie');
    return raw ? raw.split(/,(?=\s*[^;,]+=)/).map((value) => value.trim()) : [];
}

function cookiePair(cookies: string[], name: string): string {
    const cookie = cookies.find((value) => value.startsWith(`${name}=`));
    if (!cookie) throw new Error(`${name} cookie is missing`);
    return cookie.split(';', 1)[0]!;
}

function jwtPart(value: unknown): string {
    const bytes = new TextEncoder().encode(JSON.stringify(value));
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

async function signJwt(
    header: Record<string, unknown>,
    claims: Record<string, unknown>,
    secret: string,
    hash: 'SHA-256' | 'SHA-512' = 'SHA-256'
): Promise<string> {
    const signingInput = `${jwtPart(header)}.${jwtPart(claims)}`;
    const key = await crypto.subtle.importKey(
        'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash }, false, ['sign']
    );
    const signature = new Uint8Array(await crypto.subtle.sign(
        'HMAC', key, new TextEncoder().encode(signingInput)
    ));
    let binary = '';
    for (const byte of signature) binary += String.fromCharCode(byte);
    return `${signingInput}.${btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')}`;
}

async function verifyJwtSignature(token: string, secret: string): Promise<boolean> {
    const [header, payload, signature] = token.split('.');
    if (!header || !payload || !signature) return false;
    const normalized = signature.replaceAll('-', '+').replaceAll('_', '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    const bytes = Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
    const key = await crypto.subtle.importKey(
        'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
    );
    return crypto.subtle.verify(
        'HMAC', key, bytes, new TextEncoder().encode(`${header}.${payload}`)
    );
}

function bytesFromBase64(value: string): Uint8Array {
    return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

const VALID_PNG = bytesFromBase64(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
);

function chronicleForm(
    activityId: string,
    username: string,
    filename: string,
    body: Uint8Array = VALID_PNG
): FormData {
    const form = new FormData();
    form.append('activityId', activityId);
    form.append('username', username);
    form.append('images', new File([Uint8Array.from(body).buffer], filename, { type: 'image/png' }));
    return form;
}

async function seedWorkerOp(id: number, username: string): Promise<string> {
    await bindings.CORE_DB.prepare(
        `INSERT INTO users (id, username, password, dept, producername)
         VALUES (?, ?, ?, 'op', ?)`
    ).bind(
        id,
        username,
        '$2b$04$1RWQGTyc2pruYfMggRdx7e2v3mef7H9H/hvipHXY9EF/S5VBPcYyK',
        `${username} Producer`
    ).run();
    const response = await workerApp.request('http://ims.test/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password: 'worker-password' })
    }, bindings);
    expect(response.status).toBe(200);
    return (await response.json<{ token: string }>()).token;
}

async function chronicleSnapshot(activityId: string): Promise<{
    metadata: unknown;
    items: Array<Record<string, unknown>>;
    objects: Array<Record<string, unknown>>;
    operations: Array<Record<string, unknown>>;
}> {
    const metadata = await bindings.CORE_DB.prepare(
        'SELECT document_json FROM chronicle_metadata WHERE activity_id=?'
    ).bind(activityId).first<string>('document_json');
    const items = await bindings.CORE_DB.prepare(
        `SELECT activity_id, filename, uploader, status, logical_key, idempotency_key
         FROM chronicle_items WHERE activity_id=? ORDER BY filename`
    ).bind(activityId).all<Record<string, unknown>>();
    const objects = await bindings.CORE_DB.prepare(
        `SELECT logical_key, state, byte_size, content_type, sha256
         FROM object_index ORDER BY logical_key`
    ).all<Record<string, unknown>>();
    const operations = await bindings.CORE_DB.prepare(
        `SELECT logical_key, state, target_state, object_id
         FROM upload_operations ORDER BY logical_key`
    ).all<Record<string, unknown>>();
    const belongsToActivity = (value: Record<string, unknown>) =>
        String(value.logical_key).includes(`/events/upload/${activityId}/`) ||
        String(value.logical_key).includes(`/events/used/${activityId}/`) ||
        String(value.logical_key).includes(`/events/.trash/`);
    return {
        metadata: metadata ? JSON.parse(metadata) as unknown : null,
        items: items.results,
        objects: objects.results.filter(belongsToActivity),
        operations: operations.results.filter(belongsToActivity)
    };
}

beforeEach(async () => {
    await reset();
});

describe('SEC-01 Worker security headers', () => {
    it('matches the Helmet baseline through the deployed Worker fetch boundary', async () => {
        await applyCoreMigrations();
        const context = createExecutionContext();
        const response = await worker.fetch(
            new Request('http://ims.test/api/wiki/test'),
            bindings,
            context
        );
        await waitOnExecutionContext(context);

        expect(response.status).toBe(200);
        expectHelmetCompatibleSecurityHeaders(response);
    });

    it('adds the complete header set to a Content-Length 413 response', async () => {
        await applyCoreMigrations();
        const context = createExecutionContext();
        const response = await worker.fetch(
            new Request('http://ims.test/api/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': '102401'
                },
                body: '{}'
            }),
            bindings,
            context
        );
        await waitOnExecutionContext(context);

        expect(response.status).toBe(413);
        expectHelmetCompatibleSecurityHeaders(response);
    });

    it('adds the complete header set to a D1 rate-limit 429 response', async () => {
        await applyCoreMigrations();
        const login = async (): Promise<Response> => {
            const context = createExecutionContext();
            const response = await worker.fetch(
                new Request('http://ims.test/api/login', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'CF-Connecting-IP': '203.0.113.201'
                    },
                    body: JSON.stringify({ username: 'missing', password: 'wrong' })
                }),
                bindings,
                context
            );
            await waitOnExecutionContext(context);
            return response;
        };

        for (let attempt = 0; attempt < 20; attempt += 1) {
            expect((await login()).status).toBe(401);
        }
        const rateLimited = await login();
        expect(rateLimited.status).toBe(429);
        expectHelmetCompatibleSecurityHeaders(rateLimited);
    });
});

describe('WRK-01 Worker binding isolation', () => {
    it('resolves a fresh binding set for every request', async () => {
        const requestBindings = (marker: string): WorkerBindings => ({
            CORE_DB: bindings.CORE_DB,
            STORY_DB: bindings.STORY_DB,
            MEDIA_BUCKET: bindings.MEDIA_BUCKET,
            IMAGES: bindings.IMAGES,
            IMS_JWT_SECRET: `worker-${marker}-secret-at-least-32-bytes`,
            ASSETS: {
                fetch: async () => new Response(marker)
            } as unknown as Fetcher
        });

        const first = await workerApp.request(
            'http://ims.test/binding-probe',
            undefined,
            requestBindings('first')
        );
        const second = await workerApp.request(
            'http://ims.test/binding-probe',
            undefined,
            requestBindings('second')
        );

        expect(await first.text()).toBe('first');
        expect(await second.text()).toBe('second');
    });

    it('provides local Assets and low-fidelity Images bindings without remote I/O', async () => {
        const asset = await bindings.ASSETS.fetch(
            new Request('http://ims.test/index.html')
        );
        expect(asset.status).toBe(200);
        expect(await asset.text()).toContain('<!DOCTYPE html>');
        expect(typeof bindings.IMAGES.info).toBe('function');
        expect(typeof bindings.IMAGES.input).toBe('function');
    });
});

describe('AUTH-01 and CORE-01 Worker smoke contracts', () => {
    it('logs in with HS256 and preserves naked, Bearer, and Cookie-CSRF auth modes', async () => {
        await applyCoreMigrations();
        // bcryptjs is also the Worker password adapter. This fixed digest is for
        // the literal password "worker-password" and has no production value.
        await bindings.CORE_DB.batch([
            bindings.CORE_DB.prepare(
                `INSERT INTO users (id, username, password, dept, producername)
                 VALUES (1, 'worker-op', ?, 'op', 'Worker Producer')`
            ).bind('$2b$04$1RWQGTyc2pruYfMggRdx7e2v3mef7H9H/hvipHXY9EF/S5VBPcYyK'),
            bindings.CORE_DB.prepare(
                `INSERT INTO cards (id, image1_url, image2_url, status)
                 VALUES (1, '/one.webp', '/two.webp', 'pending')`
            )
        ]);

        const login = await workerApp.request('http://ims.test/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: 'worker-op', password: 'worker-password' })
        }, bindings);
        expect(login.status).toBe(200);
        const loginBody = await login.json<{
            success: boolean;
            token: string;
            username: string;
            producername: string;
            dept: string;
        }>();
        expect(loginBody).toMatchObject({
            success: true,
            username: 'worker-op',
            producername: 'Worker Producer',
            dept: 'op'
        });
        const header = decodeJwtPart(loginBody.token, 0);
        const claims = decodeJwtPart(loginBody.token, 1);
        expect(header.alg).toBe('HS256');
        expect(claims).toMatchObject({ id: 1, username: 'worker-op', dept: 'op' });
        expect(typeof claims.csrfSecret).toBe('string');
        expect((claims.exp as number) - (claims.iat as number)).toBe(2 * 60 * 60);
        expect(login.headers.get('set-cookie')).toContain('token=');
        expect(login.headers.get('set-cookie')).toContain('csrf_token=');

        for (const authorization of [loginBody.token, `Bearer ${loginBody.token}`]) {
            const check = await workerApp.request('http://ims.test/api/check', {
                headers: { Authorization: authorization }
            }, bindings);
            expect(check.status).toBe(200);
            expect(await check.json()).toMatchObject({
                success: true,
                user: { id: 1, username: 'worker-op', dept: 'op' }
            });
        }

        const csrfSecret = claims.csrfSecret as string;
        const cookie = `token=${loginBody.token}; csrf_token=${csrfSecret}`;
        const wrongCsrf = await workerApp.request('http://ims.test/api/admin/cards/approve/1', {
            method: 'POST',
            headers: { Cookie: cookie, 'X-CSRFToken': 'wrong' }
        }, bindings);
        expect(wrongCsrf.status).toBe(403);
        expect(await wrongCsrf.json()).toEqual({ success: false, message: 'CSRF token invalid' });
        expect(await bindings.CORE_DB.prepare('SELECT status FROM cards WHERE id=1')
            .first<string>('status')).toBe('pending');

        const cookieWrite = await workerApp.request('http://ims.test/api/admin/cards/approve/1', {
            method: 'POST',
            headers: { Cookie: cookie, 'X-CSRFToken': csrfSecret }
        }, bindings);
        expect(cookieWrite.status).toBe(200);
        expect(await cookieWrite.json()).toEqual({ success: true });
        expect(await bindings.CORE_DB.prepare('SELECT status FROM cards WHERE id=1')
            .first<string>('status')).toBe('approved');

        await bindings.CORE_DB.prepare(
            `INSERT INTO cards (id, image1_url, image2_url, status)
             VALUES (2, '/three.webp', '/four.webp', 'pending')`
        ).run();
        const authorizationWrite = await workerApp.request(
            'http://ims.test/api/admin/cards/approve/2',
            {
                method: 'POST',
                headers: {
                    Authorization: loginBody.token,
                    Cookie: 'unrelated=value'
                }
            },
            bindings
        );
        expect(authorizationWrite.status).toBe(200);
        expect(await bindings.CORE_DB.prepare('SELECT status FROM cards WHERE id=2')
            .first<string>('status')).toBe('approved');
    });

    it('keeps /api/emojis and /api/reactions mutation bodies distinct', async () => {
        await applyCoreMigrations();
        await bindings.CORE_DB.prepare(
            `INSERT INTO cards (id, image1_url, image2_url, status)
             VALUES (7, '/one.webp', '/two.webp', 'approved')`
        ).run();
        const request = (path: string) => workerApp.request(`http://ims.test${path}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'CF-Connecting-IP': '203.0.113.7'
            },
            body: JSON.stringify({ id: 7, emoji: '👍' })
        }, bindings);

        const emojis = await request('/api/emojis');
        expect(emojis.status).toBe(200);
        expect(await emojis.json()).toEqual({ success: true });
        const reactions = await request('/api/reactions');
        expect(reactions.status).toBe(200);
        expect(await reactions.json()).toEqual({ ok: true });

        const read = await workerApp.request('http://ims.test/api/reactions?id=7', undefined, bindings);
        expect(read.status).toBe(200);
        expect(await read.json()).toEqual({ '👍': 2 });
    });
});

describe('adapter-neutral contracts on Worker D1/R2', () => {
    it('[AUTH-01 CORE-01] runs the shared auth contract against Worker bindings', async () => {
        await applyCoreMigrations();
        await bindings.CORE_DB.batch([
            bindings.CORE_DB.prepare(
                `INSERT INTO users (id, username, password, dept, producername)
                 VALUES (11, 'contract-op', ?, 'op', 'Contract Producer')`
            ).bind('$2b$04$1RWQGTyc2pruYfMggRdx7e2v3mef7H9H/hvipHXY9EF/S5VBPcYyK'),
            bindings.CORE_DB.prepare(
                `INSERT INTO cards (id, image1_url, image2_url, status)
                 VALUES (11, '/contract-front.webp', '/contract-back.webp', 'pending')`
            )
        ]);
        const request = (path: string, init?: RequestInit) =>
            Promise.resolve(workerApp.request(`http://ims.test${path}`, init, bindings));

        await assertCoreAuthContract({
            runtime: 'Worker',
            expectedUser: { id: 11, username: 'contract-op', dept: 'op' },
            request,
            cookieMutationPath: '/api/admin/cards/approve/11',
            secureCookies: true,
            async login() {
                const response = await request('/api/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username: 'contract-op', password: 'worker-password' })
                });
                const body = await response.json<{ token: string }>();
                const cookies = responseCookies(response);
                const token = cookiePair(cookies, 'token');
                const csrf = cookiePair(cookies, 'csrf_token');
                return {
                    response,
                    token: body.token,
                    cookie: `${token}; ${csrf}`,
                    csrf: decodeURIComponent(csrf.slice('csrf_token='.length))
                };
            },
            async assertMutationState(state) {
                expect(await bindings.CORE_DB.prepare('SELECT status FROM cards WHERE id=11')
                    .first<string>('status')).toBe(state === 'before' ? 'pending' : 'approved');
            },
            async resetMutation() {
                await bindings.CORE_DB.prepare("UPDATE cards SET status='pending' WHERE id=11").run();
            },
            setCookies: responseCookies
        });
    });

    it('[CONTENT-01] manages information HTML through Worker D1/R2 services', async () => {
        await applyCoreMigrations();
        const token = await seedWorkerOp(12, 'information-contract-op');
        const storage = new R2ObjectStorage(bindings.CORE_DB, bindings.MEDIA_BUCKET);
        const assetUrl = '/uploads/information/original/worker-contract.webp';
        await storage.put(assetUrl.slice(1), VALID_PNG, { contentType: 'image/webp' });
        await storage.put(
            'uploads/information/index.json',
            serializeInformationIndex({ version: 1, cards: [], assets: [assetUrl] }),
            { contentType: 'application/json; charset=utf-8' }
        );
        const request = (path: string, init?: RequestInit) => Promise.resolve(
            workerApp.request(`http://ims.test${path}`, init, bindings)
        );
        const created = await request('/api/admin/information', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                title: 'Worker HTML contract',
                category: 'fan',
                contentType: 'html',
                externalUrl: '',
                html: `<h2>Worker hosted HTML</h2><img src="${assetUrl}">`,
                image: assetUrl
            })
        });
        expect(created.status).toBe(200);
        const card = (await created.json<{ card: { id: string } }>()).card;

        const listed = await request('/api/information');
        expect(listed.status).toBe(200);
        const publicCard = (await listed.json<{ cards: Array<Record<string, unknown>> }>())
            .cards.find((candidate) => candidate.id === card.id);
        expect(publicCard).toMatchObject({
            title: 'Worker HTML contract',
            contentType: 'html',
            link: `/information/${card.id}`
        });
        expect(publicCard).not.toHaveProperty('html');

        const detail = await request(`/api/information/${card.id}`);
        expect(detail.status).toBe(200);
        expect(await detail.json()).toMatchObject({
            card: { html: expect.stringContaining('Worker hosted HTML') }
        });

        const removed = await request(`/api/admin/information/${card.id}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` }
        });
        expect(removed.status).toBe(200);
        expect((await request(`/api/information/${card.id}`)).status).toBe(404);
    });

    it('[AUTH-01] verifies external WebCrypto JWTs and rejects invalid token classes', async () => {
        await applyCoreMigrations();
        const secret = bindings.IMS_JWT_SECRET;
        const now = Math.floor(Date.now() / 1000);
        const claims = {
            id: 21,
            username: 'node-minted-op',
            producername: 'Node Minted',
            dept: 'op',
            csrfSecret: 'node-minted-csrf',
            iat: now,
            exp: now + 600
        };
        const externallyMinted = await signJwt({ alg: 'HS256', typ: 'JWT' }, claims, secret);
        const accepted = await workerApp.request('http://ims.test/api/check', {
            headers: { Authorization: externallyMinted }
        }, bindings);
        expect(accepted.status).toBe(200);
        expect(await accepted.json()).toMatchObject({
            success: true,
            user: { username: 'node-minted-op' }
        });

        await bindings.CORE_DB.prepare(
            `INSERT INTO users (id, username, password, dept, producername)
             VALUES (22, 'worker-token-op', ?, 'op', 'Worker Token')`
        ).bind('$2b$04$1RWQGTyc2pruYfMggRdx7e2v3mef7H9H/hvipHXY9EF/S5VBPcYyK').run();
        const login = await workerApp.request('http://ims.test/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: 'worker-token-op', password: 'worker-password' })
        }, bindings);
        const workerToken = (await login.json<{ token: string }>()).token;
        expect(await verifyJwtSignature(workerToken, secret)).toBe(true);

        await assertRejectedJwtContract({
            runtime: 'Worker',
            request: (path, init) => Promise.resolve(
                workerApp.request(`http://ims.test${path}`, init, bindings)
            ),
            tokens: {
                'non-HS256': await signJwt(
                    { alg: 'HS512', typ: 'JWT' }, claims, secret, 'SHA-512'
                ),
                expired: await signJwt(
                    { alg: 'HS256', typ: 'JWT' }, { ...claims, iat: now - 120, exp: now - 60 }, secret
                ),
                'missing-claim': await signJwt(
                    { alg: 'HS256', typ: 'JWT' }, { ...claims, csrfSecret: undefined }, secret
                ),
                'wrong-secret': await signJwt(
                    { alg: 'HS256', typ: 'JWT' }, claims, 'wrong-secret-that-is-at-least-32-bytes'
                )
            }
        });
    });

    it('[AUTH-01] rejects a short Worker JWT secret before serving a request', () => {
        expect(() => createCloudflareServices({
            ...bindings,
            IMS_JWT_SECRET: 'too-short'
        })).toThrow(/at least 32 UTF-8 bytes/);
    });

    it('[CORE-01] runs the shared reaction contract against D1', async () => {
        await applyCoreMigrations();
        await bindings.CORE_DB.prepare(
            `INSERT INTO cards (id, image1_url, image2_url, status)
             VALUES (31, '/reaction-front.webp', '/reaction-back.webp', 'approved')`
        ).run();
        await assertReactionContract({
            runtime: 'Worker',
            cardId: 31,
            headers: { 'CF-Connecting-IP': '203.0.113.31' },
            request: (path, init) => Promise.resolve(
                workerApp.request(`http://ims.test${path}`, init, bindings)
            )
        });
    });

    it('[MEDIA-01] runs the shared GET/HEAD and range matrix against R2 media', async () => {
        await applyCoreMigrations();
        const storage = new R2ObjectStorage(bindings.CORE_DB, bindings.MEDIA_BUCKET);
        const body = new TextEncoder().encode('0123456789-contract-range');
        const logicalKey = 'uploads/namecard/original/contract-range.png';
        const stored = await storage.put(logicalKey, body, { contentType: 'image/png' });
        await bindings.CORE_DB.prepare(
            `INSERT INTO cards (id, image1_url, image2_url, status)
             VALUES (41, '/uploads/namecard/original/contract-range.png', '/other.png', 'approved')`
        ).run();
        await assertMediaRangeContract({
            runtime: 'Worker',
            path: '/uploads/namecard/original/contract-range.png',
            body,
            contentType: 'image/png',
            etag: stored.etag,
            request: (path, init) => Promise.resolve(
                workerApp.request(`http://ims.test${path}`, init, bindings)
            )
        });
    });

    it('[MEDIA-01] runs the shared multipart contract against the Worker parser', async () => {
        const parser = new StandardUploadParser();
        await assertMultipartParserContract({
            runtime: 'Worker',
            parse: (request, options) => parser.parse(request, options),
            request(body, contentType) {
                return new Request('http://ims.test/upload', {
                    method: 'POST',
                    headers: { 'Content-Type': contentType },
                    body: Uint8Array.from(body).buffer
                });
            }
        });
    });
});

describe('CHR-01 and STATE-01 Worker Chronicle contracts', () => {
    it('replays upload, approve, reject, and delete without changing D1/R2 state', async () => {
        await applyCoreMigrations();
        const token = await seedWorkerOp(51, 'chronicle-contract-op');
        const activityId = 'worker-idempotency';
        const request = (path: string, init?: RequestInit) => Promise.resolve(
            workerApp.request(`http://ims.test${path}`, init, bindings)
        );
        const upload = (key: string, username = 'Contract Uploader', filename = 'pending.png') =>
            request('/eventchronicle/upload', {
                method: 'POST',
                headers: { 'Idempotency-Key': key, 'CF-Connecting-IP': '203.0.113.51' },
                body: chronicleForm(activityId, username, filename)
            });

        await assertIdempotentReplayContract({
            runtime: 'Worker',
            operation: 'Chronicle upload',
            body: { success: true, count: 1 },
            invoke: () => upload('upload-replay-key'),
            snapshot: () => chronicleSnapshot(activityId)
        });
        const beforeConflict = await chronicleSnapshot(activityId);
        expect(beforeConflict.objects.map((object) => object.state)).toEqual(['pending']);
        expect(beforeConflict.operations.map((operation) => operation.state)).toEqual(['pending']);
        await assertJsonResponse(
            await upload('upload-replay-key', 'Different Uploader'),
            409,
            { error: '幂等键与请求不匹配' },
            'Worker Chronicle upload idempotency conflict'
        );
        expect(await chronicleSnapshot(activityId)).toEqual(beforeConflict);

        const firstRecord = (beforeConflict.metadata as { records: Array<{ filename: string }> }).records[0]!;
        const adminHeaders = (key: string) => ({
            Authorization: token,
            'Idempotency-Key': key
        });
        await assertIdempotentReplayContract({
            runtime: 'Worker',
            operation: 'Chronicle approve',
            body: { success: true },
            invoke: () => request(
                `/eventchronicle/admin/approve/${activityId}/${encodeURIComponent(firstRecord.filename)}`,
                { method: 'POST', headers: adminHeaders('approve-replay-key') }
            ),
            snapshot: () => chronicleSnapshot(activityId)
        });
        const afterApprove = await chronicleSnapshot(activityId);
        expect(afterApprove.objects.find((object) =>
            String(object.logical_key).includes(`/used/${activityId}/`))?.state).toBe('ready');
        expect(afterApprove.operations.find((operation) =>
            String(operation.logical_key).includes(`/used/${activityId}/`))?.state).toBe('ready');

        await assertIdempotentReplayContract({
            runtime: 'Worker',
            operation: 'second Chronicle upload',
            body: { success: true, count: 1 },
            invoke: () => upload('reject-upload-key', 'Reject Uploader', 'reject.png'),
            snapshot: () => chronicleSnapshot(activityId)
        });
        const beforeReject = await chronicleSnapshot(activityId);
        expect(beforeReject.objects.some((object) => object.state === 'pending')).toBe(true);
        expect(beforeReject.operations.some((operation) => operation.state === 'pending')).toBe(true);
        const rejectRecord = (beforeReject.metadata as { records: Array<{ filename: string; status: string }> })
            .records.find((record) => record.status === 'pending');
        if (!rejectRecord) throw new Error('pending reject fixture record is missing');
        await assertIdempotentReplayContract({
            runtime: 'Worker',
            operation: 'Chronicle reject',
            body: { success: true },
            invoke: () => request(
                `/eventchronicle/admin/reject/${activityId}/${encodeURIComponent(rejectRecord.filename)}`,
                { method: 'POST', headers: adminHeaders('reject-replay-key') }
            ),
            snapshot: () => chronicleSnapshot(activityId)
        });
        const afterReject = await chronicleSnapshot(activityId);
        expect(afterReject.objects.some((object) => object.state === 'deleted')).toBe(true);
        expect(afterReject.operations.some((operation) => operation.state === 'deleted')).toBe(true);

        await assertIdempotentReplayContract({
            runtime: 'Worker',
            operation: 'Chronicle delete',
            body: { success: true },
            invoke: () => request(
                `/eventchronicle/admin/delete-used/${activityId}/${encodeURIComponent(firstRecord.filename)}`,
                { method: 'DELETE', headers: adminHeaders('delete-replay-key') }
            ),
            snapshot: () => chronicleSnapshot(activityId)
        });
        const finalState = await chronicleSnapshot(activityId);
        expect((finalState.metadata as { records: unknown[] }).records).toEqual([]);
        expect(finalState.items).toEqual([]);
        expect(finalState.objects.every((object) => object.state === 'deleted')).toBe(true);
        expect(finalState.operations.every((operation) => operation.state === 'deleted')).toBe(true);
    });

    it('preserves both distinct uploads when requests read the same activity version concurrently', async () => {
        await applyCoreMigrations();
        const runtime = createCloudflareServices(bindings);
        const delegate = runtime.storage!;
        const activityId = 'worker-concurrent';
        const metadataKey = `assets/images/eventchronicle/events/meta/${activityId}.json`;
        let reads = 0;
        let release!: () => void;
        const bothRead = new Promise<void>((resolve) => { release = resolve; });
        runtime.storage = new Proxy(delegate, {
            get(target, property, receiver) {
                if (property === 'get') {
                    return async (key: string) => {
                        const value = await target.get(key);
                        if (key === metadataKey) {
                            reads += 1;
                            if (reads === 2) release();
                            await bothRead;
                        }
                        return value;
                    };
                }
                const value = Reflect.get(target, property, receiver) as unknown;
                return typeof value === 'function' ? value.bind(target) : value;
            }
        });
        const app = createHonoApp(() => runtime);
        const upload = (key: string, filename: string, username: string) => app.request(
            'http://ims.test/eventchronicle/upload',
            {
                method: 'POST',
                headers: { 'Idempotency-Key': key, 'CF-Connecting-IP': `203.0.113.${key.endsWith('a') ? 61 : 62}` },
                body: chronicleForm(activityId, username, filename)
            }
        );
        const responses = await Promise.all([
            upload('concurrent-a', 'first.png', 'First'),
            upload('concurrent-b', 'second.png', 'Second')
        ]);
        expect(responses.map((response) => response.status)).toEqual([200, 200]);
        const state = await chronicleSnapshot(activityId);
        const records = (state.metadata as { records: Array<{ idempotencyKey: string }> }).records;
        expect(records.map((record) => record.idempotencyKey).sort()).toEqual([
            'concurrent-a',
            'concurrent-b'
        ]);
        expect(state.items).toHaveLength(2);
        expect(state.objects.filter((object) => object.state === 'pending')).toHaveLength(2);
    });

    it('lets the takeover generation converge when the stale approve wins the object move CAS', async () => {
        await applyCoreMigrations();
        const token = await seedWorkerOp(64, 'chronicle-stale-first-op');
        const runtime = createCloudflareServices(bindings);
        const activityId = 'worker-stale-first-approve';
        const filename = 'approve.png';
        const source = `assets/images/eventchronicle/events/upload/${activityId}/${filename}`;
        const destination = `assets/images/eventchronicle/events/used/${activityId}/${filename}`;
        let moveReads = 0;
        let firstEntered!: () => void;
        let secondEntered!: () => void;
        let releaseFirst!: () => void;
        let releaseSecond!: () => void;
        const firstRead = new Promise<void>((resolve) => { firstEntered = resolve; });
        const secondRead = new Promise<void>((resolve) => { secondEntered = resolve; });
        const firstReleased = new Promise<void>((resolve) => { releaseFirst = resolve; });
        const secondReleased = new Promise<void>((resolve) => { releaseSecond = resolve; });
        runtime.storage = new R2ObjectStorage(
            bindings.CORE_DB,
            bindings.MEDIA_BUCKET,
            runtime.compensation,
            {
                onMutationPhase: async (phase, context) => {
                    if (phase !== 'move-read' || context.logicalKey !== source) return;
                    moveReads += 1;
                    if (moveReads === 1) {
                        firstEntered();
                        await firstReleased;
                    } else if (moveReads === 2) {
                        secondEntered();
                        await secondReleased;
                    }
                }
            }
        );
        await runtime.storage.put(source, new TextEncoder().encode('approve once'), {
            contentType: 'image/png'
        });
        await runtime.storage.put(
            `assets/images/eventchronicle/events/meta/${activityId}.json`,
            new TextEncoder().encode(JSON.stringify({
                records: [{ filename, status: 'pending', idempotencyKey: 'stale-first-upload' }]
            })),
            { contentType: 'application/json' }
        );
        const app = createHonoApp(() => runtime);
        const idempotencyKey = 'stale-first-approve-key';
        const invoke = () => app.request(
            `http://ims.test/eventchronicle/admin/approve/${activityId}/${filename}`,
            { method: 'POST', headers: { Authorization: token, 'Idempotency-Key': idempotencyKey } }
        );

        const stale = invoke();
        await firstRead;
        await bindings.CORE_DB.prepare(
            `UPDATE idempotency_keys SET state='failed', updated_at=CURRENT_TIMESTAMP
             WHERE scope='chronicle:approve' AND idempotency_key=? AND generation=1`
        ).bind(idempotencyKey).run();
        const replacement = invoke();
        await secondRead;
        releaseFirst();
        expect((await stale).status).not.toBe(200);
        releaseSecond();

        const converged = await replacement;
        expect(converged.status).toBe(200);
        expect(await converged.json()).toEqual({ success: true });
        expect(await runtime.storage.exists(source)).toBe(false);
        expect(await runtime.storage.exists(destination)).toBe(true);
        const state = await chronicleSnapshot(activityId);
        expect((state.metadata as { records: Array<{ status: string }> }).records[0]?.status).toBe(
            'approved'
        );
        expect(state.objects).toEqual([
            expect.objectContaining({ logical_key: destination, state: 'ready' })
        ]);
        expect(state.operations).toEqual([
            expect.objectContaining({ logical_key: source, object_id: null, state: 'deleted' }),
            expect.objectContaining({ logical_key: destination, state: 'ready' })
        ]);
    });

    it('recovers the same upload key after metadata commit failure without leaking a ready object', async () => {
        await applyCoreMigrations();
        const runtime = createCloudflareServices(bindings);
        const delegate = runtime.storage!;
        const activityId = 'worker-upload-recovery';
        const metadataKey = `assets/images/eventchronicle/events/meta/${activityId}.json`;
        let remainingConflicts = 12;
        runtime.storage = new Proxy(delegate, {
            get(target, property, receiver) {
                if (property === 'putIfUnchanged') {
                    return async (
                        key: string,
                        expectedEtag: string | null,
                        body: Uint8Array,
                        options?: Parameters<ObjectStorage['put']>[2]
                    ) => {
                        if (key === metadataKey && remainingConflicts > 0) {
                            remainingConflicts -= 1;
                            return null;
                        }
                        return target.putIfUnchanged!(key, expectedEtag, body, options);
                    };
                }
                const value = Reflect.get(target, property, receiver) as unknown;
                return typeof value === 'function' ? value.bind(target) : value;
            }
        });
        const app = createHonoApp(() => runtime);
        const invoke = () => Promise.resolve(app.request('http://ims.test/eventchronicle/upload', {
            method: 'POST',
            headers: { 'Idempotency-Key': 'recover-upload', 'CF-Connecting-IP': '203.0.113.63' },
            body: chronicleForm(activityId, 'Recovery', 'recover.png')
        }));
        const failed = await invoke();
        expect(failed.status).toBe(409);
        expect(await bindings.CORE_DB.prepare(
            "SELECT state FROM idempotency_keys WHERE scope='chronicle:upload' AND idempotency_key='recover-upload'"
        ).first<string>('state')).toBe('failed');
        expect((await chronicleSnapshot(activityId)).objects.some((object) => object.state === 'ready')).toBe(false);

        const recovered = await invoke();
        expect(recovered.status).toBe(200);
        expect(await recovered.json()).toEqual({ success: true, count: 1 });
        const state = await chronicleSnapshot(activityId);
        expect((state.metadata as { records: unknown[] }).records).toHaveLength(1);
        expect(state.items).toHaveLength(1);
        expect(state.objects.filter((object) => object.state === 'pending')).toHaveLength(1);
    });

    it('retries failed D1 compensation jobs until exactly one successful cleanup', async () => {
        await applyCoreMigrations();
        const compensation = new D1CompensationService(bindings.CORE_DB, bindings.MEDIA_BUCKET);
        let shouldFail = true;
        const remove = vi.fn(async () => {
            if (shouldFail) throw new Error('injected delete failure');
        });
        const storage = { delete: remove } as unknown as ObjectStorage;
        const id = await compensation.enqueue('delete-object', { key: 'fixture/object' });

        await compensation.run(storage);
        expect(await bindings.CORE_DB.prepare(
            'SELECT state FROM compensation_jobs WHERE id=?'
        ).bind(id).first<string>('state')).toBe('failed');
        expect(await bindings.CORE_DB.prepare(
            'SELECT attempts FROM compensation_jobs WHERE id=?'
        ).bind(id).first<number>('attempts')).toBe(1);

        shouldFail = false;
        await compensation.run(storage);
        await compensation.run(storage);
        expect(await bindings.CORE_DB.prepare(
            'SELECT state FROM compensation_jobs WHERE id=?'
        ).bind(id).first<string>('state')).toBe('completed');
        expect(await bindings.CORE_DB.prepare(
            'SELECT attempts FROM compensation_jobs WHERE id=?'
        ).bind(id).first<number>('attempts')).toBe(2);
        expect(remove).toHaveBeenCalledTimes(2);
    });
});

describe('D1-01 versioned migrations', () => {
    it('applies both empty-database migration sets exactly once', async () => {
        expect(await tableNames(bindings.CORE_DB)).not.toContain('users');
        expect(await tableNames(bindings.STORY_DB)).not.toContain('story_legacy_rows');

        await applyCoreMigrations();
        await applyStoryMigrations();
        await applyCoreMigrations();
        await applyStoryMigrations();

        expect(await tableNames(bindings.CORE_DB)).toEqual(expect.arrayContaining([
            'users',
            'cards',
            'object_index',
            'upload_operations',
            'chronicle_items',
            'compensation_jobs'
        ]));
        expect(await tableNames(bindings.STORY_DB)).toEqual(expect.arrayContaining([
            'story_legacy_rows',
            'story_cards',
            'story_links',
            'story_import_runs'
        ]));
        expect(await bindings.CORE_DB.prepare(
            'SELECT COUNT(*) AS count FROM d1_migrations'
        ).first<number>('count')).toBe(bindings.TEST_CORE_MIGRATIONS.length);
        expect(await bindings.STORY_DB.prepare(
            'SELECT COUNT(*) AS count FROM d1_migrations'
        ).first<number>('count')).toBe(bindings.TEST_STORY_MIGRATIONS.length);
    });

    it('does not create schema during the first application request', async () => {
        const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const context = createExecutionContext();
        try {
            const response = await worker.fetch(
                new Request('http://ims.test/api/news'),
                bindings,
                context
            );
            await waitOnExecutionContext(context);
            expect(response.status).toBe(500);
        } finally {
            errorLog.mockRestore();
        }

        expect(await bindings.CORE_DB.prepare(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='news'"
        ).first()).toBeNull();
    });

    it('keeps repeated Story imports and source identities unique', async () => {
        await applyStoryMigrations();
        await bindings.STORY_DB.batch([
            bindings.STORY_DB.prepare(
                'INSERT INTO agencies (id, code, name_cn, color) VALUES (1, ?, ?, ?)'
            ).bind('sc', '闪耀色彩', '#fff'),
            bindings.STORY_DB.prepare(
                `INSERT INTO idols (id, agency_id, name_cn, folder_name, color)
                 VALUES (1, 1, ?, ?, ?)`
            ).bind('测试偶像', 'fixture', '#000')
        ]);

        const importFixture = async (title: string): Promise<void> => {
            await bindings.STORY_DB.batch([
                bindings.STORY_DB.prepare(
                    `INSERT INTO story_legacy_rows
                        (legacy_table, legacy_id, row_json, normalized_hash)
                     VALUES ('sc_stories', 7, ?, ?)
                     ON CONFLICT(legacy_table, legacy_id) DO UPDATE SET
                        row_json=excluded.row_json,
                        normalized_hash=excluded.normalized_hash`
                ).bind(JSON.stringify({ id: 7, title }), await sha256(new TextEncoder().encode(title))),
                bindings.STORY_DB.prepare(
                    `INSERT INTO story_cards
                        (idol_id, category, card_name, subtitle, image_file, source_table, source_id)
                     VALUES (1, 'fixture', ?, '', NULL, 'sc_stories', 7)
                     ON CONFLICT(source_table, source_id) DO UPDATE SET
                        card_name=excluded.card_name`
                ).bind(title),
                bindings.STORY_DB.prepare(
                    `INSERT INTO story_links
                        (card_id, up_name, video_title, url, source_table, source_id, source_link_index)
                     SELECT id, '', ?, '', 'sc_stories', 7, 0
                     FROM story_cards WHERE source_table='sc_stories' AND source_id=7
                     ON CONFLICT(source_table, source_id, source_link_index) DO UPDATE SET
                        card_id=excluded.card_id,
                        video_title=excluded.video_title`
                ).bind(title)
            ]);
        };

        await importFixture('first');
        await importFixture('second');

        for (const table of ['story_legacy_rows', 'story_cards', 'story_links']) {
            expect(await bindings.STORY_DB.prepare(
                `SELECT COUNT(*) AS count FROM ${table}`
            ).first<number>('count')).toBe(1);
        }
        expect(await bindings.STORY_DB.prepare(
            'SELECT card_name FROM story_cards WHERE source_table=? AND source_id=?'
        ).bind('sc_stories', 7).first<string>('card_name')).toBe('second');
        await expect(bindings.STORY_DB.prepare(
            `INSERT INTO story_cards
                (idol_id, category, card_name, source_table, source_id)
             VALUES (1, 'duplicate', 'duplicate', 'sc_stories', 7)`
        ).run()).rejects.toThrow();
    });
});

describe('R2-01 and STATE-01 object state', () => {
    it('persists verified objects and publishes only their ready state', async () => {
        await applyCoreMigrations();
        const storage = new R2ObjectStorage(bindings.CORE_DB, bindings.MEDIA_BUCKET);
        const body = new TextEncoder().encode('verified-object');
        const logicalKey = 'unity/runninggame/Build/fixture.data';

        await storage.put(logicalKey, body, {
            contentType: 'application/octet-stream',
            sha256: await sha256(body)
        });

        expect(await storage.get(logicalKey)).toMatchObject({
            size: body.byteLength,
            contentType: 'application/octet-stream'
        });
        expect(await bindings.CORE_DB.prepare(
            'SELECT state FROM object_index WHERE logical_key=?'
        ).bind(logicalKey).first<string>('state')).toBe('ready');
        expect(await bindings.CORE_DB.prepare(
            'SELECT state FROM upload_operations WHERE logical_key=?'
        ).bind(logicalKey).first<string>('state')).toBe('ready');

        await storage.delete(logicalKey);
        expect(await storage.get(logicalKey)).toBeNull();
        expect(await bindings.CORE_DB.prepare(
            'SELECT state FROM object_index WHERE logical_key=?'
        ).bind(logicalKey).first<string>('state')).toBe('deleted');
    });

    it('allows legal and duplicate transitions and rejects illegal transitions', async () => {
        await applyCoreMigrations();
        await bindings.CORE_DB.prepare(
            `INSERT INTO upload_operations
                (id, scope, idempotency_key, state, logical_key)
             VALUES ('operation', 'fixture', 'fixture-key', 'uploading', 'fixture/object')`
        ).run();
        const machine = new D1UploadStateMachine(bindings.CORE_DB);

        await expect(machine.transition('operation', 'pending')).resolves.toBe('pending');
        await expect(machine.transition('operation', 'pending')).resolves.toBe('pending');
        await expect(machine.transition('operation', 'ready')).resolves.toBe('ready');
        await expect(machine.transition('operation', 'pending')).rejects.toThrow(
            'Illegal upload transition: ready -> pending'
        );
        await expect(machine.transition('operation', 'deleted')).resolves.toBe('deleted');
        await expect(machine.transition('operation', 'deleted')).resolves.toBe('deleted');

        const compensationId = await machine.enqueueCompensation('fixture-cleanup', { id: 1 });
        await machine.completeCompensation(compensationId);
        await machine.completeCompensation(compensationId);
        expect(await bindings.CORE_DB.prepare(
            'SELECT state FROM compensation_jobs WHERE id=?'
        ).bind(compensationId).first<string>('state')).toBe('completed');
        expect(await bindings.CORE_DB.prepare(
            'SELECT attempts FROM compensation_jobs WHERE id=?'
        ).bind(compensationId).first<number>('attempts')).toBe(1);
    });

    it('never exposes R2 objects whose D1 state is intermediate or deleted', async () => {
        await applyCoreMigrations();
        const body = new TextEncoder().encode('private-until-ready');
        const digest = await sha256(body);

        for (const state of ['uploading', 'pending', 'ready', 'deleted'] as const) {
            const objectId = `object-${state}`;
            const logicalKey = `state/${state}`;
            const object = await bindings.MEDIA_BUCKET.put(`objects/${objectId}`, body);
            if (!object) throw new Error('R2 fixture object was not created');
            await bindings.CORE_DB.prepare(
                `INSERT INTO object_index
                    (logical_key, object_id, state, byte_size, content_type, sha256, etag)
                 VALUES (?, ?, ?, ?, 'text/plain', ?, ?)`
            ).bind(logicalKey, objectId, state, body.byteLength, digest, object.httpEtag).run();

            const response = await fetchFinalR2Object(
                bindings.CORE_DB,
                bindings.MEDIA_BUCKET,
                logicalKey,
                new Request(`http://ims.test/${logicalKey}`)
            );
            if (state === 'ready') {
                expect(response?.status).toBe(200);
                expect(await response?.text()).toBe('private-until-ready');
            } else {
                expect(response).toBeNull();
            }
        }
    });

    it('keeps GET and HEAD full, valid Range, and invalid Range contracts identical', async () => {
        await applyCoreMigrations();
        const storage = new R2ObjectStorage(bindings.CORE_DB, bindings.MEDIA_BUCKET);
        const body = new TextEncoder().encode('0123456789abcdef');
        const key = 'unity/runninggame/Build/range-fixture.data';
        await storage.put(key, body, { contentType: 'application/octet-stream' });

        for (const method of ['GET', 'HEAD'] as const) {
            const full = await fetchFinalR2Object(
                bindings.CORE_DB, bindings.MEDIA_BUCKET, key,
                new Request(`http://ims.test/${key}`, { method })
            );
            expect(full?.status).toBe(200);
            expect(full?.headers.get('content-length')).toBe('16');
            expect(full?.headers.get('content-type')).toBe('application/octet-stream');
            expect(full?.headers.get('etag')).toBeTruthy();
            if (method === 'HEAD') expect(await full?.text()).toBe('');

            const ranged = await fetchFinalR2Object(
                bindings.CORE_DB, bindings.MEDIA_BUCKET, key,
                new Request(`http://ims.test/${key}`, {
                    method,
                    headers: { Range: 'bytes=3-6' }
                })
            );
            expect(ranged?.status).toBe(206);
            expect(ranged?.headers.get('content-length')).toBe('4');
            expect(ranged?.headers.get('content-range')).toBe('bytes 3-6/16');
            expect(ranged?.headers.get('content-type')).toBe('application/octet-stream');
            expect(ranged?.headers.get('etag')).toBeTruthy();
            if (method === 'GET') expect(await ranged?.text()).toBe('3456');
            else expect(await ranged?.text()).toBe('');

            const invalid = await fetchFinalR2Object(
                bindings.CORE_DB, bindings.MEDIA_BUCKET, key,
                new Request(`http://ims.test/${key}`, {
                    method,
                    headers: { Range: 'bytes=99-100' }
                })
            );
            expect(invalid?.status).toBe(416);
            expect(invalid?.headers.get('content-range')).toBe('bytes */16');
            expect(invalid?.headers.get('content-type')).toBe('application/octet-stream');
            expect(invalid?.headers.get('etag')).toBeTruthy();
        }
    });

    it('serves Worker news and event R2 uploads through legacy GET/HEAD URLs', async () => {
        await applyCoreMigrations();
        const storage = new R2ObjectStorage(bindings.CORE_DB, bindings.MEDIA_BUCKET);
        const fixtures = [
            ['uploads/news/original/news.jpg', 'image/jpeg'],
            ['uploads/news/thumb/news_thumb.jpg', 'image/png'],
            ['uploads/event/original/event.png', 'image/png']
        ] as const;
        for (const [key, contentType] of fixtures) {
            await storage.put(key, new TextEncoder().encode('fixture-media'), { contentType });
            const get = await workerApp.request(`http://ims.test/${key}`, undefined, bindings);
            expect(get.status).toBe(200);
            expect(get.headers.get('content-type')).toBe(contentType);
            expect(get.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
            expect(await get.text()).toBe('fixture-media');

            const head = await workerApp.request(`http://ims.test/${key}`, {
                method: 'HEAD', headers: { Range: 'bytes=0-2' }
            }, bindings);
            expect(head.status).toBe(206);
            expect(head.headers.get('content-range')).toBe('bytes 0-2/13');
            expect(head.headers.get('content-length')).toBe('3');
            expect(head.headers.get('content-type')).toBe(contentType);
        }
    });
});

describe('IDEMP-01 and COMP-01 durable operation recovery', () => {
    it('replays completed D1 claims, conflicts on fingerprints, and recovers failed work', async () => {
        await applyCoreMigrations();
        const store = new D1IdempotencyStore(bindings.CORE_DB);
        const first = await store.claim('chronicle:upload', 'key', 'fingerprint');
        expect(first).toEqual({ kind: 'acquired', recovered: false, generation: 1 });
        if (first.kind !== 'acquired') return;
        await store.complete('chronicle:upload', 'key', 'fingerprint', first.generation, {
            status: 200, body: { success: true, count: 2 }
        });
        expect(await store.claim('chronicle:upload', 'key', 'fingerprint')).toEqual({
            kind: 'replay', response: { status: 200, body: { success: true, count: 2 } }
        });
        expect(await store.claim('chronicle:upload', 'key', 'different')).toEqual({ kind: 'conflict' });
        const retry = await store.claim('chronicle:approve', 'retry', 'same');
        expect(retry).toEqual({ kind: 'acquired', recovered: false, generation: 1 });
        if (retry.kind !== 'acquired') return;
        await store.fail('chronicle:approve', 'retry', 'same', retry.generation);
        expect(await store.claim('chronicle:approve', 'retry', 'same')).toEqual({
            kind: 'acquired', recovered: true, generation: 2
        });
    });

    it('claims, audits, and retries D1 compensation jobs idempotently', async () => {
        await applyCoreMigrations();
        let attempts = 0;
        const storage = {
            async delete() {
                attempts += 1;
                if (attempts === 1) throw new Error('temporary failure');
            }
        } as unknown as ObjectStorage;
        const service = new D1CompensationService(bindings.CORE_DB, bindings.MEDIA_BUCKET);
        const id = await service.enqueue('delete-object', { key: 'uploads/news/original/a.jpg' });
        await service.run(storage);
        expect(await bindings.CORE_DB.prepare(
            'SELECT state FROM compensation_jobs WHERE id=?'
        ).bind(id).first<string>('state')).toBe('failed');
        expect(await bindings.CORE_DB.prepare(
            'SELECT attempts FROM compensation_jobs WHERE id=?'
        ).bind(id).first<number>('attempts')).toBe(1);
        await service.run(storage);
        await service.run(storage);
        expect(await bindings.CORE_DB.prepare(
            'SELECT state FROM compensation_jobs WHERE id=?'
        ).bind(id).first<string>('state')).toBe('completed');
        expect(await bindings.CORE_DB.prepare(
            'SELECT attempts FROM compensation_jobs WHERE id=?'
        ).bind(id).first<number>('attempts')).toBe(2);
        expect(attempts).toBe(2);
    });
});

describe('CARD-01 legacy namecard hash compatibility', () => {
    it('matches retransmitted WebP output against pre-existing 32-character MD5 hashes', async () => {
        await applyCoreMigrations();
        const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x57, 0x45, 0x42, 0x50]);
        const legacyHash = md5Hex(webp);
        await bindings.CORE_DB.prepare(
            `INSERT INTO cards (image1_url, image2_url, hash1, hash2, status)
             VALUES ('/legacy-front.webp', '/legacy-back.webp', ?, ?, 'approved')`
        ).bind(legacyHash, legacyHash).run();

        const objects = new Map<string, Uint8Array>();
        const storage = {
            async put(key: string, body: Uint8Array) {
                objects.set(key, Uint8Array.from(body));
                return { body, size: body.byteLength, contentType: 'image/webp', etag: '"fixture"' };
            },
            async delete(key: string) { objects.delete(key); }
        } as unknown as ObjectStorage;
        const images: ImageProcessor = {
            async validate() { return { format: 'png', width: 1, height: 1, contentType: 'image/png' }; },
            async toWebp() { return webp; },
            async thumbnailPng(body) { return body; },
            async resizeJpeg(body) { return body; }
        };
        const files = [
            { filename: 'front.png', contentType: 'image/png', body: new Uint8Array([1]) },
            { filename: 'back.png', contentType: 'image/png', body: new Uint8Array([2]) }
        ];
        const uploads: UploadParser = { async parse() { return { fields: {}, files: { images: files } }; } };
        const runtime: RuntimeServices = {
            core: new D1CoreRepository(bindings.CORE_DB),
            storage,
            images,
            uploads
        };
        const app = createHonoApp(() => runtime);
        const response = await app.request('http://ims.test/api/uploadNameCard', {
            method: 'POST',
            headers: { 'Content-Type': 'multipart/form-data; boundary=fixture' },
            body: '--fixture--'
        });
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ msg: '重复上传' });
        expect(objects.size).toBe(0);
        expect(await bindings.CORE_DB.prepare('SELECT COUNT(*) AS count FROM cards')
            .first<number>('count')).toBe(1);
        expect(legacyHash).toHaveLength(32);
    });
});
