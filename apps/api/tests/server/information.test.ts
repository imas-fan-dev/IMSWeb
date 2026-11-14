// Merged from 4 sibling files that each keep their own describe block.
// The block around every contribution gives it its own scope, so identically
// named fixtures from different files cannot clash.

import { readContractJson as contractJson } from '../contracts/contract-json';
import { createHonoApp } from '@/app';
import { defaultInformationIndex, informationCardSummary, parseInformationIndex, serializeInformationIndex } from '@/domains/content/information/data';
import { buildInformationHtmlDocument, INFORMATION_DOCUMENT_CSP } from '@/domains/content/information/information-html-document';
import { publicInformationCard } from '@/domains/content/information/public-response';
import type { ListedObject, ObjectStorage, PutObjectOptions, StoredObject } from '@/ports/object-storage';
import { INFORMATION_INDEX_OBJECT_KEY } from '@/utils/storage/business-object-keys';
import { informationDetailSchema, informationErrorResponseSchema, informationListSchema } from '@imsweb/contracts/information';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { test } from 'vitest';

// information-data.test.ts
{
    test.describe('information index', () => {
        test('defaults empty and strips HTML from public summaries', () => {
            const index = defaultInformationIndex();
            assert.deepEqual(index, { version: 1, cards: [], assets: [] });

            const htmlIndex = {
                version: 1 as const,
                assets: ['/uploads/information/original/cover.webp'],
                cards: [{
                    id: 'info-contract-001',
                    category: 'fan' as const,
                    contentType: 'html' as const,
                    title: 'Contract HTML',
                    image: '/uploads/information/original/cover.webp',
                    link: '/ignored',
                    html: '<h2>Hosted content</h2>',
                    updatedAt: '2026-07-23T00:00:00.000Z'
                }]
            };
            const parsed = parseInformationIndex(serializeInformationIndex(htmlIndex));
            assert.equal(parsed.cards[0]?.link, '/information/info-contract-001');
            assert.equal(parsed.cards[0]?.html, '<h2>Hosted content</h2>');
            assert.equal('html' in informationCardSummary(parsed.cards[0]!), false);
        });

        test('rejects hosted cover images missing from the asset manifest', () => {
            const body = new TextEncoder().encode(JSON.stringify({
                version: 1,
                assets: [],
                cards: [{
                    id: 'info-contract-002',
                    category: 'activity',
                    contentType: 'external',
                    title: 'Missing asset',
                    image: '/uploads/information/original/missing.webp',
                    link: 'https://example.com',
                    updatedAt: '2026-07-23T00:00:00.000Z'
                }]
            }));
            assert.throws(() => parseInformationIndex(body), /image is invalid/);
        });
    });
}

// information-html-document.test.ts
{
    test.describe('information HTML documents', () => {
        test('escape metadata and keep managed body markup', () => {
            const document = buildInformationHtmlDocument(
                '<Summer & Live>',
                '<h2>活动正文</h2><img src="/uploads/information/original/body.webp">'
            );

            assert.match(document, /<title>&lt;Summer &amp; Live&gt;<\/title>/);
            assert.match(document, /<h2>活动正文<\/h2>/);
            assert.match(document, /\/uploads\/information\/original\/body\.webp/);
            assert.match(INFORMATION_DOCUMENT_CSP, /script-src 'none'/);
            assert.match(INFORMATION_DOCUMENT_CSP, /form-action 'none'/);
            assert.match(INFORMATION_DOCUMENT_CSP, /img-src 'self'/);
        });
    });
}

// information-public-response.test.ts
{
    const storage: ObjectStorage = {
        async createPublicReadUrl(key) {
            return `https://cdn.example.test/${key}`;
        },
        async get() { return null; },
        async put() { throw new Error('not implemented'); },
        async delete() {},
        async exists() { return false; },
        async copy() {},
        async move() {},
        async list() { return []; },
        async deletePrefix() {}
    };

    test.describe('public information details', () => {
        test('rewrite cover and managed HTML images to direct URLs', async () => {
            const card = await publicInformationCard(storage, {
                id: 'information-card',
                category: 'activity',
                contentType: 'html',
                image: '/uploads/information/original/cover.png',
                link: '/information/information-card',
                title: 'Information card',
                html: '<p>正文</p><img alt="海报" src="/uploads/information/original/body image.png">',
                updatedAt: '2026-07-27T00:00:00.000Z'
            });

            assert.equal(
                card.image,
                'https://cdn.example.test/editorial/information/assets/cover/cover.png'
            );
            assert.match(
                card.html ?? '',
                /https:\/\/cdn\.example\.test\/editorial\/information\/assets\/body image\/cover\.png/
            );
            assert.doesNotMatch(card.html ?? '', /\/uploads\/information/);
        });
    });
}

// information-reorder.test.ts
{
    class MemoryStorage implements ObjectStorage {
        object: StoredObject | null = null;

        get(key: string): Promise<StoredObject | null> {
            return Promise.resolve(key === INFORMATION_INDEX_OBJECT_KEY ? this.object : null);
        }

        put(
            key: string,
            body: Uint8Array,
            options: PutObjectOptions = {}
        ): Promise<StoredObject> {
            assert.equal(key, INFORMATION_INDEX_OBJECT_KEY);
            this.object = {
                body,
                size: body.byteLength,
                contentType: options.contentType || 'application/json',
                etag: crypto.createHash('sha256').update(body).digest('hex')
            };
            return Promise.resolve(this.object);
        }

        async putIfUnchanged(
            key: string,
            expectedEtag: string | null,
            body: Uint8Array,
            options: PutObjectOptions = {}
        ): Promise<StoredObject | null> {
            if ((this.object?.etag ?? null) !== expectedEtag) return null;
            return this.put(key, body, options);
        }

        delete(): Promise<void> { return Promise.resolve(); }
        exists(): Promise<boolean> { return Promise.resolve(Boolean(this.object)); }
        copy(): Promise<void> { return Promise.resolve(); }
        move(): Promise<void> { return Promise.resolve(); }
        list(): Promise<ListedObject[]> { return Promise.resolve([]); }
        deletePrefix(): Promise<void> { return Promise.resolve(); }
    }

    test.describe('Information admin reordering', () => {
        test('is retired after community post unification', async () => {
            const storage = new MemoryStorage();
            const image = '/uploads/information/original/cover.webp';
            const card = (
                id: string,
                title: string,
                contentType: 'external' | 'html' = 'external'
            ) => ({
                id,
                category: 'activity' as const,
                contentType,
                image,
                link: `https://example.test/${id}`,
                ...(contentType === 'html' ? { html: '<p>活动正文</p>' } : {}),
                title,
                updatedAt: '2026-07-31T00:00:00.000Z'
            });
            await storage.put(INFORMATION_INDEX_OBJECT_KEY, serializeInformationIndex({
                version: 1,
                assets: [image],
                cards: [
                    card('information-first', '第一项', 'html'),
                    card('information-second', '第二项')
                ]
            }));
            const app = createHonoApp(() => ({
                storage,
                audit: {
                    insertAuditLog: async () => undefined,
                    listRecentAuditLogs: async () => []
                },
                backofficeTokens: {
                    sign: async () => 'op-token',
                    verify: async () => ({
                        id: 1,
                        username: 'operator',
                        producername: 'Operator',
                        dept: 'op',
                        adminRole: 'admin' as const,
                        csrfSecret: 'csrf'
                    })
                }
            }));
            const publicList = await app.request('/api/information');
            assert.equal(publicList.status, 200);
            await contractJson(publicList, informationListSchema);

            const publicDetail = await app.request('/api/information/information-first');
            assert.equal(publicDetail.status, 200);
            await contractJson(publicDetail, informationDetailSchema);

            const missing = await app.request('/api/information/missing');
            assert.equal(missing.status, 404);
            await contractJson(missing, informationErrorResponseSchema);

            // Content delivery intentionally remains HTML, while the reachable missing error is JSON.
            const content = await app.request('/information/information-first/content');
            assert.equal(content.status, 200);
            assert.match(content.headers.get('content-type') ?? '', /^text\/html/);
            const contentBody = await content.text();
            assert.match(contentBody, /<title>第一项<\/title>/);
            assert.match(contentBody, /<p>活动正文<\/p>/);

            const request = (ids: string[]) => app.request('/api/admin/information/order', {
                method: 'PUT',
                headers: {
                    Authorization: 'Bearer op-token',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ ids })
            });

            const response = await request(['information-second', 'information-first']);
            assert.equal(response.status, 410);
            assert.deepEqual(await contractJson(response, informationErrorResponseSchema), {
                error: '活动资讯后台已整合至社区帖子，请使用 /api/admin/community-posts'
            });
            assert.deepEqual(
                parseInformationIndex(storage.object!.body).cards.map((item) => item.id),
                ['information-first', 'information-second']
            );

            const retiredRequests: Array<[string, string, unknown?]> = [
                ['GET', '/api/admin/information'],
                ['POST', '/api/admin/information', {}],
                ['PUT', '/api/admin/information/information-first', {}],
                ['DELETE', '/api/admin/information/information-first'],
                ['POST', '/api/admin/information/assets', {}],
                ['DELETE', '/api/admin/information/assets', { url: image }]
            ];
            for (const [method, pathname, body] of retiredRequests) {
                const retired = await app.request(pathname, {
                    method,
                    headers: {
                        Authorization: 'Bearer op-token',
                        ...(body === undefined ? {} : { 'Content-Type': 'application/json' })
                    },
                    body: body === undefined ? undefined : JSON.stringify(body)
                });
                assert.equal(retired.status, 410, `${method} ${pathname}`);
                await contractJson(retired, informationErrorResponseSchema);
            }
        });
    });
}
