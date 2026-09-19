// Merged from 5 sibling files that each keep their own describe block.
// The block around every contribution gives it its own scope, so identically
// named fixtures from different files cannot clash.

import 'tsx/cjs';
import { classifyAvatarUrl, helpText, parseArguments, readBoundedBody, stageAboutAvatarPlan, syncAboutAvatars } from '../../scripts/migration/legacy-about-avatars';
import { parseArguments as parseArgumentsFromLegacyBrandAssets, syncObjects, validateR2Acceptance, validateR2Target, validateTrueType } from '../../scripts/migration/legacy-brand-assets';
import { LEGACY_INFORMATION_CARDS, nextInformationIndex, parseArguments as parseArgumentsFromLegacyInformationMedia, syncLegacyInformation } from '../../scripts/migration/legacy-information-media';
import { helpText as helpTextFromLegacyNamecards, normalizeCard, normalizeReactions, parseArguments as parseArgumentsFromLegacyNamecards, sourceTimestamp, targetFilename, targetUrl } from '../../scripts/migration/legacy-namecards';
import { helpText as helpTextFromLegacyProducerMap, initialProducerMapContent, nextProducerMapContent, parseArguments as parseArgumentsFromLegacyProducerMap, parseLegacyMapScript, parseLegacyPage, syncProducerMapData, validateR2Acceptance as validateR2AcceptanceFromLegacyProducerMap, validateR2Target as validateR2TargetFromLegacyProducerMap } from '../../scripts/migration/legacy-producer-map';
import { parseAboutPageContent, serializeAboutPageContent, validateAboutPageDraft } from '../../src/domains/content/about/data.ts';
import { parseProducerMapContent, PRODUCER_MAP_PROVINCES, serializeProducerMapContent, validateProducerMapDraft } from '../../src/domains/content/producer-map/data.ts';
import { ABOUT_PAGE_OBJECT_KEY, PRODUCER_MAP_OBJECT_KEY, producerMapAssetObjectKey, publicMediaObjectKey } from '../../src/utils/storage/business-object-keys.ts';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { onTestFinished, test } from 'vitest';

// legacy-about-avatars.test.js
{
    // This migration script is CommonJS and pulls in TypeScript modules with plain
    // CJS `require` calls; its production command runs under the tsx loader for
    // exactly that reason. Vitest hands an inlined CommonJS file's own `require`
    // calls to Node, and Node cannot load an ESM-format `.ts` file from this
    // `"type": "commonjs"` package, so the test registers the same tsx CommonJS
    // hook the script ships with. See verification.md, 批次 C.

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

    test.describe('About avatar', () => {
        test('migration is read-only by default and requires explicit confirmations', () => {
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

        test('response streaming enforces the 10MB limit', async () => {
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

        test('URL classification only accepts the upload format and confirmed legacy origin', () => {
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

        test('plan migrates legacy paths and reports unsupported URLs', async () => {
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

        test('sync plans without writes, then uploads and conditionally rewrites config', async () => {
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

        test('apply stops for unsupported URLs and missing uploaded objects', async () => {
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

        test('apply rejects source drift before writing objects', async () => {
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

        test('apply never replaces a conflicting target object', async () => {
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

        test('apply rolls back new objects after a config CAS conflict', async () => {
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
    });
}

// legacy-brand-assets.test.js
{
    class MemoryStorage {
        constructor() {
            this.objects = new Map();
        }

        async get(key) {
            const object = this.objects.get(key);
            return object ? { ...object, body: Uint8Array.from(object.body) } : null;
        }

        async put(key, body, options = {}) {
            const object = {
                body: Uint8Array.from(body),
                size: body.byteLength,
                contentType: options.contentType || 'application/octet-stream',
                etag: 'fixture'
            };
            this.objects.set(key, object);
            return object;
        }

        async createPublicReadUrl(key) {
            return `https://assets.example.test/${key}`;
        }
    }

    function fontFixture() {
        const font = Buffer.alloc(60);
        font.writeUInt32BE(0x00010000, 0);
        font.writeUInt16BE(3, 4);
        ['head', 'maxp', 'name'].forEach((tag, index) => {
            const offset = 12 + index * 16;
            font.write(tag, offset, 4, 'ascii');
            font.writeUInt32BE(60, offset + 8);
            font.writeUInt32BE(0, offset + 12);
        });
        return font;
    }

    test.describe('brand asset', () => {
        test('migration requires exact apply confirmations', () => {
            const environment = { IMS_LEGACY_BRAND_ASSET_BASE_URL: 'https://legacy.example/' };
            const options = parseArgumentsFromLegacyBrandAssets([
                '--apply',
                '--confirm-source', 'https://legacy.example',
                '--confirm-bucket', 'media-prod'
            ], environment);
            assert.equal(options.sourceBaseUrl, 'https://legacy.example');
            assert.equal(options.confirmBucket, 'media-prod');
            assert.throws(
                () => parseArgumentsFromLegacyBrandAssets(['--require-r2'], environment),
                /requires --expect-bucket/
            );
            assert.throws(
                () => parseArgumentsFromLegacyBrandAssets(['--require-r2', '--expect-bucket', 'media', '--apply'], environment),
                /read-only/
            );
        });

        test('migration validates the SFNT table directory', () => {
            assert.deepEqual(validateTrueType(fontFixture()), { tableCount: 3 });
            assert.throws(() => validateTrueType(Buffer.alloc(60)), /not an SFNT font/);
        });

        test('sync plans, writes, and recognizes unchanged objects', async () => {
            const storage = new MemoryStorage();
            const body = Buffer.from('brand-asset');
            const asset = {
                objectKey: 'brand/works/765/character.png',
                publicPath: '/assets/images/Production/765Haruka.png',
                contentType: 'image/png',
                bytes: body.byteLength,
                sha256: crypto.createHash('sha256').update(body).digest('hex'),
                body
            };
            const verifyPublic = async (_storage, entry) => ({
                publicUrl: `https://assets.example.test/${entry.objectKey}`,
                publicStatus: 200
            });
            assert.equal(
                (await syncObjects(storage, [asset], false, verifyPublic))[0].objectStatus,
                'would-upload'
            );
            assert.equal(
                (await syncObjects(storage, [asset], true, verifyPublic))[0].objectStatus,
                'uploaded'
            );

            const unchanged = await syncObjects(storage, [asset], false, verifyPublic);
            assert.equal(unchanged[0].objectStatus, 'unchanged');
            assert.equal(unchanged[0].publicStatus, 200);
        });

        test('R2 acceptance rejects target and content drift', () => {
            const config = {
                type: 's3',
                bucket: 'media-prod',
                region: 'auto',
                endpoint: 'https://account.r2.cloudflarestorage.com',
                forcePathStyle: false,
                prefix: '',
                publicReadUrlBase: 'https://assets.example.test'
            };
            assert.doesNotThrow(() => validateR2Target(config, 'media-prod', true));
            assert.throws(() => validateR2Target({ ...config, region: 'us-east-1' }, 'media-prod', true));
            assert.doesNotThrow(() => validateR2Acceptance([{
                objectStatus: 'unchanged',
                publicUrl: 'https://assets.example.test/object',
                publicStatus: 200
            }]));
            assert.throws(() => validateR2Acceptance([{
                objectStatus: 'would-replace',
                publicUrl: null,
                publicStatus: null
            }]), /source and objects differ/);
        });
    });
}

// legacy-information-media.test.js
{
    // This migration script is CommonJS and pulls in TypeScript modules with plain
    // CJS `require` calls; its production command runs under the tsx loader for
    // exactly that reason. Vitest hands an inlined CommonJS file's own `require`
    // calls to Node, and Node cannot load an ESM-format `.ts` file from this
    // `"type": "commonjs"` package, so the test registers the same tsx CommonJS
    // hook the script ships with. See verification.md, 批次 C.

    class MemoryStorage {
        constructor() {
            this.objects = new Map();
            this.revision = 0;
        }

        async get(key) {
            const value = this.objects.get(key);
            return value ? { ...value, body: Uint8Array.from(value.body) } : null;
        }

        async put(key, body, options = {}) {
            const stored = {
                body: Uint8Array.from(body),
                size: body.byteLength,
                contentType: options.contentType || 'application/octet-stream',
                etag: `"revision-${++this.revision}"`
            };
            this.objects.set(key, stored);
            return stored;
        }

        async putIfUnchanged(key, expectedEtag, body, options = {}) {
            const current = this.objects.get(key);
            if ((expectedEtag === null && current) ||
                (expectedEtag !== null && current?.etag !== expectedEtag)) {
                return null;
            }
            return this.put(key, body, options);
        }
    }

    async function sourceFixture() {
        const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'ims-information-migration-'));
        for (const seed of LEGACY_INFORMATION_CARDS) {
            const target = path.join(directory, seed.source);
            await fs.mkdir(path.dirname(target), { recursive: true });
            await fs.writeFile(target, `image:${seed.id}`);
        }
        onTestFinished(() => fs.rm(directory, { recursive: true, force: true }));
        return directory;
    }

    test.describe('legacy Information migration', () => {
        test('is read-only unless apply is explicit', () => {
            const options = parseArgumentsFromLegacyInformationMedia(['--', '--source', './public']);
            assert.equal(options.apply, false);
            assert.equal(options.source, path.resolve('./public'));
            assert.equal(parseArgumentsFromLegacyInformationMedia(['--apply']).apply, true);
            assert.throws(() => parseArgumentsFromLegacyInformationMedia(['--source']), /requires a value/);
        });

        test('converts static cards without replacing admin records', () => {
            const adminCard = {
                id: 'info-admin-001',
                category: 'activity',
                contentType: 'external',
                title: 'Admin card',
                image: '/uploads/information/original/admin.webp',
                link: 'https://example.com/admin',
                updatedAt: '2026-07-24T01:00:00.000Z'
            };
            const staticLegacyCard = {
                id: 'legacy-hiro2026',
                category: 'activity',
                contentType: 'external',
                title: 'Edited legacy title',
                image: '/assets/images/hiro2026/xzg2026.png',
                link: '/edited',
                updatedAt: '2026-07-23T00:00:00.000Z'
            };
            const plan = nextInformationIndex({
                version: 1,
                cards: [adminCard, staticLegacyCard],
                assets: [adminCard.image]
            });
            assert.equal(plan.convertedCards, 1);
            assert.equal(plan.addedCards, 5);
            assert.deepEqual(plan.index.cards[0], adminCard);
            assert.equal(plan.index.cards[1].title, 'Edited legacy title');
            assert.equal(
                plan.index.cards[1].image,
                '/uploads/information/original/xzg2026.png'
            );
            assert.equal(plan.index.cards[1].link, '/edited');
        });

        test('upgrades only the retired hiro page link', () => {
            const plan = nextInformationIndex({
                version: 1,
                cards: [{
                    id: 'legacy-hiro2026',
                    category: 'activity',
                    contentType: 'external',
                    title: '管理员保留的标题',
                    image: '/uploads/information/original/xzg2026.png',
                    link: '/hiro2026.html',
                    updatedAt: '2026-07-23T00:00:00.000Z'
                }],
                assets: ['/uploads/information/original/xzg2026.png']
            });

            assert.equal(plan.convertedCards, 1);
            assert.equal(plan.index.cards[0].title, '管理员保留的标题');
            assert.equal(plan.index.cards[0].link, '/sites/hiro2026');
        });

        test('writes and verifies six images plus one stored index', async () => {
            const source = await sourceFixture();
            const storage = new MemoryStorage();

            const audit = await syncLegacyInformation(source, storage, false);
            assert.equal(audit.cardsAdded, 6);
            assert.equal(audit.summary.wouldUpload, 6);
            assert.equal(storage.objects.size, 0);

            const applied = await syncLegacyInformation(source, storage, true);
            assert.equal(applied.indexStatus, 'created');
            assert.equal(applied.summary.uploaded, 6);
            assert.equal(storage.objects.size, 7);
            const index = JSON.parse(Buffer.from(
                storage.objects.get('editorial/information/index.json').body
            ).toString('utf8'));
            assert.equal(index.cards.length, 6);
            assert.equal(index.assets.length, 6);
            assert.ok(index.cards.every((card) => card.image.startsWith('/uploads/information/')));
            assert.equal(
                index.cards.find((card) => card.id === 'legacy-hiro2026').link,
                '/sites/hiro2026'
            );
            assert.equal(
                index.cards.find((card) => card.id === 'legacy-guangzhou2026').link,
                'https://show.bilibili.com/platform/detail.html?id=1002732&from=pc_search'
            );

            const repeated = await syncLegacyInformation(source, storage, true);
            assert.equal(repeated.indexStatus, 'unchanged');
            assert.equal(repeated.cardsAdded, 0);
            assert.equal(repeated.summary.unchanged, 6);
            assert.equal(storage.objects.size, 7);

            const replacement = '/uploads/information/original/admin-replacement.png';
            index.cards[0].image = replacement;
            index.assets.push(replacement);
            await storage.put(
                'editorial/information/assets/admin-replacement/cover.png',
                Buffer.from('replacement')
            );
            await storage.put(
                'editorial/information/index.json',
                Buffer.from(JSON.stringify(index)),
                { contentType: 'application/json; charset=utf-8' }
            );

            const administratorEdited = await syncLegacyInformation(source, storage, true);
            assert.equal(administratorEdited.indexStatus, 'unchanged');
            assert.equal(administratorEdited.cardsConverted, 0);
        });
    });
}

// legacy-namecards.test.js
{
    test.describe('Legacy namecard', () => {
        test('migration is read-only by default and normalizes its source', () => {
            const options = parseArgumentsFromLegacyNamecards([
                '--',
                '--source-base-url',
                'https://legacy.example/',
                '--staging-dir',
                './namecards'
            ], {});
            assert.equal(options.apply, false);
            assert.equal(options.sourceBaseUrl, 'https://legacy.example');
            assert.equal(options.staging, path.resolve('./namecards'));
            assert.equal(options.manifest, path.resolve('./namecards/manifest.json'));
            assert.match(helpTextFromLegacyNamecards(), /does not change PostgreSQL or S3 unless --apply/);
        });

        test('migration accepts explicit apply confirmations', () => {
            const options = parseArgumentsFromLegacyNamecards([
                '--apply',
                '--confirm-source',
                'https://legacy.example',
                '--confirm-bucket',
                'ims-media'
            ], { IMS_LEGACY_NAMECARD_BASE_URL: 'https://legacy.example/' });
            assert.equal(options.apply, true);
            assert.equal(options.confirmSource, options.sourceBaseUrl);
            assert.equal(options.confirmBucket, 'ims-media');
            assert.throws(() => parseArgumentsFromLegacyNamecards(['--source-base-url']), /requires a value/);
            assert.throws(() => parseArgumentsFromLegacyNamecards(['--unknown']), /Unknown argument/);
        });

        test('records become validated canonical migration inputs', () => {
            assert.deepEqual(normalizeCard({
                id: 42,
                image1_url: '/uploads/namecard/original/front.png',
                image2_url: '/uploads/namecard/original/back.webp',
                hash1: 'A'.repeat(32),
                hash2: 'b'.repeat(32),
                ip: '127.0.0.1',
                status: 'approved',
                created_at: '2026-07-25 02:12:55'
            }), {
                id: 42,
                sourceImage1Url: '/uploads/namecard/original/front.png',
                sourceImage2Url: '/uploads/namecard/original/back.webp',
                hash1: 'a'.repeat(32),
                hash2: 'b'.repeat(32),
                ip: '127.0.0.1',
                status: 'approved',
                createdAt: '2026-07-25T02:12:55.000Z'
            });
            assert.throws(() => normalizeCard({ id: 1 }), /invalid media hash/);
            assert.throws(() => normalizeCard({
                id: 1,
                image1_url: 'https://other.example/front.png',
                image2_url: '/uploads/namecard/original/back.png',
                hash1: 'a'.repeat(32),
                hash2: 'b'.repeat(32),
                status: 'approved',
                created_at: '2026-07-25 02:12:55'
            }), /media URL/i);
            assert.throws(() => normalizeCard({
                id: 1,
                image1_url: '/uploads/namecard/original/../../private.png',
                image2_url: '/uploads/namecard/original/back.png',
                hash1: 'a'.repeat(32),
                hash2: 'b'.repeat(32),
                status: 'approved',
                created_at: '2026-07-25 02:12:55'
            }), /media URL/i);
        });

        test('targets use stable ASCII URLs and semantic key inputs', () => {
            const filename = targetFilename(42, 'front', 'webp');
            assert.equal(filename, 'card-42-front.webp');
            assert.equal(targetUrl(filename), '/uploads/namecard/original/card-42-front.webp');
            assert.equal(sourceTimestamp('2026-07-25 02:12:55'), '2026-07-25T02:12:55.000Z');
            assert.throws(() => targetFilename(42, 'side', 'webp'), /Invalid canonical/);
        });

        test('Legacy reactions reject invalid counts', () => {
            assert.deepEqual(normalizeReactions({ 'heart': 2, 'party': 3 }, 42), [
                { emoji: 'heart', count: 2 },
                { emoji: 'party', count: 3 }
            ]);
            assert.throws(() => normalizeReactions({ party: 0 }, 42), /invalid value/);
        });
    });
}

// legacy-producer-map.test.js
{
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
    }

    function dependencies() {
        return {
            objectKey: PRODUCER_MAP_OBJECT_KEY,
            parseContent: parseProducerMapContent,
            serializeContent: serializeProducerMapContent,
            validateDraft: validateProducerMapDraft
        };
    }

    function sourceFixture() {
        return {
            sourceBaseUrl: 'https://legacy.example',
            title: '全国偶像大师社群一览',
            subtitle: 'THE IDOLM@STER COMMUNITY MAP',
            regions: [
                {
                    id: 'legacy-region-beijing',
                    province: '北京市',
                    name: '北京市',
                    sourcePath: '/assets/images/maps/beijing.png',
                    stem: 'beijing'
                },
                {
                    id: 'legacy-region-guangdong',
                    province: '广东省',
                    name: '广东省',
                    sourcePath: '/assets/images/maps/guangdong.png',
                    stem: 'guangdong'
                }
            ],
            communities: [
                {
                    id: 'site-owner-lounge',
                    name: '站长小窝',
                    platform: 'QQ',
                    region: null,
                    series: 'all',
                    sourcePath: '/assets/images/qqcount/owner.png'
                },
                {
                    id: 'ichibanboshi-lounge',
                    name: '一番星の小窝',
                    platform: 'QQ',
                    region: null,
                    series: 'all',
                    sourcePath: '/assets/images/qqcount/star.jpg'
                }
            ]
        };
    }

    function mediaFixture(source) {
        return [...source.regions.map((item) => ({ kind: 'region', item })),
            ...source.communities.map((item) => ({ kind: 'community', item }))]
            .map(({ kind, item }) => {
                const extension = item.sourcePath.endsWith('.jpg') ? 'jpg' : 'png';
                const filename = kind === 'region'
                    ? `region-${item.stem}.${extension}`
                    : `community-${item.id}.${extension}`;
                const body = Buffer.from(`${kind}:${item.id}`);
                return {
                    kind,
                    id: item.id,
                    name: item.name,
                    sourcePath: item.sourcePath,
                    filename,
                    url: `/uploads/producer-map/${filename}`,
                    key: producerMapAssetObjectKey(filename),
                    bytes: body.byteLength,
                    sha256: crypto.createHash('sha256').update(body).digest('hex'),
                    contentType: extension === 'jpg' ? 'image/jpeg' : 'image/png',
                    body
                };
            });
    }

    test.describe('Producer Map', () => {
        test('migration is read-only by default and normalizes its source', () => {
            const options = parseArgumentsFromLegacyProducerMap([
                '--',
                '--source-base-url',
                'https://legacy.example/',
                '--staging-dir',
                './producer-map'
            ], {});
            assert.equal(options.apply, false);
            assert.equal(options.sourceBaseUrl, 'https://legacy.example');
            assert.equal(options.staging, path.resolve('./producer-map'));
            assert.equal(options.manifest, path.resolve('./producer-map/manifest.json'));
            assert.match(helpTextFromLegacyProducerMap(), /read-only/);
            assert.throws(() => parseArgumentsFromLegacyProducerMap(['--source-base-url']), /requires a value/);
            assert.throws(() => parseArgumentsFromLegacyProducerMap(['--unknown']), /Unknown argument/);
        });

        test.describe('R2 acceptance', () => {
            test('arguments cannot enable writes', () => {
                const options = parseArgumentsFromLegacyProducerMap([
                    '--require-r2',
                    '--expect-bucket',
                    'imsweb-media-public-prod',
                    '--expect-empty-prefix'
                ], {});
                assert.equal(options.requireR2, true);
                assert.equal(options.expectedBucket, 'imsweb-media-public-prod');
                assert.equal(options.expectEmptyPrefix, true);
                assert.throws(
                    () => parseArgumentsFromLegacyProducerMap([
                        '--require-r2',
                        '--expect-bucket',
                        'imsweb-media-public-prod',
                        '--apply'
                    ], {}),
                    /read-only/
                );
                assert.throws(
                    () => parseArgumentsFromLegacyProducerMap(['--require-r2'], {}),
                    /requires --expect-bucket/
                );
            });

            test('validates the exact storage target', () => {
                const target = {
                    type: 's3',
                    bucket: 'imsweb-media-public-prod',
                    region: 'auto',
                    endpoint: 'https://example-account.r2.cloudflarestorage.com',
                    forcePathStyle: false,
                    prefix: '',
                    readUrlTtlSeconds: 300
                };
                assert.doesNotThrow(() => validateR2TargetFromLegacyProducerMap(
                    target,
                    'imsweb-media-public-prod',
                    true
                ));
                assert.throws(
                    () => validateR2TargetFromLegacyProducerMap({ ...target, endpoint: 'http://127.0.0.1:9000' },
                        target.bucket, true),
                    /Cloudflare R2 S3 API endpoint/
                );
                assert.throws(
                    () => validateR2TargetFromLegacyProducerMap({ ...target, region: 'us-east-1' }, target.bucket, true),
                    /IMS_S3_REGION=auto/
                );
                assert.throws(
                    () => validateR2TargetFromLegacyProducerMap(target, 'another-bucket', true),
                    /IMS_S3_BUCKET=another-bucket/
                );
                assert.throws(
                    () => validateR2TargetFromLegacyProducerMap({ ...target, prefix: 'production' }, target.bucket, true),
                    /empty IMS_S3_PREFIX/
                );
            });

            test('fails unless source and objects are unchanged', () => {
                const accepted = {
                    configStatus: 'unchanged',
                    regionsAdded: 0,
                    communitiesAdded: 0,
                    imagesLinked: 0,
                    media: [{ objectStatus: 'unchanged' }]
                };
                assert.doesNotThrow(() => validateR2AcceptanceFromLegacyProducerMap(accepted));
                assert.throws(
                    () => validateR2AcceptanceFromLegacyProducerMap({
                        ...accepted,
                        media: [{ objectStatus: 'would-replace' }]
                    }),
                    /configuration or media differs/
                );
                assert.throws(
                    () => validateR2AcceptanceFromLegacyProducerMap({ ...accepted, configStatus: 'would-write' }),
                    /configuration or media differs/
                );
            });
        });

        test.describe('parser', () => {
            test('reads legacy titles and community image paths', async () => {
                const content = await parseLegacyPage(`<!doctype html><html><body>
        <h1>全国偶像大师社群一览</h1>
        <p>THE IDOLM@STER COMMUNITY MAP</p>
        <a class="infonews-card" data-img="./assets/images/qqcount/owner.png">
            站长小窝
        </a>
        <a class="infonews-card" data-img="/assets/images/qqcount/U149_QQ.png">
            U149同好群
        </a>
    </body></html>`);
                assert.equal(content.title, '全国偶像大师社群一览');
                assert.deepEqual(content.communities.map((item) => item.id), [
                    'site-owner-lounge',
                    'u149-lounge'
                ]);
                assert.equal(content.communities[1].sourcePath, '/assets/images/qqcount/U149_QQ.png');
            });

            test('requires one image for every canonical province', () => {
                const script = `const imgMap = {\n${PRODUCER_MAP_PROVINCES.map((province, index) =>
                `    "${province}": "/assets/images/maps/region${index}.png"`
            ).join(',\n')}\n};`;
                const regions = parseLegacyMapScript(script, PRODUCER_MAP_PROVINCES);
                assert.equal(regions.length, 34);
                assert.equal(regions[0].province, '北京市');
                assert.throws(
                    () => parseLegacyMapScript(script.replace(/.*澳门特别行政区.*\n/, ''), PRODUCER_MAP_PROVINCES),
                    /must map all 34/
                );
            });
        });

        test('migration applies idempotently and preserves admin edits', async () => {
            const storage = new MemoryStorage();
            const source = sourceFixture();
            const media = mediaFixture(source);

            const dryRun = await syncProducerMapData(storage, source, media, false, dependencies());
            assert.equal(dryRun.configStatus, 'would-write');
            assert.deepEqual(dryRun.media.map((item) => item.objectStatus), [
                'would-upload',
                'would-upload',
                'would-upload',
                'would-upload'
            ]);
            assert.equal(storage.objects.size, 0);

            const applied = await syncProducerMapData(storage, source, media, true, dependencies());
            assert.equal(applied.configStatus, 'created');
            assert.equal(applied.regionsAdded, 2);
            assert.equal(applied.imagesLinked, 4);
            assert.equal(storage.objects.size, 5);

            const rerun = await syncProducerMapData(storage, source, media, true, dependencies());
            assert.equal(rerun.configStatus, 'unchanged');
            assert.ok(rerun.media.every((item) => item.objectStatus === 'unchanged'));
            assert.equal(storage.objects.size, 5);

            const stored = await storage.get(PRODUCER_MAP_OBJECT_KEY);
            const customized = parseProducerMapContent(stored.body);
            customized.regions[0].summary = '管理员维护的北京社群说明';
            customized.regions[0].imageUrl = 'https://example.com/custom-beijing.png';
            customized.communities.at(-1).imageUrl = 'https://example.com/custom-star.png';
            await storage.put(
                PRODUCER_MAP_OBJECT_KEY,
                serializeProducerMapContent(customized),
                { contentType: 'application/json; charset=utf-8' }
            );

            const preserved = await syncProducerMapData(storage, source, media, true, dependencies());
            assert.equal(preserved.configStatus, 'unchanged');
            const final = parseProducerMapContent((await storage.get(PRODUCER_MAP_OBJECT_KEY)).body);
            assert.equal(final.regions[0].summary, '管理员维护的北京社群说明');
            assert.equal(final.regions[0].imageUrl, 'https://example.com/custom-beijing.png');
            assert.equal(final.communities.at(-1).imageUrl, 'https://example.com/custom-star.png');
        });

        test('merge fails closed when staged media is incomplete', () => {
            const source = sourceFixture();
            assert.throws(
                () => nextProducerMapContent(initialProducerMapContent(source), source, []),
                /media is missing region/
            );
        });
    });
}
