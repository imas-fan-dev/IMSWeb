import sharp from 'sharp';
import { SharpImageProcessor } from '@/infra/media/sharp/image-processor';
import { StreamingUploadParser } from '@/infra/http/busboy/upload-parser';
import assert from 'node:assert/strict';
import { assertContractJson as assertRawJsonConforms } from '../contracts/contract-json';
import { test } from 'vitest';
import { createHonoApp } from '@/app';
import type { CommunityContent } from '@imsweb/contracts/community-content';
import {
    communityContentSchema,
    adminCommunityContentSnapshotSchema,
    adminCommunityContentUpdateSchema,
} from '@imsweb/contracts/community-content';
import type {
    ListedObject,
    ObjectStorage,
    PutObjectOptions,
    StoredObject,
} from '@/ports/object-storage';
import type { ImageProcessor } from '@/ports/media';
import type { UploadParser } from '@/ports/http';
import type { AuditLogInput } from '@/ports/repositories';
import type { RuntimeServices } from '@/ports/runtime-services';

class MemoryStorage implements ObjectStorage {
    private readonly objects = new Map<string, StoredObject>();
    private revision = 0;

    async get(key: string): Promise<StoredObject | null> {
        const object = this.objects.get(key);
        return object
            ? { ...object, body: Uint8Array.from(object.body) }
            : null;
    }

    async put(
        key: string,
        body: Uint8Array,
        options: PutObjectOptions = {},
    ): Promise<StoredObject> {
        this.revision += 1;
        const object = {
            body: Uint8Array.from(body),
            size: body.byteLength,
            contentType: options.contentType || 'application/octet-stream',
            etag: `"revision-${this.revision}"`,
        };
        this.objects.set(key, object);
        return { ...object, body: Uint8Array.from(object.body) };
    }

    async putIfUnchanged(
        key: string,
        expectedEtag: string | null,
        body: Uint8Array,
        options: PutObjectOptions = {},
    ): Promise<StoredObject | null> {
        if ((this.objects.get(key)?.etag ?? null) !== expectedEtag) return null;
        return this.put(key, body, options);
    }

    async delete(key: string): Promise<void> {
        this.objects.delete(key);
    }
    async exists(key: string): Promise<boolean> {
        return this.objects.has(key);
    }
    async copy(sourceKey: string, destinationKey: string): Promise<void> {
        const source = await this.get(sourceKey);
        if (!source) throw new Error('source missing');
        await this.put(destinationKey, source.body, {
            contentType: source.contentType,
        });
    }
    async move(sourceKey: string, destinationKey: string): Promise<void> {
        await this.copy(sourceKey, destinationKey);
        await this.delete(sourceKey);
    }
    async list(prefix: string): Promise<ListedObject[]> {
        return [...this.objects.entries()]
            .filter(([key]) => key.startsWith(prefix))
            .map(([key, value]) => ({
                key,
                size: value.size,
                etag: value.etag,
            }));
    }
    async deletePrefix(prefix: string): Promise<void> {
        for (const key of this.objects.keys()) {
            if (key.startsWith(prefix)) this.objects.delete(key);
        }
    }
}

const uploads: UploadParser = {
    async parse(request) {
        const form = await request.formData();
        const image = form.get('image');
        if (!(image instanceof File)) return { fields: {}, files: {} };
        return {
            fields: {},
            files: {
                image: {
                    filename: image.name,
                    contentType: image.type,
                    body: new Uint8Array(await image.arrayBuffer()),
                },
            },
        };
    },
};

const images: ImageProcessor = {
    async validate() {
        return {
            format: 'png',
            width: 1_200,
            height: 800,
            contentType: 'image/png',
        };
    },
    async toWebp(body) {
        return Uint8Array.of(0x52, 0x49, 0x46, 0x46, ...body);
    },
    async thumbnailPng(body) {
        return body;
    },
    async resizeJpeg(body) {
        return body;
    },
};

function fixture(dept = 'op', overrides: Partial<RuntimeServices> = {}) {
    const storage = new MemoryStorage();
    const audit: AuditLogInput[] = [];
    const services: RuntimeServices = {
        storage,
        uploads,
        images,
        audit: {
            async insertAuditLog(input) {
                audit.push(input);
            },
            async listRecentAuditLogs() {
                return [];
            },
        },
        backofficeTokens: {
            async sign() {
                return 'producer-map-token';
            },
            async verify() {
                return {
                    id: 1,
                    username: 'map-editor',
                    producername: 'Map Producer',
                    dept,
                    csrfSecret: 'producer-map-csrf',
                };
            },
        },
    };
    Object.assign(services, overrides);
    const app = createHonoApp(() => services);
    const request = (path: string, init?: RequestInit) =>
        app.request(`http://ims.test${path}`, init);
    return { request, audit, storage };
}

const content: Omit<CommunityContent, 'updatedAt'> = {
    version: 1,
    title: '社区',
    introduction: '',
    entries: [
        {
            id: 'exchange',
            title: '交换',
            description: '',
            href: '/community/exchange',
            icon: 'Building2',
            imageUrl: null,
            enabled: true,
            audience: 'all',
            availability: 'exchange',
        },
    ],
};
const headers = {
    Authorization: 'Bearer producer-map-token',
    'Content-Type': 'application/json',
};
test('community defaults, editor save, persistence, visibility, conflicts and audit', async () => {
    const f = fixture('editor');
    const initial = await assertRawJsonConforms(
        await f.request('/api/community/content'),
        200,
        communityContentSchema,
    );
    assert.deepEqual(initial.entries, []);
    assert.equal(initial.title, '制作人社区');
    const admin = await assertRawJsonConforms(
        await f.request('/api/admin/community-content', { headers }),
        200,
        adminCommunityContentSnapshotSchema,
    );
    assert.equal(admin.revision, null);
    const savedResponse = await f.request('/api/admin/community-content', {
        method: 'PUT',
        headers,
        body: JSON.stringify({ content, revision: null }),
    });
    assert.equal(savedResponse.status, 200);
    const saved = await assertRawJsonConforms(
        savedResponse,
        200,
        adminCommunityContentUpdateSchema,
    );
    assert.equal(f.audit.length, 1);
    assert.deepEqual(
        (
            await assertRawJsonConforms(
                await f.request('/api/community/content'),
                200,
                communityContentSchema,
            )
        ).entries,
        content.entries,
    );
    assert.equal(
        (
            await f.request('/api/admin/community-content', {
                method: 'PUT',
                headers,
                body: JSON.stringify({ content, revision: null }),
            })
        ).status,
        409,
    );
    const hidden = {
        ...content,
        entries: content.entries.map((entry) => ({ ...entry, enabled: false })),
    };
    assert.equal(
        (
            await f.request('/api/admin/community-content', {
                method: 'PUT',
                headers,
                body: JSON.stringify({
                    content: hidden,
                    revision: saved.revision,
                }),
            })
        ).status,
        200,
    );
    assert.deepEqual(
        (
            await assertRawJsonConforms(
                await f.request('/api/community/content'),
                200,
                communityContentSchema,
            )
        ).entries,
        [],
    );
});
test('community permission, CSRF, strict requests and safe links', async () => {
    assert.equal(
        (await fixture().request('/api/admin/community-content')).status,
        401,
    );
    assert.equal(
        (
            await fixture('other').request('/api/admin/community-content', {
                headers,
            })
        ).status,
        403,
    );
    const f = fixture();
    const cookieHeaders = {
        'Content-Type': 'application/json',
        Cookie: 'ims_admin_access=producer-map-token; ims_admin_csrf=producer-map-csrf',
    };
    assert.equal(
        (
            await f.request('/api/admin/community-content', {
                method: 'PUT',
                headers: cookieHeaders,
                body: JSON.stringify({ content, revision: null }),
            })
        ).status,
        403,
    );
    assert.equal(
        (
            await f.request('/api/admin/community-content', {
                method: 'PUT',
                headers: {
                    ...cookieHeaders,
                    'X-CSRFToken': 'producer-map-csrf',
                },
                body: JSON.stringify({ content, revision: null }),
            })
        ).status,
        200,
    );
    for (const href of [
        'javascript:alert(1)',
        '//evil.test',
        '/%2fevil.test',
        '/%5cevil.test',
        'https://user:pass@example.test',
        '/a\\b',
        '/a%0ab',
    ]) {
        const unsafe = {
            ...content,
            entries: [{ ...content.entries[0]!, href }],
        };
        assert.equal(
            (
                await fixture().request('/api/admin/community-content', {
                    method: 'PUT',
                    headers,
                    body: JSON.stringify({ content: unsafe, revision: null }),
                })
            ).status,
            400,
            href,
        );
    }
    for (const payload of [
        { content, revision: null, extra: true },
        { content: { ...content, extra: true }, revision: null },
        {
            content: {
                ...content,
                entries: [{ ...content.entries[0], extra: true }],
            },
            revision: null,
        },
    ]) {
        assert.equal(
            (
                await fixture().request('/api/admin/community-content', {
                    method: 'PUT',
                    headers,
                    body: JSON.stringify(payload),
                })
            ).status,
            400,
        );
    }
});
test('community upload ownership and public GET/HEAD delivery', async () => {
    const f = fixture('editor');
    const form = new FormData();
    form.append(
        'image',
        new Blob([Uint8Array.of(1)], { type: 'image/png' }),
        'icon.png',
    );
    const response = await f.request('/api/admin/community-content/images', {
        method: 'POST',
        headers: { Authorization: headers.Authorization },
        body: form,
    });
    assert.equal(response.status, 200);
    const uploaded = (await response.json()) as { url: string };
    assert.match(
        uploaded.url,
        /^\/uploads\/community-content\/icon-\d+-[a-f0-9]{12}\.webp$/,
    );
    assert.equal((await f.request(uploaded.url)).status, 200);
    assert.equal(
        (await f.request(uploaded.url, { method: 'HEAD' })).status,
        200,
    );
    for (const imageUrl of [
        '/uploads/producer-map/other.webp',
        '/uploads/community-content/icon-123-abcdefabcdef.webp',
        uploaded.url,
    ]) {
        const status = (
            await f.request('/api/admin/community-content', {
                method: 'PUT',
                headers,
                body: JSON.stringify({
                    content: {
                        ...content,
                        entries: [{ ...content.entries[0], imageUrl }],
                    },
                    revision: null,
                }),
            })
        ).status;
        assert.equal(status, imageUrl === uploaded.url ? 200 : 400);
    }
    assert.equal(f.audit.length, 2);
});

test('community Node multipart decode normalization and invalid upload rejection', async () => {
    const f = fixture('op', {
        images: new SharpImageProcessor(),
        uploads: new StreamingUploadParser(),
    });
    const png = await sharp({
        create: { width: 4, height: 3, channels: 3, background: '#ffffff' },
    })
        .png()
        .toBuffer();
    const upload = async (bytes: Uint8Array, name: string, type: string) => {
        const form = new FormData();
        form.append(
            'image',
            new Blob([Uint8Array.from(bytes)], { type }),
            name,
        );
        return f.request('/api/admin/community-content/images', {
            method: 'POST',
            headers: { Authorization: headers.Authorization },
            body: form,
        });
    };
    const result = await upload(png, 'real.png', 'image/png');
    assert.equal(result.status, 200);
    const { url } = (await result.json()) as { url: string };
    const delivered = await f.request(url);
    assert.equal(delivered.headers.get('content-type'), 'image/webp');
    const metadata = await sharp(
        new Uint8Array(await delivered.arrayBuffer()),
    ).metadata();
    assert.equal(metadata.format, 'webp');
    assert.equal(metadata.width, 4);
    assert.equal(metadata.height, 3);
    assert.equal(
        (await upload(Uint8Array.of(1, 2, 3), 'broken.png', 'image/png'))
            .status,
        400,
    );
    assert.equal((await upload(png, 'wrong.png', 'image/jpeg')).status, 400);
    assert.equal(
        (
            await upload(
                new Uint8Array(10 * 1024 * 1024 + 1),
                'large.png',
                'image/png',
            )
        ).status,
        400,
    );
    assert.equal(f.audit.length, 1);
});
test('community atomic concurrent save loser cannot overwrite winner', async () => {
    const f = fixture();
    const results = await Promise.all(
        [1, 2].map((i) =>
            f.request('/api/admin/community-content', {
                method: 'PUT',
                headers,
                body: JSON.stringify({
                    content: { ...content, title: `writer-${i}` },
                    revision: null,
                }),
            }),
        ),
    );
    assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
    assert.equal(f.audit.length, 1);
    const latest = await assertRawJsonConforms(
        await f.request('/api/community/content'),
        200,
        communityContentSchema,
    );
    const winner = await assertRawJsonConforms(
        results.find((r) => r.status === 200)!,
        200,
        adminCommunityContentUpdateSchema,
    );
    assert.equal(latest.title, winner.content.title);
});

test('community failed reads never become empty success and failed upload storage compensates bytes', async () => {
    const broken = new MemoryStorage();
    broken.get = async () => {
        throw new Error('unavailable');
    };
    assert.equal(
        (
            await fixture('op', { storage: broken }).request(
                '/api/community/content',
            )
        ).status,
        500,
    );
    const storage = new MemoryStorage();
    const originalPut = storage.put.bind(storage);
    storage.put = async (...args) => {
        await originalPut(...args);
        throw new Error('write acknowledgement unavailable');
    };
    const f = fixture('op', { storage });
    const form = new FormData();
    form.append(
        'image',
        new Blob([Uint8Array.of(1)], { type: 'image/png' }),
        'icon.png',
    );
    assert.equal(
        (
            await f.request('/api/admin/community-content/images', {
                method: 'POST',
                headers: { Authorization: headers.Authorization },
                body: form,
            })
        ).status,
        500,
    );
    assert.deepEqual(await storage.list('community/landing/assets/'), []);
});

test('community corrupt stored content fails as infrastructure without replacing configuration', async () => {
    const malformed = [
        { ...content, updatedAt: null, extra: true },
        {
            ...content,
            updatedAt: null,
            entries: [{ ...content.entries[0], extra: true }],
        },
        { ...content, updatedAt: '2026-10-06' },
        { ...content, updatedAt: '2026-02-30T00:00:00Z' },
        {
            ...content,
            updatedAt: null,
            entries: [{ ...content.entries[0], href: 'javascript:alert(1)' }],
        },
        { ...content, updatedAt: null, entries: 'invalid' },
    ];
    for (const value of malformed) {
        const f = fixture();
        const before = await f.storage.put(
            'community/landing/config.json',
            new TextEncoder().encode(JSON.stringify(value)),
        );
        assert.equal((await f.request('/api/community/content')).status, 500);
        assert.equal(
            (await f.request('/api/admin/community-content', { headers }))
                .status,
            500,
        );
        assert.equal(
            (
                await f.request('/api/admin/community-content', {
                    method: 'PUT',
                    headers,
                    body: JSON.stringify({ content, revision: before.etag }),
                })
            ).status,
            500,
        );
        assert.deepEqual(
            await f.storage.get('community/landing/config.json'),
            before,
        );
        assert.equal(f.audit.length, 0);
    }
});

test('community saves require atomic storage and never fall back to unconditional put', async () => {
    const storage = new MemoryStorage();
    Object.defineProperty(storage, 'putIfUnchanged', { value: undefined });
    const f = fixture('op', { storage });
    assert.equal(
        (
            await f.request('/api/admin/community-content', {
                method: 'PUT',
                headers,
                body: JSON.stringify({ content, revision: null }),
            })
        ).status,
        500,
    );
    assert.equal(await storage.get('community/landing/config.json'), null);
    assert.equal(f.audit.length, 0);
});

test('community explicitly saved empty configuration remains empty after reread', async () => {
    const f = fixture('editor');
    const saved = await assertRawJsonConforms(
        await f.request('/api/admin/community-content', {
            method: 'PUT',
            headers,
            body: JSON.stringify({
                content: { ...content, entries: [] },
                revision: null,
            }),
        }),
        200,
        adminCommunityContentUpdateSchema,
    );
    const admin = await assertRawJsonConforms(
        await f.request('/api/admin/community-content', { headers }),
        200,
        adminCommunityContentSnapshotSchema,
    );
    assert.equal(admin.revision, saved.revision);
    assert.deepEqual(admin.content.entries, []);
    assert.deepEqual(
        (
            await assertRawJsonConforms(
                await f.request('/api/community/content'),
                200,
                communityContentSchema,
            )
        ).entries,
        [],
    );
});
