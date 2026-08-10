import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHonoApp } from '@/app';
import { parseAboutPageContent, type AboutPageContent } from '@/domains/about/data';
import type {
    ListedObject,
    ObjectStorage,
    PutObjectOptions,
    StoredObject
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
        return object ? { ...object, body: Uint8Array.from(object.body) } : null;
    }

    async put(
        key: string,
        body: Uint8Array,
        options: PutObjectOptions = {}
    ): Promise<StoredObject> {
        this.revision += 1;
        const object = {
            body: Uint8Array.from(body),
            size: body.byteLength,
            contentType: options.contentType || 'application/octet-stream',
            etag: `"revision-${this.revision}"`
        };
        this.objects.set(key, object);
        return { ...object, body: Uint8Array.from(object.body) };
    }

    async putIfUnchanged(
        key: string,
        expectedEtag: string | null,
        body: Uint8Array,
        options: PutObjectOptions = {}
    ): Promise<StoredObject | null> {
        if ((this.objects.get(key)?.etag ?? null) !== expectedEtag) return null;
        return this.put(key, body, options);
    }

    async delete(key: string): Promise<void> { this.objects.delete(key); }
    async exists(key: string): Promise<boolean> { return this.objects.has(key); }
    async copy(sourceKey: string, destinationKey: string): Promise<void> {
        const source = await this.get(sourceKey);
        if (!source) throw new Error('source missing');
        await this.put(destinationKey, source.body, { contentType: source.contentType });
    }
    async move(sourceKey: string, destinationKey: string): Promise<void> {
        await this.copy(sourceKey, destinationKey);
        await this.delete(sourceKey);
    }
    async list(prefix: string): Promise<ListedObject[]> {
        return [...this.objects.entries()]
            .filter(([key]) => key.startsWith(prefix))
            .map(([key, value]) => ({ key, size: value.size, etag: value.etag }));
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
                    body: new Uint8Array(await image.arrayBuffer())
                }
            }
        };
    }
};

const images: ImageProcessor = {
    async validate() {
        return { format: 'png', width: 800, height: 1_600, contentType: 'image/png' };
    },
    async toWebp(body) {
        return Uint8Array.of(0x52, 0x49, 0x46, 0x46, ...body);
    },
    async thumbnailPng(body) { return body; },
    async resizeJpeg(body) { return body; }
};

function aboutPageContent(): AboutPageContent {
    return {
        version: 1,
        siteName: '测试制作人交流站',
        siteNameEn: 'A test site for Producers.',
        tagline: '由测试数据维护的社区站点。',
        heroImageUrl: '/uploads/about/hero/test.webp',
        heroImageAlt: '测试主视觉',
        heroImageScale: 100,
        heroImageOffsetX: 0,
        heroImageOffsetY: 0,
        accentColorStart: '#112233',
        accentColorEnd: '#445566',
        welcome: '欢迎来到测试站点！',
        manifesto: [],
        sinceYear: 2026,
        overviewTitle: '测试概要',
        overview: [],
        groups: [
            {
                id: 'test-team',
                title: '测试团队',
                subtitle: 'Test Team',
                people: [
                    {
                        id: 'test-producer',
                        name: '测试制作人',
                        role: '测试员',
                        description: '',
                        since: '',
                        profileUrl: 'https://example.com/producer',
                        avatarUrl: '/uploads/about/member-avatars/test.webp'
                    }
                ]
            }
        ],
        updatedAt: null
    };
}

function fixture() {
    const storage = new MemoryStorage();
    const audit: AuditLogInput[] = [];
    const services: RuntimeServices = {
        storage,
        uploads,
        images,
        audit: {
            async insertAuditLog(input) { audit.push(input); },
            async listRecentAuditLogs() { return []; }
        },
        tokens: {
            async sign() { return 'about-token'; },
            async verify() {
                return {
                    id: 1,
                    username: 'about-editor',
                    producername: 'About Producer',
                    dept: 'op',
                    csrfSecret: 'about-csrf'
                };
            }
        }
    };
    const app = createHonoApp(() => services);
    const request = (path: string, init?: RequestInit) =>
        app.request(`http://ims.test${path}`, init);
    return { request, audit };
}

test('about page reports unconfigured content without serving defaults', async () => {
    const { request } = fixture();
    const response = await request('/api/about');
    assert.equal(response.status, 404);
    assert.equal(response.headers.get('cache-control'), 'no-cache');
    assert.deepEqual(await response.json(), { error: '关于页尚未配置' });
});

test('about page does not backfill removed static artwork paths', () => {
    const legacy = aboutPageContent() as unknown as Record<string, unknown>;
    delete legacy.heroImageUrl;
    const groups = legacy.groups as Array<{ people: Array<Record<string, unknown>> }>;
    delete groups[0]!.people[0]!.avatarUrl;

    const parsed = parseAboutPageContent(
        new TextEncoder().encode(JSON.stringify(legacy))
    );

    assert.equal(parsed.heroImageUrl, null);
    assert.equal(parsed.groups[0]?.people[0]?.avatarUrl, null);
});

test('about page admin updates are authenticated, audited, and revision guarded', async () => {
    const { request, audit } = fixture();
    const unauthorized = await request('/api/admin/about');
    assert.equal(unauthorized.status, 401);

    const headers = {
        Authorization: 'Bearer about-token',
        'Content-Type': 'application/json'
    };
    const initialResponse = await request('/api/admin/about', { headers });
    assert.equal(initialResponse.status, 200);
    const initial = await initialResponse.json() as {
        content: AboutPageContent | null;
        revision: string | null;
    };
    assert.deepEqual(initial, { content: null, revision: null });

    const edited = {
        ...aboutPageContent(),
        welcome: '欢迎来到动态配置后的交流站！'
    };
    const savedResponse = await request('/api/admin/about', {
        method: 'PUT',
        headers,
        body: JSON.stringify({ content: edited, revision: initial.revision })
    });
    assert.equal(savedResponse.status, 200);
    const saved = await savedResponse.json() as {
        content: AboutPageContent;
        revision: string;
    };
    assert.match(saved.revision, /revision-1/);
    assert.equal(saved.content.welcome, edited.welcome);
    assert.ok(saved.content.updatedAt);
    assert.equal(audit.at(-1)?.action, '更新关于本站');

    const publicResponse = await request('/api/about');
    const publicContent = await publicResponse.json() as AboutPageContent;
    assert.equal(publicContent.welcome, edited.welcome);

    const staleResponse = await request('/api/admin/about', {
        method: 'PUT',
        headers,
        body: JSON.stringify({ content: edited, revision: null })
    });
    assert.equal(staleResponse.status, 409);
    assert.match((await staleResponse.json() as { error: string }).error, /刷新后重试/);
});

test('about hero uploads are authenticated, audited, and publicly readable', async () => {
    const { request, audit } = fixture();
    const unauthorizedForm = new FormData();
    unauthorizedForm.append(
        'image',
        new Blob([Uint8Array.of(1)], { type: 'image/png' }),
        'hero.png'
    );
    const unauthorized = await request('/api/admin/about/hero-image', {
        method: 'POST',
        body: unauthorizedForm
    });
    assert.equal(unauthorized.status, 401);

    const form = new FormData();
    form.append(
        'image',
        new Blob([Uint8Array.of(1, 2, 3)], { type: 'image/png' }),
        'new-hero.png'
    );
    const response = await request('/api/admin/about/hero-image', {
        method: 'POST',
        headers: { Authorization: 'Bearer about-token' },
        body: form
    });
    assert.equal(response.status, 200);
    const uploaded = await response.json() as { success: true; url: string };
    assert.equal(uploaded.success, true);
    assert.match(uploaded.url, /^\/uploads\/about\/hero\/new-hero-\d+-[a-f0-9]{12}\.webp$/);
    assert.equal(audit.at(-1)?.action, '上传关于页主视觉');
    assert.equal(audit.at(-1)?.target, uploaded.url);

    const publicResponse = await request(uploaded.url);
    assert.equal(publicResponse.status, 200);
    assert.equal(publicResponse.headers.get('content-type'), 'image/webp');
    assert.deepEqual(
        new Uint8Array(await publicResponse.arrayBuffer()),
        Uint8Array.of(0x52, 0x49, 0x46, 0x46, 1, 2, 3)
    );
});

test('about member avatar uploads are authenticated, audited, and publicly readable', async () => {
    const { request, audit } = fixture();
    const unauthorizedForm = new FormData();
    unauthorizedForm.append(
        'image',
        new Blob([Uint8Array.of(1)], { type: 'image/png' }),
        'member.png'
    );
    const unauthorized = await request('/api/admin/about/member-avatar', {
        method: 'POST',
        body: unauthorizedForm
    });
    assert.equal(unauthorized.status, 401);

    const form = new FormData();
    form.append(
        'image',
        new Blob([Uint8Array.of(4, 5, 6)], { type: 'image/png' }),
        'member.png'
    );
    const response = await request('/api/admin/about/member-avatar', {
        method: 'POST',
        headers: { Authorization: 'Bearer about-token' },
        body: form
    });
    assert.equal(response.status, 200);
    const uploaded = await response.json() as { success: true; url: string };
    assert.equal(uploaded.success, true);
    assert.match(
        uploaded.url,
        /^\/uploads\/about\/member-avatars\/member-\d+-[a-f0-9]{12}\.webp$/
    );
    assert.equal(audit.at(-1)?.action, '上传关于页成员头像');
    assert.equal(audit.at(-1)?.target, uploaded.url);

    const publicResponse = await request(uploaded.url);
    assert.equal(publicResponse.status, 200);
    assert.equal(publicResponse.headers.get('content-type'), 'image/webp');
    assert.deepEqual(
        new Uint8Array(await publicResponse.arrayBuffer()),
        Uint8Array.of(0x52, 0x49, 0x46, 0x46, 4, 5, 6)
    );
});

test('about page rejects unsafe profile links before persistence', async () => {
    const { request } = fixture();
    const content = aboutPageContent();
    content.groups[0]!.people[0]!.profileUrl = 'javascript:alert(1)';
    const response = await request('/api/admin/about', {
        method: 'PUT',
        headers: {
            Authorization: 'Bearer about-token',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ content, revision: null })
    });
    assert.equal(response.status, 400);
    assert.match((await response.json() as { error: string }).error, /主页链接无效/);
});

test('about page rejects unsafe image links before persistence', async () => {
    const { request } = fixture();
    const content = aboutPageContent();
    content.heroImageUrl = 'data:image/svg+xml,<svg onload=alert(1) />';
    const response = await request('/api/admin/about', {
        method: 'PUT',
        headers: {
            Authorization: 'Bearer about-token',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ content, revision: null })
    });
    assert.equal(response.status, 400);
    assert.match((await response.json() as { error: string }).error, /角色主视觉图链接无效/);
});

test('about page rejects invalid hero layout and gradient values', async () => {
    const { request } = fixture();
    const headers = {
        Authorization: 'Bearer about-token',
        'Content-Type': 'application/json'
    };
    const invalidScale = aboutPageContent();
    invalidScale.heroImageScale = 161;
    const scaleResponse = await request('/api/admin/about', {
        method: 'PUT',
        headers,
        body: JSON.stringify({ content: invalidScale, revision: null })
    });
    assert.equal(scaleResponse.status, 400);
    assert.match((await scaleResponse.json() as { error: string }).error, /缩放/);

    const invalidColor = aboutPageContent();
    invalidColor.accentColorStart = 'green';
    const colorResponse = await request('/api/admin/about', {
        method: 'PUT',
        headers,
        body: JSON.stringify({ content: invalidColor, revision: null })
    });
    assert.equal(colorResponse.status, 400);
    assert.match((await colorResponse.json() as { error: string }).error, /十六进制颜色/);
});
