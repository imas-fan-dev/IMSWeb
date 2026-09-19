// Merged from 2 sibling files that each keep their own describe block.
// The block around every contribution gives it its own scope, so identically
// named fixtures from different files cannot clash.

import { assignedJson, buildIdolIndex, canonicalAssetUrl, extractCssReferences, extractHtmlReferences, mapAssetUrl, parseArguments, runWikiMediaSync, safeObjectKey } from '../../scripts/migration/wiki-media-sync';
import { applyExistingSemanticMedia, parseWikiMetadataAuditArguments } from '../../scripts/migration/wiki-metadata-audit.ts';
import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'vitest';

// wiki-media-sync.test.js
{
    const origin = 'https://idol-master.top';
    const idolIndex = buildIdolIndex([{
        agency_code: 'sc',
        agency_name: '闪耀色彩',
        idol_name: '樱木真乃',
        folder_name: 'sakuragi_mano'
    }]);

    test.describe('Wiki media sync', () => {
        test('accepts pnpm forwarded argument separators', () => {
            const options = parseArguments(['--', '--help']);
            assert.equal(options.help, true);
        });

        test('no longer accepts a SQLite database option', () => {
            const options = parseArguments([], {
                IMS_SQLITE_PATH: '/tmp/imsweb.db',
                IMS_STORY_DB_PATH: '/tmp/legacy-story.db'
            });
            assert.equal(Object.hasOwn(options, 'database'), false);
            assert.throws(
                () => parseArguments(['--database', '/tmp/imsweb.db']),
                /Unknown argument: --database/
            );
        });

        test('Wiki media crawl opens only the story repository when upload is disabled', async () => {
            const calls = [];
            const storyRepository = {
                listIdolsWithAgencies: async () => [{
                    agency_code: 'sc',
                    agency_name: '闪耀色彩',
                    name_cn: '樱木真乃',
                    folder_name: 'sakuragi_mano'
                }],
                close: async () => calls.push('close-story')
            };
            const manifest = await runWikiMediaSync(
                { upload: false, uploadExisting: false },
                {
                    openStoryRepository: async () => {
                        calls.push('open-story');
                        return storyRepository;
                    },
                    resolveStorage: async () => {
                        calls.push('resolve-storage');
                        throw new Error('storage must not be initialized');
                    },
                    closeStorage: async () => calls.push('close-storage'),
                    syncWikiMedia: async (_options, index, storage) => {
                        calls.push('crawl');
                        assert.equal(index.size, 1);
                        assert.equal(storage, undefined);
                        return { complete: true, summary: { assetCount: 0 } };
                    }
                }
            );

            assert.equal(manifest.complete, true);
            assert.deepEqual(calls, ['open-story', 'crawl', 'close-story']);
        });

        test('Wiki media upload reuses storage and closes resources after failure', async () => {
            const calls = [];
            const storage = { name: 'test-storage' };
            const storyRepository = {
                listIdolsWithAgencies: async () => [{
                    agency_code: 'sc',
                    agency_name: '闪耀色彩',
                    name_cn: '樱木真乃',
                    folder_name: 'sakuragi_mano'
                }],
                close: async () => calls.push('close-story')
            };

            await assert.rejects(
                runWikiMediaSync(
                    { upload: true, uploadExisting: false },
                    {
                        openStoryRepository: async () => storyRepository,
                        resolveStorage: async () => {
                            calls.push('resolve-storage');
                            return storage;
                        },
                        closeStorage: async () => calls.push('close-storage'),
                        syncWikiMedia: async (_options, _index, receivedStorage) => {
                            calls.push('crawl');
                            assert.equal(receivedStorage, storage);
                            throw new Error('crawl failed');
                        }
                    }
                ),
                /crawl failed/
            );
            assert.deepEqual(calls, [
                'resolve-storage',
                'crawl',
                'close-story',
                'close-storage'
            ]);
        });

        test('maps source paths to stable business object keys', () => {
            assert.deepEqual(
                mapAssetUrl(
                    'https://idol-master.top/image/%E9%97%AA%E8%80%80%E8%89%B2%E5%BD%A9/%E6%A8%B1%E6%9C%A8%E7%9C%9F%E4%B9%83/card/card_1.webp',
                    idolIndex
                ),
                {
                    kind: 'story-media',
                    agencyCode: 'sc',
                    agencyName: '闪耀色彩',
                    idolName: '樱木真乃',
                    folderName: 'sakuragi_mano',
                    relativePath: 'card/card_1.webp',
                    objectKey: 'wiki/agencies/sc/idols/sakuragi_mano/story-images/card/card_1.webp'
                }
            );
            assert.equal(
                mapAssetUrl(
                    'https://idol-master.top/image/%E9%97%AA%E8%80%80%E8%89%B2%E5%BD%A9/%E6%A8%B1%E6%9C%A8%E7%9C%9F%E4%B9%83/icon.webp',
                    idolIndex
                ).objectKey,
                'wiki/agencies/sc/idols/sakuragi_mano/avatar.webp'
            );
            assert.equal(
                mapAssetUrl('https://idol-master.top/icon/sc/wing.webp', idolIndex).objectKey,
                'wiki/shared/static/icon/sc/wing.webp'
            );
            assert.equal(
                mapAssetUrl('https://idol-master.top/css/story.css?v=38', idolIndex).objectKey,
                'wiki/shared/static/css/story.css'
            );
            assert.equal(
                mapAssetUrl('https://idol-master.top/icon/agencies/sc.webp', idolIndex).objectKey,
                'wiki/agencies/sc/branding/icon.webp'
            );
            assert.throws(
                () => mapAssetUrl('https://idol-master.top/image/闪耀色彩/不存在/icon.webp', idolIndex),
                /no local agency\/idol mapping/
            );
            assert.throws(() => safeObjectKey(['wiki', '..', 'secret']), /Unsafe object-key segment/);
        });

        test('extracts story, DOM, inline CSS, and storyData assets', async () => {
            const { parse } = await import('parse5');
            const storyData = JSON.stringify([{
                cards: [{ img: '/image/闪耀色彩/樱木真乃/card/card_2.webp' }]
            }]);
            const html = `<!doctype html>
        <a href="/story?agency=闪耀色彩&idol=樱木真乃">story</a>
        <img src="/image/闪耀色彩/樱木真乃/icon.webp">
        <div style="background-image:url('/icon/sc.webp')"></div>
        <style>.hero{background:url('/assets/images/hero.png')}</style>
        <script>window.storyData = ${storyData};</script>`;
            const result = extractHtmlReferences(html, `${origin}/wiki/`, origin, parse);
            assert.equal(result.stories.size, 1);
            assert.deepEqual(
                [...result.assets].map((url) => decodeURIComponent(new URL(url).pathname)).sort(),
                [
                    '/assets/images/hero.png',
                    '/icon/sc.webp',
                    '/image/闪耀色彩/樱木真乃/card/card_2.webp',
                    '/image/闪耀色彩/樱木真乃/icon.webp'
                ].sort()
            );
            assert.deepEqual(assignedJson(`window.storyData = ${storyData};`, 'window.storyData'), [
                { cards: [{ img: '/image/闪耀色彩/樱木真乃/card/card_2.webp' }] }
            ]);
        });

        test('keeps extraction same-origin and resolves CSS-relative paths', () => {
            assert.equal(
                canonicalAssetUrl('../icon/sc.webp?v=1#ignored', `${origin}/css/main.css`, origin),
                `${origin}/icon/sc.webp`
            );
            assert.equal(canonicalAssetUrl('https://example.com/image.webp', `${origin}/wiki/`, origin), null);
            assert.deepEqual(
                [...extractCssReferences(
                    '@import "./theme.css"; .a{background:url(../icon/sc.webp)}',
                    `${origin}/css/main.css`,
                    origin
                )].sort(),
                [`${origin}/css/theme.css`, `${origin}/icon/sc.webp`]
            );
        });
    });
}

// wiki-metadata-audit.test.js
{
    test.describe('Wiki metadata audit', () => {
        test('stays read-only unless apply is explicit', () => {
            const dryRun = parseWikiMetadataAuditArguments(['--', '--strict']);
            assert.equal(dryRun.apply, false);
            assert.equal(dryRun.strict, true);
            assert.match(dryRun.report, /data[/\\]migration[/\\]wiki-metadata-audit\.json$/);

            const applied = parseWikiMetadataAuditArguments([
                '--apply', '--report', 'data/migration/custom-wiki-audit.json'
            ]);
            assert.equal(applied.apply, true);
            assert.equal(applied.strict, false);
            assert.equal(
                applied.report,
                path.resolve(__dirname, '../../../..', 'data/migration/custom-wiki-audit.json')
            );
        });

        test('rejects unknown and incomplete arguments', () => {
            assert.throws(
                () => parseWikiMetadataAuditArguments(['--report']),
                /requires a file/
            );
            assert.throws(
                () => parseWikiMetadataAuditArguments(['--write']),
                /Unknown argument/
            );
        });

        test('replaces legacy and empty avatar associations with semantic keys', async () => {
            const agencies = [{ id: 1, code: '765', icon_object_key: 'wiki/shared/static/icon/765.webp' }];
            const idols = [
                {
                    id: 10,
                    agency_code: '765',
                    folder_name: 'amami_haruka',
                    avatar_object_key: 'wiki/shared/static/assets/images/Production/765Haruka.png'
                },
                {
                    id: 11,
                    agency_code: '765',
                    folder_name: 'kisaragi_chihaya',
                    avatar_object_key: null
                }
            ];
            const existing = new Set([
                'wiki/agencies/765/idols/amami_haruka/avatar.webp',
                'wiki/agencies/765/idols/kisaragi_chihaya/avatar.webp'
            ]);
            const updates = [];
            const applied = await applyExistingSemanticMedia({
                story: {
                    async listAgencies() { return agencies; },
                    async listIdolsWithAgencies() { return idols; },
                    async setAgencyIconObjectKey(id, key) { updates.push(['agency', id, key]); },
                    async setIdolAvatarObjectKey(id, key) { updates.push(['idol', id, key]); }
                },
                storage: {
                    async exists(key) { return existing.has(key); }
                }
            });

            assert.deepEqual(updates, [
                ['idol', 10, 'wiki/agencies/765/idols/amami_haruka/avatar.webp'],
                ['idol', 11, 'wiki/agencies/765/idols/kisaragi_chihaya/avatar.webp']
            ]);
            assert.deepEqual(applied, [
                {
                    entity: 'idol',
                    id: 10,
                    previousKey: 'wiki/shared/static/assets/images/Production/765Haruka.png',
                    objectKey: 'wiki/agencies/765/idols/amami_haruka/avatar.webp'
                },
                {
                    entity: 'idol',
                    id: 11,
                    previousKey: null,
                    objectKey: 'wiki/agencies/765/idols/kisaragi_chihaya/avatar.webp'
                }
            ]);
        });
    });
}
