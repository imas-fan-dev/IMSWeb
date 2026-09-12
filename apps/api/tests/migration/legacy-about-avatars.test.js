'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const { test } = require('node:test');
const {
    parseAboutPageContent,
    serializeAboutPageContent,
    validateAboutPageDraft
} = require('../../src/domains/content/about/data.ts');
const {
    ABOUT_PAGE_OBJECT_KEY,
    publicMediaObjectKey
} = require('../../src/utils/storage/business-object-keys.ts');
const {
    classifyAvatarUrl,
    helpText,
    parseArguments,
    readBoundedBody,
    stageAboutAvatarPlan,
    syncAboutAvatars
} = require('../../scripts/migration/legacy-about-avatars');

class MemoryStorage {
    constructor() {
        this.objects = new Map();
        this.revision = 0;
    }

    async get(key) {
        const object = this.objects.get(key);
        return object ? { ...object, body: Uint8Array.from(object.body) } : null;
    }

    async put(key, body, options = {}) {
        this.revision += 1;
        const object = {
            body: Uint8Array.from(body),
            size: body.byteLength,
            contentType: options.contentType || 'application/octet-stream',
            etag: `revision-${this.revision}`
        };
        this.objects.set(key, object);
        return { ...object, body: Uint8Array.from(object.body) };
    }

    async putIfUnchanged(key, expectedEtag, body, options = {}) {
        if ((this.objects.get(key)?.etag || null) !== expectedEtag) return null;
        return this.put(key, body, options);
    }

    async delete(key) {
        this.objects.delete(key);
    }
}

function contentWithAvatars(avatarUrls) {
    return {
        version: 1,
        siteName: '测试站',
        siteNameEn: 'Test site',
        tagline: '测试关于页头像迁移。',
        heroImageUrl: '/brand/about/gakuen-arisa.png',
        heroImageAlt: '测试主视觉',
        heroImageScale: 100,
        heroImageOffsetX: 0,
        heroImageOffsetY: 0,
        accentColorStart: '#112233',
        accentColorEnd: '#445566',
        welcome: '欢迎',
        manifesto: [],
        sinceYear: 2026,
        overviewTitle: '概要',
        overview: [],
        groups: [
            {
                id: 'maintainers',
                title: '维护组',
                subtitle: 'Maintainers',
                people: avatarUrls.map((avatarUrl, index) => ({
                    id: `person-${index + 1}`,
                    name: `成员${index + 1}`,
                    role: '维护者',
                    description: '',
                    since: '',
                    profileUrl: null,
                    avatarUrl
                }))
            }
        ],
        updatedAt: '2026-08-16T09:29:57.332Z'
    };
}

function sha256(body) {
    return crypto.createHash('sha256').update(body).digest('hex');
}

test('About avatar migration is read-only by default and requires explicit confirmations', () => {
    const options = parseArguments([
        '--source-base-url',
        'https://legacy.example/',
        '--manifest',
        './about-avatar.json'
    ], {});
    assert.equal(options.apply, false);
    assert.equal(options.sourceBaseUrl, 'https://legacy.example');
    assert.match(options.manifest, /about-avatar\.json$/);
    assert.match(helpText(), /read-only/);
    assert.throws(() => parseArguments(['--source-base-url'], {}), /requires a value/);
    assert.throws(() => parseArguments(['--unknown'], {}), /Unknown argument/);
    assert.throws(() => parseArguments(['--apply'], {}), /requires --plan/);
    const apply = parseArguments([
        '--apply',
        '--plan',
        './about-avatar-plan.json'
    ], {});
    assert.match(apply.manifest, /about-avatar-apply\.json$/);
    assert.equal(
        apply.plan,
        path.resolve(__dirname, '../../../..', 'about-avatar-plan.json')
    );
});

test('About avatar response streaming enforces the 10MB limit', async () => {
    const body = new ReadableStream({
        start(controller) {
            controller.enqueue(Buffer.alloc(6 * 1024 * 1024));
            controller.enqueue(Buffer.alloc(6 * 1024 * 1024));
            controller.close();
        }
    });
    await assert.rejects(
        readBoundedBody({ body }, 'large avatar'),
        /exceeds the 10MB image limit/
    );
});

test('About avatar URL classification only accepts the upload format and confirmed legacy origin', () => {
    assert.deepEqual(
        classifyAvatarUrl(
            '/uploads/about/member-avatars/current.webp',
            'https://idol-master.top'
        ),
        {
            kind: 'canonical',
            url: '/uploads/about/member-avatars/current.webp'
        }
    );
    assert.deepEqual(
        classifyAvatarUrl(
            'https://idol-master.top/uploads/about/member-avatars/current.webp',
            'https://idol-master.top'
        ),
        {
            kind: 'canonicalized',
            url: '/uploads/about/member-avatars/current.webp'
        }
    );
    assert.equal(
        classifyAvatarUrl(
            '/brand/about/staff/legacy.webp',
            'https://idol-master.top'
        ).kind,
        'legacy'
    );
    assert.equal(
        classifyAvatarUrl(
            'https://untrusted.example/avatar.webp',
            'https://idol-master.top'
        ).kind,
        'unsupported'
    );
    assert.equal(
        classifyAvatarUrl(
            '/brand/about/staff/%2e%2e%2fsecret.webp',
            'https://idol-master.top'
        ).kind,
        'unsupported'
    );
});

test('About avatar plan migrates legacy paths and reports unsupported URLs', async () => {
    const body = Buffer.from('canonical-webp');
    const content = contentWithAvatars([
        '/brand/about/staff/legacy.webp',
        'https://idol-master.top/uploads/about/member-avatars/current.webp',
        'https://untrusted.example/avatar.webp'
    ]);
    const requested = [];
    const plan = await stageAboutAvatarPlan(
        content,
        'https://idol-master.top',
        {
            async loadAvatar(url) {
                requested.push(url);
                return body;
            }
        }
    );

    assert.deepEqual(requested, [
        'https://idol-master.top/brand/about/staff/legacy.webp'
    ]);
    const expectedMigratedUrl =
        `/uploads/about/member-avatars/person-1-${sha256(body).slice(0, 12)}.webp`;
    assert.equal(plan.content.groups[0].people[0].avatarUrl, expectedMigratedUrl);
    assert.equal(
        plan.content.groups[0].people[1].avatarUrl,
        '/uploads/about/member-avatars/current.webp'
    );
    assert.equal(plan.migrations.length, 1);
    assert.equal(plan.canonicalizedUrls.length, 1);
    assert.equal(plan.unsupported.length, 1);
});

test('About avatar sync plans without writes, then uploads and conditionally rewrites config', async () => {
    const storage = new MemoryStorage();
    const currentUrl = '/uploads/about/member-avatars/current.webp';
    const content = contentWithAvatars([
        '/brand/about/staff/legacy.webp',
        currentUrl
    ]);
    await storage.put(
        ABOUT_PAGE_OBJECT_KEY,
        serializeAboutPageContent(content),
        { contentType: 'application/json' }
    );
    await storage.put(
        publicMediaObjectKey(currentUrl),
        Buffer.from('current-avatar'),
        { contentType: 'image/webp' }
    );
    const revisionBeforePlan = storage.revision;
    const body = Buffer.from('migrated-avatar');
    const dependencies = {
        async loadAvatar() {
            return body;
        },
        parseContent: parseAboutPageContent,
        serializeContent: serializeAboutPageContent,
        validateDraft: validateAboutPageDraft
    };

    const plan = await syncAboutAvatars(
        storage,
        'https://idol-master.top',
        false,
        dependencies
    );
    assert.equal(plan.configStatus, 'would-update');
    assert.equal(plan.migrations[0].status, 'would-upload');
    assert.equal(plan.summary.missingObjects, 0);
    assert.equal(storage.revision, revisionBeforePlan);

    const applied = await syncAboutAvatars(
        storage,
        'https://idol-master.top',
        true,
        { ...dependencies, expectedPlan: plan }
    );
    assert.equal(applied.configStatus, 'updated');
    assert.equal(applied.migrations[0].status, 'uploaded');
    const stored = await storage.get(ABOUT_PAGE_OBJECT_KEY);
    const parsed = parseAboutPageContent(stored.body);
    const migratedUrl = parsed.groups[0].people[0].avatarUrl;
    assert.match(
        migratedUrl,
        /^\/uploads\/about\/member-avatars\/person-1-[a-f0-9]{12}\.webp$/
    );
    assert.ok(await storage.get(publicMediaObjectKey(migratedUrl)));
    assert.equal(parsed.groups[0].people[1].avatarUrl, currentUrl);
    assert.notEqual(parsed.updatedAt, content.updatedAt);
});

test('About avatar apply stops for unsupported URLs and missing uploaded objects', async () => {
    const unsupportedStorage = new MemoryStorage();
    await unsupportedStorage.put(
        ABOUT_PAGE_OBJECT_KEY,
        serializeAboutPageContent(contentWithAvatars([
            'https://untrusted.example/avatar.webp'
        ]))
    );
    const unsupportedPlan = await syncAboutAvatars(
        unsupportedStorage,
        'https://idol-master.top',
        false,
        { async loadAvatar() { return Buffer.from('unused'); } }
    );
    await assert.rejects(
        syncAboutAvatars(
            unsupportedStorage,
            'https://idol-master.top',
            true,
            {
                async loadAvatar() { return Buffer.from('unused'); },
                expectedPlan: unsupportedPlan
            }
        ),
        /unsupported URL/
    );

    const missingStorage = new MemoryStorage();
    await missingStorage.put(
        ABOUT_PAGE_OBJECT_KEY,
        serializeAboutPageContent(contentWithAvatars([
            '/uploads/about/member-avatars/missing.webp'
        ]))
    );
    const missingPlan = await syncAboutAvatars(
        missingStorage,
        'https://idol-master.top',
        false,
        { async loadAvatar() { return Buffer.from('unused'); } }
    );
    await assert.rejects(
        syncAboutAvatars(
            missingStorage,
            'https://idol-master.top',
            true,
            {
                async loadAvatar() { return Buffer.from('unused'); },
                expectedPlan: missingPlan
            }
        ),
        /missing uploaded object/
    );
});

test('About avatar apply rejects source drift before writing objects', async () => {
    const storage = new MemoryStorage();
    await storage.put(
        ABOUT_PAGE_OBJECT_KEY,
        serializeAboutPageContent(contentWithAvatars([
            '/brand/about/staff/legacy.webp'
        ]))
    );
    const plan = await syncAboutAvatars(
        storage,
        'https://idol-master.top',
        false,
        { async loadAvatar() { return Buffer.from('reviewed-avatar'); } }
    );
    const revision = storage.revision;
    await assert.rejects(
        syncAboutAvatars(
            storage,
            'https://idol-master.top',
            true,
            {
                async loadAvatar() { return Buffer.from('changed-avatar'); },
                expectedPlan: plan
            }
        ),
        /does not match the approved plan/
    );
    assert.equal(storage.revision, revision);
});

test('About avatar apply never replaces a conflicting target object', async () => {
    const storage = new MemoryStorage();
    await storage.put(
        ABOUT_PAGE_OBJECT_KEY,
        serializeAboutPageContent(contentWithAvatars([
            '/brand/about/staff/legacy.webp'
        ]))
    );
    const dependencies = {
        async loadAvatar() { return Buffer.from('reviewed-avatar'); }
    };
    const plan = await syncAboutAvatars(
        storage,
        'https://idol-master.top',
        false,
        dependencies
    );
    const target = plan.migrations[0];
    await storage.put(target.key, Buffer.from('conflicting-avatar'));
    await assert.rejects(
        syncAboutAvatars(
            storage,
            'https://idol-master.top',
            true,
            { ...dependencies, expectedPlan: plan }
        ),
        /target exists with different content/
    );
    const preserved = await storage.get(target.key);
    assert.deepEqual(
        Buffer.from(preserved.body),
        Buffer.from('conflicting-avatar')
    );
});

test('About avatar apply rolls back new objects after a config CAS conflict', async () => {
    const storage = new MemoryStorage();
    await storage.put(
        ABOUT_PAGE_OBJECT_KEY,
        serializeAboutPageContent(contentWithAvatars([
            '/brand/about/staff/legacy.webp'
        ]))
    );
    const dependencies = {
        async loadAvatar() { return Buffer.from('reviewed-avatar'); }
    };
    const plan = await syncAboutAvatars(
        storage,
        'https://idol-master.top',
        false,
        dependencies
    );
    storage.putIfUnchanged = async () => null;
    await assert.rejects(
        syncAboutAvatars(
            storage,
            'https://idol-master.top',
            true,
            { ...dependencies, expectedPlan: plan }
        ),
        /config changed during migration/
    );
    assert.equal(await storage.get(plan.migrations[0].key), null);
});
