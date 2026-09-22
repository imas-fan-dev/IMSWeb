// Merged from 4 sibling files that each keep their own describe block.
// The block around every contribution gives it its own scope, so identically
// named fixtures from different files cannot clash.

import { createPostgresTestDatabase, postgresTest } from '../postgres-test-database';
import { createHonoApp } from '@/app';
import { parseSitePackageMaxUploadBytes } from '@/config/env';
import { parseSitePackageArchive, SITE_PACKAGE_ARCHIVE_LIMITS, SitePackageArchiveError } from '@/domains/delivery/site-packages/package-archive';
import { sitePackageContentCsp, sitePackageFrameAncestorOrigins, sitePackageRequestOrigin } from '@/domains/delivery/site-packages/site-package-support';
import { PostgresqlObjectDeletionWorker } from '@/infra/db/postgresql/object-deletion-worker';
import { SqlAuditRepository } from '@/infra/db/repositories/audit-repository';
import { SqlSitePackageRepository } from '@/infra/db/repositories/site-package-repository';
import type { ManagedSqlDatabase, SqlResult } from '@/infra/db/sql/database';
import { executeSql, queryOne } from '@/infra/db/sql/query';
import { StreamingUploadParser } from '@/infra/http/busboy/upload-parser';
import type { ListedObject, ObjectReadUrlOptions, ObjectStorage, PutObjectOptions, StoredObject } from '@/ports/object-storage';
import type { NamecardRepository, SitePackageRepository } from '@/ports/repositories';
import { mediaHttpErrorSchema } from '@imsweb/contracts/media';
import { publicSitePackageSchema, sitePackageCreateResultSchema, sitePackageCreateRevisionResultSchema, sitePackageDeleteRevisionResultSchema, sitePackageErrorResponseSchema, sitePackageListSchema, sitePackagePreviewResultSchema, sitePackagePublishResultSchema } from '@imsweb/contracts/site-packages';
import assert from 'node:assert/strict';
import crypto, { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { describe, test } from 'vitest';
import { ZipFile } from 'yazl';

// site-package-archive.test.ts
{
    interface ArchiveFixtureEntry {
        readonly path: string;
        readonly body?: Buffer;
        readonly directory?: boolean;
        readonly mode?: number;
    }

    async function createArchive(entries: readonly ArchiveFixtureEntry[]): Promise<Buffer> {
        const zip = new ZipFile();
        for (const entry of entries) {
            if (entry.directory) {
                zip.addEmptyDirectory(entry.path, { mode: entry.mode });
            } else {
                zip.addBuffer(entry.body ?? Buffer.alloc(0), entry.path, { mode: entry.mode });
            }
        }
        zip.end();
        const chunks: Buffer[] = [];
        for await (const chunk of zip.outputStream as Readable) {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        return Buffer.concat(chunks);
    }

    function webpFixture(): Buffer {
        const body = Buffer.alloc(20);
        body.write('RIFF', 0, 'ascii');
        body.writeUInt32LE(body.byteLength - 8, 4);
        body.write('WEBP', 8, 'ascii');
        body.write('VP8 ', 12, 'ascii');
        return body;
    }

    function woff2Fixture(): Buffer {
        const body = Buffer.alloc(48);
        body.write('wOF2', 0, 'ascii');
        body.writeUInt32BE(0x0001_0000, 4);
        body.writeUInt32BE(body.byteLength, 8);
        return body;
    }

    function jpegFixture(): Buffer {
        return Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0xff, 0xd9]);
    }

    function replaceAscii(archive: Buffer, source: string, replacement: string): Buffer {
        assert.equal(Buffer.byteLength(source), Buffer.byteLength(replacement));
        const patched = Buffer.from(archive);
        const needle = Buffer.from(source);
        const value = Buffer.from(replacement);
        let offset = 0;
        let replacements = 0;
        while ((offset = patched.indexOf(needle, offset)) !== -1) {
            value.copy(patched, offset);
            offset += value.byteLength;
            replacements += 1;
        }
        assert.equal(replacements, 2, 'local and central ZIP names must both be patched');
        return patched;
    }

    function patchFlags(archive: Buffer, bit: number): Buffer {
        const patched = Buffer.from(archive);
        for (let offset = 0; offset <= patched.byteLength - 10; offset += 1) {
            const signature = patched.readUInt32LE(offset);
            if (signature === 0x04034b50) {
                patched.writeUInt16LE(patched.readUInt16LE(offset + 6) | bit, offset + 6);
            } else if (signature === 0x02014b50) {
                patched.writeUInt16LE(patched.readUInt16LE(offset + 8) | bit, offset + 8);
            }
        }
        return patched;
    }

    function patchCentralSizes(archive: Buffer, uncompressedSize: number): Buffer {
        const patched = Buffer.from(archive);
        let entries = 0;
        for (let offset = 0; offset <= patched.byteLength - 46; offset += 1) {
            if (patched.readUInt32LE(offset) !== 0x02014b50) continue;
            patched.writeUInt32LE(uncompressedSize, offset + 24);
            entries += 1;
        }
        assert.ok(entries > 0);
        return patched;
    }

    async function assertArchiveError(
        action: () => Promise<unknown>,
        code: SitePackageArchiveError['code']
    ): Promise<void> {
        await assert.rejects(action, (error: unknown) => {
            assert.ok(error instanceof SitePackageArchiveError);
            assert.equal(error.code, code);
            assert.equal(error.status, 400);
            return true;
        });
    }

    test.describe('site package archive', () => {
        test('parses a hiro-like isolated package into an immutable manifest', async () => {
            const archive = await createArchive([
                { path: 'assets/', directory: true },
                {
                    path: 'hiro2026.html',
                    body: Buffer.from(`<!doctype html><html><head>
                <link rel="stylesheet" href="assets/site.css">
                <link rel="icon" href="./assets/favicon.svg?v=2026">
                </head><body><img src="assets/logo.webp"><script src="assets/site.js"></script>
                </body></html>`)
                },
                {
                    path: 'assets/site.css',
                    body: Buffer.from('@font-face { src: url(https://fonts.example/hiro.woff2) }')
                },
                { path: 'assets/site.js', body: Buffer.from('document.body.dataset.ready = "true";') },
                { path: 'assets/legacy-banner.png', body: jpegFixture() },
                { path: 'assets/logo.webp', body: webpFixture() },
                { path: 'assets/favicon.svg', body: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>') },
                { path: 'assets/hiro.woff2', body: woff2Fixture() },
                { path: 'assets/email_template.txt', body: Buffer.from('请填写活动报名信息。') }
            ]);

            const manifest = await parseSitePackageArchive(archive, {
                entryPath: 'hiro2026.html',
                runtimeMode: 'isolated-script'
            });

            assert.equal(manifest.entryPath, 'hiro2026.html');
            assert.equal(manifest.iconPath, 'assets/favicon.svg');
            assert.equal(manifest.runtimeMode, 'isolated-script');
            assert.equal(manifest.fileCount, 8);
            assert.equal(manifest.hasScripts, true);
            assert.equal(manifest.archiveSha256, createHash('sha256').update(archive).digest('hex'));
            assert.ok(manifest.warnings.includes('runtime-isolation-required'));
            assert.ok(manifest.warnings.includes('active-content:assets/site.js'));
            assert.ok(manifest.warnings.includes('remote-reference:assets/site.css'));
            assert.ok(manifest.warnings.includes(
                'content-type-corrected:assets/legacy-banner.png:image/jpeg'
            ));
            assert.deepEqual(
                manifest.entries.map((entry) => entry.path),
                [
                    'assets/email_template.txt',
                    'assets/favicon.svg',
                    'assets/hiro.woff2',
                    'assets/legacy-banner.png',
                    'assets/logo.webp',
                    'assets/site.css',
                    'assets/site.js',
                    'hiro2026.html'
                ]
            );
            const html = manifest.entries.at(-1)!;
            assert.equal(html.contentType, 'text/html; charset=utf-8');
            assert.equal(html.sha256, createHash('sha256').update(html.body).digest('hex'));
            const firstRead = html.body;
            firstRead[0] = 0;
            assert.equal(html.body[0], '<'.charCodeAt(0), 'manifest body reads must be defensive copies');
            assert.equal(Object.isFrozen(manifest), true);
            assert.equal(Object.isFrozen(manifest.entries), true);
            assert.equal(Object.isFrozen(html), true);
            assert.equal(
                manifest.entries.find((entry) => entry.path === 'assets/legacy-banner.png')?.contentType,
                'image/jpeg'
            );
        });

        test('uses a conventional packaged icon and warns about unusable declarations', async () => {
            const conventionalArchive = await createArchive([
                {
                    path: 'index.html',
                    body: Buffer.from('<!doctype html><html><head></head><body></body></html>')
                },
                {
                    path: 'branding/favicon.svg',
                    body: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')
                }
            ]);
            const conventional = await parseSitePackageArchive(conventionalArchive, {
                entryPath: 'index.html',
                runtimeMode: 'safe'
            });
            assert.equal(conventional.iconPath, 'branding/favicon.svg');
            assert.doesNotMatch(conventional.warnings.join('\n'), /site-icon-ignored/);

            const remoteArchive = await createArchive([{
                path: 'index.html',
                body: Buffer.from(
                    '<!doctype html><html><head>' +
                    '<link rel="shortcut icon" href="https://icons.example/favicon.png">' +
                    '</head><body></body></html>'
                )
            }]);
            const remote = await parseSitePackageArchive(remoteArchive, {
                entryPath: 'index.html',
                runtimeMode: 'safe'
            });
            assert.equal(remote.iconPath, null);
            assert.ok(remote.warnings.includes('site-icon-ignored:index.html'));
        });

        test('safe packages reject JavaScript files and active HTML handlers', async () => {
            const scriptFile = await createArchive([
                { path: 'index.html', body: Buffer.from('<!doctype html><html></html>') },
                { path: 'site.js', body: Buffer.from('alert(1)') }
            ]);
            await assertArchiveError(
                () => parseSitePackageArchive(scriptFile, { entryPath: 'index.html', runtimeMode: 'safe' }),
                'runtime-policy'
            );

            const eventHandler = await createArchive([{
                path: 'index.html',
                body: Buffer.from('<!doctype html><html><body onload="alert(1)"></body></html>')
            }]);
            await assertArchiveError(
                () => parseSitePackageArchive(eventHandler, { entryPath: 'index.html', runtimeMode: 'safe' }),
                'runtime-policy'
            );

            const encodedScheme = await createArchive([{
                path: 'index.html',
                body: Buffer.from(
                    // pi-lens-ignore: typos
                    '<!doctype html><html><a href="java&#x000000073;cript:alert(1)">unsafe</a></html>'
                )
            }]);
            await assertArchiveError(
                () => parseSitePackageArchive(encodedScheme, { entryPath: 'index.html', runtimeMode: 'safe' }),
                'runtime-policy'
            );
        });

        test('rejects traversal, duplicate, and case-folded path collisions', async () => {
            const traversalBase = await createArchive([
                { path: 'index.html', body: Buffer.from('<!doctype html><html></html>') },
                { path: 'aa/evil.txt', body: Buffer.from('evil') }
            ]);
            const traversal = replaceAscii(traversalBase, 'aa/evil.txt', '../evil.txt');
            await assertArchiveError(
                () => parseSitePackageArchive(traversal, { entryPath: 'index.html', runtimeMode: 'safe' }),
                'unsafe-path'
            );

            const duplicate = await createArchive([
                { path: 'index.html', body: Buffer.from('<!doctype html><html></html>') },
                { path: 'assets/logo.txt', body: Buffer.from('one') },
                { path: 'assets/logo.txt', body: Buffer.from('two') }
            ]);
            await assertArchiveError(
                () => parseSitePackageArchive(duplicate, { entryPath: 'index.html', runtimeMode: 'safe' }),
                'path-collision'
            );

            const caseCollision = await createArchive([
                { path: 'index.html', body: Buffer.from('<!doctype html><html></html>') },
                { path: 'assets/Logo.txt', body: Buffer.from('one') },
                { path: 'assets/logo.txt', body: Buffer.from('two') }
            ]);
            await assertArchiveError(
                () => parseSitePackageArchive(caseCollision, { entryPath: 'index.html', runtimeMode: 'safe' }),
                'path-collision'
            );

            const controlPath = await createArchive([
                { path: 'index.html', body: Buffer.from('<!doctype html><html></html>') },
                { path: 'assets/bad\nname.txt', body: Buffer.from('bad') }
            ]);
            await assertArchiveError(
                () => parseSitePackageArchive(controlPath, { entryPath: 'index.html', runtimeMode: 'safe' }),
                'unsafe-path'
            );
        });

        test('rejects symlink and encrypted ZIP entries', async () => {
            const symlink = await createArchive([
                { path: 'index.html', body: Buffer.from('<!doctype html><html></html>') },
                { path: 'assets/link.txt', body: Buffer.from('../secret'), mode: 0o120777 }
            ]);
            await assertArchiveError(
                () => parseSitePackageArchive(symlink, { entryPath: 'index.html', runtimeMode: 'safe' }),
                'invalid-entry'
            );

            const encryptedBase = await createArchive([
                { path: 'index.html', body: Buffer.from('<!doctype html><html></html>') }
            ]);
            const encrypted = patchFlags(encryptedBase, 0x1);
            await assertArchiveError(
                () => parseSitePackageArchive(encrypted, { entryPath: 'index.html', runtimeMode: 'safe' }),
                'encrypted-entry'
            );
        });

        test('enforces archive, file, expanded total, and file-count bomb limits', async () => {
            await assertArchiveError(
                () => parseSitePackageArchive(
                    Buffer.alloc(SITE_PACKAGE_ARCHIVE_LIMITS.archiveBytes + 1),
                    { entryPath: 'index.html', runtimeMode: 'safe' }
                ),
                'archive-too-large'
            );

            const perFile = await createArchive([
                { path: 'index.html', body: Buffer.from('<!doctype html><html></html>') },
                {
                    path: 'large.txt',
                    body: Buffer.alloc(SITE_PACKAGE_ARCHIVE_LIMITS.fileUncompressedBytes + 1, 0x61)
                }
            ]);
            await assertArchiveError(
                () => parseSitePackageArchive(perFile, { entryPath: 'index.html', runtimeMode: 'safe' }),
                'size-limit'
            );

            const totalBase = await createArchive([
                { path: 'index.html', body: Buffer.from('<!doctype html><html></html>') },
                { path: 'a.txt', body: Buffer.from('a') },
                { path: 'b.txt', body: Buffer.from('b') },
                { path: 'c.txt', body: Buffer.from('c') },
                { path: 'd.txt', body: Buffer.from('d') }
            ]);
            const totalBomb = patchCentralSizes(
                totalBase,
                SITE_PACKAGE_ARCHIVE_LIMITS.fileUncompressedBytes
            );
            await assertArchiveError(
                () => parseSitePackageArchive(totalBomb, { entryPath: 'index.html', runtimeMode: 'safe' }),
                'size-limit'
            );

            const tooManyEntries: ArchiveFixtureEntry[] = [{
                path: 'index.html',
                body: Buffer.from('<!doctype html><html></html>')
            }];
            for (let index = 0; index < SITE_PACKAGE_ARCHIVE_LIMITS.files; index += 1) {
                tooManyEntries.push({ path: `assets/${index}.txt`, body: Buffer.alloc(0) });
            }
            const fileFlood = await createArchive(tooManyEntries);
            await assertArchiveError(
                () => parseSitePackageArchive(fileFlood, { entryPath: 'index.html', runtimeMode: 'safe' }),
                'file-limit'
            );
        });

        test('rejects invalid magic, blocked nested files, and missing HTML entry paths', async () => {
            const invalidMagic = await createArchive([
                { path: 'index.html', body: Buffer.from('<!doctype html><html></html>') },
                { path: 'assets/logo.png', body: Buffer.from('not a png') }
            ]);
            await assertArchiveError(
                () => parseSitePackageArchive(invalidMagic, { entryPath: 'index.html', runtimeMode: 'safe' }),
                'invalid-content'
            );

            const nestedArchive = await createArchive([
                { path: 'index.html', body: Buffer.from('<!doctype html><html></html>') },
                { path: 'assets/source.zip', body: Buffer.from('nested') }
            ]);
            await assertArchiveError(
                () => parseSitePackageArchive(nestedArchive, { entryPath: 'index.html', runtimeMode: 'safe' }),
                'unsupported-file'
            );

            const missingEntry = await createArchive([
                { path: 'other.html', body: Buffer.from('<!doctype html><html></html>') }
            ]);
            await assertArchiveError(
                () => parseSitePackageArchive(missingEntry, { entryPath: 'index.html', runtimeMode: 'safe' }),
                'missing-entry'
            );
            await assertArchiveError(
                () => parseSitePackageArchive(missingEntry, { entryPath: 'README.txt', runtimeMode: 'safe' }),
                'missing-entry'
            );
        });

        test('requires PDF isolation and recognizes escaped PDF action names', async () => {
            const archive = await createArchive([
                { path: 'index.html', body: Buffer.from('<!doctype html><html></html>') },
                {
                    path: 'guide.pdf',
                    body: Buffer.from('%PDF-1.4\n1 0 obj << /S /#4AavaScript >> endobj\n%%EOF')
                }
            ]);
            await assertArchiveError(
                () => parseSitePackageArchive(archive, { entryPath: 'index.html', runtimeMode: 'safe' }),
                'runtime-policy'
            );

            const isolated = await parseSitePackageArchive(archive, {
                entryPath: 'index.html',
                runtimeMode: 'isolated-script'
            });
            assert.equal(isolated.hasScripts, true);
            assert.ok(isolated.warnings.includes('active-content:guide.pdf'));
        });
    });
}

// site-package-env.test.ts
{
    test.describe('site package env', () => {
        test('site-package content uses the current request origin', () => {
            const forwarded = new Request('http://upstream.test/sites/hiro-2026', {
                headers: {
                    'x-forwarded-proto': 'https',
                    'x-forwarded-host': 'preview.idol-master.top'
                }
            });
            assert.equal(sitePackageRequestOrigin(forwarded, 'direct'), 'http://upstream.test');
            assert.equal(
                sitePackageRequestOrigin(forwarded, 'nginx'),
                'https://preview.idol-master.top'
            );
            assert.equal(sitePackageRequestOrigin(new Request('http://upstream.test', {
                headers: {
                    'x-forwarded-proto': 'http',
                    'x-forwarded-host': 'main.test',
                    'x-forwarded-port': '8080'
                }
            }), 'nginx'), 'http://main.test:8080');

            const invalidForwardedHeaders: Array<Record<string, string>> = [
                { 'x-forwarded-proto': 'javascript', 'x-forwarded-host': 'main.test' },
                { 'x-forwarded-proto': 'https', 'x-forwarded-host': 'main.test/path' },
                { 'x-forwarded-proto': 'https', 'x-forwarded-host': 'main.test,evil.test' },
                {
                    'x-forwarded-proto': 'https',
                    'x-forwarded-host': 'main.test',
                    'x-forwarded-port': '70000'
                }
            ];
            for (const headers of invalidForwardedHeaders) {
                assert.equal(
                    sitePackageRequestOrigin(new Request('http://upstream.test', { headers }), 'nginx'),
                    'http://upstream.test'
                );
            }
        });

        test('site-package frame ancestors accept loopback aliases only for local development', () => {
            assert.deepEqual(sitePackageFrameAncestorOrigins('http://127.0.0.1:5173'), [
                'http://127.0.0.1:5173',
                'http://localhost:5173'
            ]);
            assert.deepEqual(sitePackageFrameAncestorOrigins('http://[::1]:5173'), ['http:']);
            assert.deepEqual(sitePackageFrameAncestorOrigins('https://www.example.com'), [
                'https://www.example.com'
            ]);
        });

        test('isolated site-package CSP uses an explicit content path for opaque origins', () => {
            const contentSource =
                'https://www.example.com/site-content/hiro-2026/' +
                '22222222-2222-4222-8222-222222222222/';
            const csp = sitePackageContentCsp(
                'isolated-script',
                'https://www.example.com',
                contentSource,
                'https://assets.example.com'
            );

            assert.ok(csp.includes(`connect-src ${contentSource}`));
            assert.ok(csp.includes(`script-src ${contentSource} 'unsafe-inline'`));
            assert.ok(csp.includes(`style-src ${contentSource} 'unsafe-inline'`));
            assert.ok(csp.includes(`img-src ${contentSource} data: https://assets.example.com`));
            assert.match(csp, /sandbox allow-scripts/);
            assert.doesNotMatch(csp, /'self'|allow-same-origin/);
        });

        test('safe site-package CSP blocks scripts while allowing packaged styles', () => {
            const contentSource = 'https://www.example.com/site-content/safe/revision/';
            const csp = sitePackageContentCsp(
                'safe',
                'https://www.example.com',
                contentSource
            );

            assert.match(csp, /connect-src 'none'/);
            assert.match(csp, /script-src 'none'; sandbox(?:;|$)/);
            assert.ok(csp.includes(`style-src ${contentSource} 'unsafe-inline'`));
            assert.doesNotMatch(csp, /allow-scripts|allow-same-origin|'self'/);
        });

        test('site-package upload limit is bounded by the archive parser maximum', () => {
            assert.equal(parseSitePackageMaxUploadBytes(undefined), 80 * 1024 * 1024);
            assert.equal(parseSitePackageMaxUploadBytes('1048576'), 1_048_576);
            for (const invalid of ['0', '-1', '1.5', '83886081', 'not-a-number']) {
                assert.throws(() => parseSitePackageMaxUploadBytes(invalid), /positive safe integer/);
            }
        });
    });
}

// site-package-repository.test.ts
{
    function revision(packageId: string, id: string, token: string, createdAt: number) {
        const prefix = `site-packages/${packageId}/revisions/${id}`;
        return {
            id,
            packageId,
            entryPath: 'index.html',
            runtimeMode: 'safe' as const,
            state: 'ready' as const,
            fileCount: 1,
            totalBytes: 25,
            sourceKey: `${prefix}/source.zip`,
            sourceSha256: 'c'.repeat(64),
            manifestKey: `${prefix}/manifest.json`,
            manifestJson: JSON.stringify({
                'index.html': `${prefix}/files/index.html`
            }),
            previewTokenHash: crypto.createHash('sha256').update(token).digest('hex'),
            createdBy: 7,
            createdAt
        };
    }

    describe('site package repository', () => {
        postgresTest('PostgreSQL site packages create revisions and atomically switch rollback pointers', async () => {
            const database = await createPostgresTestDatabase('site-package');
            const repository = new SqlSitePackageRepository(database);

            const packageId = '11111111-1111-4111-8111-111111111111';
            const firstId = '22222222-2222-4222-8222-222222222222';
            const secondId = '33333333-3333-4333-8333-333333333333';
            await repository.createSitePackageWithRevision({
                id: packageId,
                slug: 'hiro-2026',
                title: 'Hiro 2026',
                description: 'Uploaded package',
                createdBy: 7,
                createdAt: 1_000
            }, revision(packageId, firstId, 'a'.repeat(64), 1_000));

            await assert.rejects(
                executeSql(database, 'UPDATE site_packages SET slug=? WHERE id=?', ['Bad_Slug', packageId]),
                /check constraint/i
            );
            await assert.rejects(
                executeSql(database,
                    'UPDATE site_package_revisions SET source_sha256=? WHERE id=?',
                    ['C'.repeat(64), firstId]
                ),
                /check constraint/i
            );
            await assert.rejects(
                executeSql(database,
                    'UPDATE site_package_revisions SET preview_token_hash=? WHERE id=?',
                    ['z'.repeat(64), firstId]
                ),
                /check constraint/i
            );

            const second = await repository.createSitePackageRevision(
                revision(packageId, secondId, 'b'.repeat(64), 2_000)
            );
            assert.equal(second.revision_number, 2);
            assert.equal((await repository.listSitePackages())[0]?.revisions.length, 2);

            const firstPublication = await repository.publishSitePackageRevision(
                packageId, firstId, 7, 3_000
            );
            assert.equal(firstPublication?.operation, 'publish');
            assert.equal(firstPublication?.revision.published_at, 3_000);
            assert.equal((await repository.findSitePackageById(packageId))?.published_revision_id, firstId);
            assert.equal(
                (await repository.findSitePackageRevisionById(packageId, firstId))?.published_at,
                3_000
            );

            const secondPublication = await repository.publishSitePackageRevision(
                packageId, secondId, 8, 4_000
            );
            assert.equal(secondPublication?.operation, 'publish');
            assert.equal(secondPublication?.revision.published_at, 4_000);
            assert.equal((await repository.findSitePackageById(packageId))?.published_revision_id, secondId);

            const rollbackPublication = await repository.publishSitePackageRevision(
                packageId, firstId, 9, 5_000
            );
            assert.equal(rollbackPublication?.operation, 'rollback');
            assert.equal(
                rollbackPublication?.revision.published_at,
                3_000,
                'rollback returns the original publication timestamp'
            );
            const rolledBack = await repository.findSitePackageById(packageId);
            assert.equal(rolledBack?.published_revision_id, firstId);
            assert.equal(rolledBack?.updated_by, 9);
            assert.equal(
                (await repository.findSitePackageRevisionById(packageId, firstId))?.published_at,
                3_000,
                'rollback preserves the original immutable publication timestamp'
            );

            const overlappingDatabase = new Proxy(database, {
                get(target, property, receiver) {
                    if (property === 'batch') {
                        return async (): Promise<SqlResult[]> => [0, 1, 2].map(() => ({
                            results: [],
                            success: true,
                            meta: { changes: 0 }
                        }));
                    }
                    const value = Reflect.get(target, property, receiver) as unknown;
                    return typeof value === 'function' ? value.bind(target) : value;
                }
            }) as ManagedSqlDatabase;
            const overlappingRepository = new SqlSitePackageRepository(overlappingDatabase);
            const overlappingRollback = await overlappingRepository.publishSitePackageRevision(
                packageId,
                firstId,
                10,
                6_000
            );
            assert.equal(
                overlappingRollback?.operation,
                'noop',
                'a concurrent loser observes the winner current pointer as idempotent success'
            );
            assert.equal(overlappingRollback?.revision.id, firstId);

            assert.equal(
                await repository.publishSitePackageRevision(
                    packageId,
                    '44444444-4444-4444-8444-444444444444',
                    9,
                    7_000
                ),
                null
            );

            const otherPackageId = '55555555-5555-4555-8555-555555555555';
            const otherRevisionId = '66666666-6666-4666-8666-666666666666';
            await repository.createSitePackageWithRevision({
                id: otherPackageId,
                slug: 'another-site',
                title: 'Another site',
                description: '',
                createdBy: 7,
                createdAt: 7_000
            }, revision(otherPackageId, otherRevisionId, 'd'.repeat(64), 7_000));
            await assert.rejects(
                executeSql(database,
                    'UPDATE site_packages SET published_revision_id=? WHERE id=?',
                    [otherRevisionId, packageId]
                ),
                /belongs to another site package|foreign key constraint/i
            );

            const protectedRevision = await repository.deleteSitePackageRevision({
                packageId,
                revisionId: firstId,
                deletionJobId: '77777777-7777-4777-8777-777777777777',
                deletedBy: 10,
                deletedAt: 8_000
            });
            assert.equal(protectedRevision?.kind, 'published');
            assert.ok(await repository.findSitePackageRevisionById(packageId, firstId));

            const deletionJobId = '88888888-8888-4888-8888-888888888888';
            const deletedRevision = await repository.deleteSitePackageRevision({
                packageId,
                revisionId: secondId,
                deletionJobId,
                deletedBy: 10,
                deletedAt: 9_000
            });
            assert.equal(deletedRevision?.kind, 'deleted');
            assert.equal(deletedRevision?.revision.revision_number, 2);
            assert.equal(await repository.findSitePackageRevisionById(packageId, secondId), null);
            assert.equal((await repository.findSitePackageById(packageId))?.updated_by, 10);
            assert.deepEqual(
                await queryOne<{
                    resource_type: string;
                    resource_id: string;
                    target: string;
                    state: string;
                }>(database,
                    `SELECT resource_type, resource_id, target, state
             FROM object_deletion_jobs WHERE id=?`,
                    [deletionJobId]
                ),
                {
                    resource_type: 'site-package-revision',
                    resource_id: secondId,
                    target: `site-packages/${packageId}/revisions/${secondId}/`,
                    state: 'pending'
                }
            );
            assert.equal(
                await repository.deleteSitePackageRevision({
                    packageId,
                    revisionId: secondId,
                    deletionJobId: '99999999-9999-4999-8999-999999999999',
                    deletedBy: 10,
                    deletedAt: 10_000
                }),
                null
            );

            const deletedOnlyRevision = await repository.deleteSitePackageRevision({
                packageId: otherPackageId,
                revisionId: otherRevisionId,
                deletionJobId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
                deletedBy: 10,
                deletedAt: 11_000
            });
            assert.equal(deletedOnlyRevision?.kind, 'deleted');
            assert.equal(deletedOnlyRevision?.packageDeleted, true);
            assert.equal(deletedOnlyRevision?.sitePackage.slug, 'another-site');
            assert.equal(await repository.findSitePackageById(otherPackageId), null);
        });
    });
}

// site-package-routes.test.ts
{
    function assertWireContract<T>(
        schema: { parse(value: unknown): T },
        payload: unknown
    ): void {
        assert.deepEqual(schema.parse(payload), payload);
    }

    async function createArchive(): Promise<Buffer> {
        const zip = new ZipFile();
        zip.addBuffer(
            Buffer.from(
                '<!doctype html><html><head>' +
                '<link rel="icon" href="brand/site-icon.svg">' +
                '</head><body>uploaded</body></html>'
            ),
            'index.html'
        );
        zip.addBuffer(
            Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'),
            'brand/site-icon.svg'
        );
        zip.end();
        const chunks: Buffer[] = [];
        for await (const chunk of zip.outputStream as Readable) {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        return Buffer.concat(chunks);
    }

    class MemoryStorage implements ObjectStorage {
        readonly objects = new Map<string, StoredObject>();
        reads: string[] = [];
        readUrls: Array<{ key: string; method?: 'GET' | 'HEAD' }> = [];
        deletedPrefixes: string[] = [];

        async get(key: string): Promise<StoredObject | null> {
            this.reads.push(key);
            return this.objects.get(key) || null;
        }

        async createReadUrl(key: string, options: ObjectReadUrlOptions = {}) {
            this.readUrls.push({ key, method: options.method });
            return this.objects.has(key)
                ? {
                    url: `https://assets.example.test/${key}`,
                    visibility: 'public' as const
                }
                : null;
        }

        async put(
            key: string,
            body: Uint8Array,
            options: PutObjectOptions = {}
        ): Promise<StoredObject> {
            const stored = {
                body,
                size: body.byteLength,
                contentType: options.contentType || 'application/octet-stream',
                etag: `"${crypto.createHash('sha256').update(body).digest('hex')}"`,
                uploadedAt: new Date(1_000)
            };
            this.objects.set(key, stored);
            return stored;
        }

        async delete(key: string): Promise<void> {
            this.objects.delete(key);
        }

        async exists(key: string): Promise<boolean> {
            return this.objects.has(key);
        }

        async copy(sourceKey: string, destinationKey: string): Promise<void> {
            const object = this.objects.get(sourceKey);
            if (!object) throw new Error('missing source');
            this.objects.set(destinationKey, object);
        }

        async move(sourceKey: string, destinationKey: string): Promise<void> {
            await this.copy(sourceKey, destinationKey);
            await this.delete(sourceKey);
        }

        async list(prefix: string): Promise<ListedObject[]> {
            return [...this.objects.entries()]
                .filter(([key]) => key.startsWith(prefix))
                .map(([key, object]) => ({ key, size: object.size, etag: object.etag }));
        }

        async deletePrefix(prefix: string): Promise<void> {
            this.deletedPrefixes.push(prefix);
            for (const key of [...this.objects.keys()]) {
                if (key.startsWith(prefix)) this.objects.delete(key);
            }
        }
    }

    function revision(
        packageId: string,
        revisionId: string,
        token: string,
        runtimeMode: 'safe' | 'isolated-script',
        manifest: Record<string, string>,
        createdAt: number
    ) {
        const prefix = `site-packages/${packageId}/revisions/${revisionId}`;
        return {
            id: revisionId,
            packageId,
            entryPath: 'index.html',
            runtimeMode,
            state: 'ready' as const,
            fileCount: Object.keys(manifest).length,
            totalBytes: 100,
            sourceKey: `${prefix}/source.zip`,
            sourceSha256: 'c'.repeat(64),
            manifestKey: `${prefix}/manifest.json`,
            manifestJson: JSON.stringify(manifest),
            previewTokenHash: crypto.createHash('sha256').update(token).digest('hex'),
            createdBy: 1,
            createdAt
        };
    }

    describe('site package routes', () => {
        postgresTest('site-package routes share the main origin and enforce manifests, CSP, and revisions', async () => {
            const database = await createPostgresTestDatabase('site-routes');
            const repository = new SqlSitePackageRepository(database);
            const audit = new SqlAuditRepository(database);
            const storage = new MemoryStorage();
            const packageId = '11111111-1111-4111-8111-111111111111';
            const publishedId = '22222222-2222-4222-8222-222222222222';
            const previewId = '33333333-3333-4333-8333-333333333333';
            const publishedPrefix = `site-packages/${packageId}/revisions/${publishedId}`;
            const previewPrefix = `site-packages/${packageId}/revisions/${previewId}`;
            const publishedManifest = {
                'assets/favicon.svg': `${publishedPrefix}/files/assets/favicon.svg`,
                'index.html': `${publishedPrefix}/files/index.html`,
                'fonts.css': `${publishedPrefix}/files/fonts.css`,
                'hero.webp': `${publishedPrefix}/files/hero.webp`,
                'email_template.txt': `${publishedPrefix}/files/email_template.txt`,
                'leak.txt': `${publishedPrefix}/source.zip`
            };
            await repository.createSitePackageWithRevision({
                id: packageId,
                slug: 'hiro-2026',
                title: 'Hiro 2026',
                description: 'Independent package',
                createdBy: 1,
                createdAt: 1_000
            }, revision(
                packageId,
                publishedId,
                'a'.repeat(64),
                'safe',
                publishedManifest,
                1_000
            ));
            await repository.createSitePackageRevision(revision(
                packageId,
                previewId,
                'b'.repeat(64),
                'isolated-script',
                {
                    'index.html': `${previewPrefix}/files/index.html`,
                    'app.js': `${previewPrefix}/files/app.js`,
                    'preview.webp': `${previewPrefix}/files/preview.webp`
                },
                2_000
            ));
            await repository.publishSitePackageRevision(packageId, publishedId, 1, 3_000);
            await storage.put(
                `${publishedPrefix}/files/assets/favicon.svg`,
                new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>'),
                { contentType: 'image/svg+xml; charset=utf-8' }
            );
            await storage.put(
                `${publishedPrefix}/files/index.html`,
                new TextEncoder().encode(
                    '<!doctype html><html><head><style>' +
                    '@import url("assets/fonts/fonts.css"); body { color: black; }' +
                    '</style></head><body>published</body></html>'
                ),
                { contentType: 'text/html; charset=utf-8' }
            );
            await storage.put(
                `${publishedPrefix}/files/fonts.css`,
                new TextEncoder().encode([
                    '@font-face { font-family: Remote; src: url(https://fonts.example/remote.woff2); }',
                    '@font-face { font-family: Local; src: url(local.woff2); }',
                    'body { font-family: Local, sans-serif; }'
                ].join('\n')),
                { contentType: 'text/css; charset=utf-8' }
            );
            await storage.put(
                `${publishedPrefix}/files/email_template.txt`,
                new TextEncoder().encode('hello'),
                { contentType: 'text/plain; charset=utf-8' }
            );
            await storage.put(
                `${publishedPrefix}/files/hero.webp`,
                new Uint8Array([0x52, 0x49, 0x46, 0x46]),
                { contentType: 'image/webp' }
            );
            await storage.put(
                `${publishedPrefix}/source.zip`,
                new Uint8Array([0x50, 0x4b]),
                { contentType: 'application/zip' }
            );
            await storage.put(
                `${previewPrefix}/files/index.html`,
                new TextEncoder().encode(
                    '<!doctype html><html><body><script src="./app.js?v=1"></script></body></html>'
                ),
                { contentType: 'text/html; charset=utf-8' }
            );
            await storage.put(
                `${previewPrefix}/files/app.js`,
                new TextEncoder().encode('document.body.dataset.ok = "1";'),
                { contentType: 'text/javascript; charset=utf-8' }
            );
            await storage.put(
                `${previewPrefix}/files/preview.webp`,
                new Uint8Array([0x52, 0x49, 0x46, 0x46]),
                { contentType: 'image/webp' }
            );

            const runtimeServices = {
                sitePackages: repository,
                namecards: {
                    findCardByMediaUrl: async () => null
                } as unknown as NamecardRepository,
                audit,
                storage,
                objectDeletions: new PostgresqlObjectDeletionWorker(database, storage),
                uploads: new StreamingUploadParser(),
                backofficeTokens: {
                    sign: async () => 'op-token',
                    verify: async (token: string) => {
                        if (token === 'editor-token') {
                            return {
                                id: 2,
                                username: 'editor',
                                producername: 'Editor',
                                dept: 'editor',
                                csrfSecret: 'csrf'
                            };
                        }
                        if (token !== 'op-token') throw new Error('invalid token');
                        return {
                            id: 1,
                            username: 'operator',
                            producername: 'Operator',
                            dept: 'op',
                            csrfSecret: 'csrf'
                        };
                    }
                },
                config: {
                    clientAddressSource: 'direct' as const
                }
            };
            const app = createHonoApp(() => runtimeServices);
            const nginxApp = createHonoApp(() => ({
                ...runtimeServices,
                config: {
                    ...runtimeServices.config,
                    clientAddressSource: 'nginx' as const
                }
            }));
            let throwAfterPackageCommit = true;
            let throwAfterRevisionCommit = true;
            const ambiguousRepository = new Proxy(repository as SitePackageRepository, {
                get(target, property) {
                    if (property === 'createSitePackageWithRevision') {
                        return async (...args: Parameters<SitePackageRepository['createSitePackageWithRevision']>) => {
                            await target.createSitePackageWithRevision(...args);
                            if (throwAfterPackageCommit) {
                                throwAfterPackageCommit = false;
                                throw new Error('connection lost after package commit');
                            }
                        };
                    }
                    if (property === 'createSitePackageRevision') {
                        return async (...args: Parameters<SitePackageRepository['createSitePackageRevision']>) => {
                            const result = await target.createSitePackageRevision(...args);
                            if (throwAfterRevisionCommit) {
                                throwAfterRevisionCommit = false;
                                throw new Error('connection lost after revision commit');
                            }
                            return result;
                        };
                    }
                    const value = Reflect.get(target, property, target);
                    return typeof value === 'function' ? value.bind(target) : value;
                }
            });
            const ambiguousApp = createHonoApp(() => ({
                ...runtimeServices,
                sitePackages: ambiguousRepository
            }));
            const limitedApp = createHonoApp(() => ({
                ...runtimeServices,
                config: {
                    ...runtimeServices.config,
                    sitePackageMaxUploadBytes: 64
                }
            }));

            const invalidNamecardMedia = await app.request(
                'http://main.test/uploads/namecard/original/invalid%5Cname.png'
            );
            assert.equal(invalidNamecardMedia.status, 400);
            assertWireContract(mediaHttpErrorSchema, await invalidNamecardMedia.json());

            const unauthenticatedNamecardMedia = await app.request(
                'http://main.test/uploads/namecard/original/missing.png'
            );
            assert.equal(unauthenticatedNamecardMedia.status, 401);
            assertWireContract(
                mediaHttpErrorSchema,
                await unauthenticatedNamecardMedia.json()
            );

            const forbiddenNamecardMedia = await app.request(
                'http://main.test/uploads/namecard/original/missing.png',
                { headers: { authorization: 'Bearer editor-token' } }
            );
            assert.equal(forbiddenNamecardMedia.status, 403);
            assertWireContract(mediaHttpErrorSchema, await forbiddenNamecardMedia.json());

            const missingNamecardMedia = await app.request(
                'http://main.test/uploads/namecard/original/missing.png',
                { headers: { authorization: 'Bearer op-token' } }
            );
            assert.equal(missingNamecardMedia.status, 404);
            assert.equal(await missingNamecardMedia.text(), 'Not Found');

            const forwardedHeaders = {
                'x-forwarded-proto': 'http',
                'x-forwarded-host': 'main.test',
                'x-forwarded-port': '8080'
            };
            const forwardedContent = await nginxApp.request(
                `http://upstream.test/site-content/hiro-2026/${publishedId}/`,
                { headers: forwardedHeaders }
            );
            assert.equal(forwardedContent.status, 200);
            assert.equal(forwardedContent.headers.get('location'), null);
            assert.match(
                forwardedContent.headers.get('content-security-policy') || '',
                /frame-ancestors http:\/\/main\.test:8080/
            );
            assert.match(
                forwardedContent.headers.get('content-security-policy') || '',
                new RegExp(
                    `style-src http:\\/\\/main\\.test:8080\\/site-content\\/hiro-2026\\/` +
                    `${publishedId}\\/ 'unsafe-inline'`
                )
            );
            const forwardedShell = await nginxApp.request(
                'http://upstream.test/sites/hiro-2026',
                { headers: forwardedHeaders }
            );
            assert.match(
                await forwardedShell.text(),
                new RegExp(`src="http://main\\.test:8080/site-content/hiro-2026/${publishedId}/"`)
            );
            const forwardedMetadata = await nginxApp.request(
                'http://upstream.test/api/site-packages/hiro-2026',
                { headers: forwardedHeaders }
            );
            const forwardedMetadataBody = await forwardedMetadata.json();
            assertWireContract(publicSitePackageSchema, forwardedMetadataBody);
            assert.deepEqual(forwardedMetadataBody, {
                slug: 'hiro-2026',
                title: 'Hiro 2026',
                description: 'Independent package',
                revisionId: publishedId,
                revisionNumber: 1,
                runtimeMode: 'safe',
                publishedAt: 3_000,
                siteUrl: 'http://main.test:8080/sites/hiro-2026',
                contentUrl: `http://main.test:8080/site-content/hiro-2026/${publishedId}/`
            });
            assert.equal((await nginxApp.request('http://upstream.test/api/wiki/test', {
                headers: forwardedHeaders
            })).status, 200);

            assert.equal((await app.request('http://main.test/api/wiki/test')).status, 200);
            assert.equal((await app.request(
                `http://main.test/site-content/hiro-2026/${publishedId}/`,
                { method: 'POST' }
            )).status, 404);

            for (const [pathname, init] of [
                ['/api/admin/site-packages', undefined],
                ['/api/admin/site-packages', { method: 'POST' }]
            ] as const) {
                assert.equal((await app.request(`http://main.test${pathname}`, init)).status, 401);
            }
            const admin = await app.request('http://main.test/api/admin/site-packages', {
                headers: { authorization: 'Bearer op-token' }
            });
            assert.equal(admin.status, 200);
            const adminBody = await admin.json();
            assertWireContract(sitePackageListSchema, adminBody);
            assert.equal(adminBody.packages[0].revisions.length, 2);
            const serializedAdmin = JSON.stringify(adminBody);
            for (const privateField of [
                'source_key',
                'manifest_key',
                'manifest_json',
                'preview_token_hash'
            ]) {
                assert.doesNotMatch(serializedAdmin, new RegExp(privateField));
            }

            const keysBeforeDuplicate = new Set(storage.objects.keys());
            const duplicateUpload = new FormData();
            duplicateUpload.set('slug', 'hiro-2026');
            duplicateUpload.set('title', 'Duplicate');
            duplicateUpload.set('description', 'Must roll back objects');
            duplicateUpload.set('entryPath', 'index.html');
            duplicateUpload.set('runtimeMode', 'safe');
            const archive = await createArchive();
            const archiveBytes = new Uint8Array(archive.byteLength);
            archiveBytes.set(archive);

            const limitedUpload = new FormData();
            limitedUpload.set('slug', 'too-large-for-config');
            limitedUpload.set('title', 'Too large');
            limitedUpload.set('entryPath', 'index.html');
            limitedUpload.set('runtimeMode', 'safe');
            limitedUpload.set(
                'archive',
                new Blob([archiveBytes], { type: 'application/zip' }),
                'too-large.zip'
            );
            const objectsBeforeLimit = storage.objects.size;
            const limited = await limitedApp.request('http://main.test/api/admin/site-packages', {
                method: 'POST',
                headers: { authorization: 'Bearer op-token' },
                body: limitedUpload
            });
            assert.equal(limited.status, 413, await limited.text());
            assert.equal(storage.objects.size, objectsBeforeLimit);

            duplicateUpload.set(
                'archive',
                new Blob([archiveBytes], { type: 'application/zip' }),
                'duplicate.zip'
            );
            const duplicate = await app.request('http://main.test/api/admin/site-packages', {
                method: 'POST',
                headers: { authorization: 'Bearer op-token' },
                body: duplicateUpload
            });
            assert.equal(duplicate.status, 409, await duplicate.text());
            assert.deepEqual(
                new Set(storage.objects.keys()),
                keysBeforeDuplicate,
                'database conflicts clean every immutable object written for the failed revision'
            );

            const ambiguousUpload = new FormData();
            ambiguousUpload.set('slug', 'commit-confirmed');
            ambiguousUpload.set('title', 'Commit confirmed');
            ambiguousUpload.set('entryPath', 'index.html');
            ambiguousUpload.set('runtimeMode', 'safe');
            ambiguousUpload.set(
                'archive',
                new Blob([archiveBytes], { type: 'application/zip' }),
                'confirmed.zip'
            );
            const ambiguousCreate = await ambiguousApp.request(
                'http://main.test/api/admin/site-packages',
                {
                    method: 'POST',
                    headers: { authorization: 'Bearer op-token' },
                    body: ambiguousUpload
                }
            );
            assert.equal(ambiguousCreate.status, 201);
            const ambiguousCreateBody = await ambiguousCreate.json();
            assertWireContract(sitePackageCreateResultSchema, ambiguousCreateBody);
            const committedFirstRevision = await repository.findSitePackageRevisionById(
                ambiguousCreateBody.packageId,
                ambiguousCreateBody.revisionId
            );
            assert.ok(committedFirstRevision);
            assert.equal(await storage.exists(committedFirstRevision.source_key), true);
            assert.equal(await storage.exists(committedFirstRevision.manifest_key), true);
            assert.deepEqual(JSON.parse(committedFirstRevision.manifest_json), {
                schemaVersion: 1,
                iconPath: 'brand/site-icon.svg',
                entries: {
                    'brand/site-icon.svg': `site-packages/${ambiguousCreateBody.packageId}/revisions/` +
                        `${ambiguousCreateBody.revisionId}/files/brand/site-icon.svg`,
                    'index.html': `site-packages/${ambiguousCreateBody.packageId}/revisions/` +
                        `${ambiguousCreateBody.revisionId}/files/index.html`
                }
            });
            const committedPreviewBase =
                `http://main.test/site-content/_preview/${ambiguousCreateBody.previewToken}/`;
            const committedPreview = await ambiguousApp.request(committedPreviewBase);
            assert.equal(committedPreview.status, 200);
            assert.match(await committedPreview.text(), /uploaded/);
            const committedPreviewIcon = await ambiguousApp.request(
                `${committedPreviewBase}brand/site-icon.svg`
            );
            assert.equal(committedPreviewIcon.status, 200);
            assert.equal(
                committedPreviewIcon.headers.get('content-type'),
                'image/svg+xml; charset=utf-8'
            );

            const ambiguousRevisionUpload = new FormData();
            ambiguousRevisionUpload.set('entryPath', 'index.html');
            ambiguousRevisionUpload.set('runtimeMode', 'safe');
            ambiguousRevisionUpload.set(
                'archive',
                new Blob([archiveBytes], { type: 'application/zip' }),
                'confirmed-revision.zip'
            );
            const ambiguousRevision = await ambiguousApp.request(
                `http://main.test/api/admin/site-packages/${ambiguousCreateBody.packageId}/revisions`,
                {
                    method: 'POST',
                    headers: { authorization: 'Bearer op-token' },
                    body: ambiguousRevisionUpload
                }
            );
            assert.equal(ambiguousRevision.status, 201);
            const ambiguousRevisionBody = await ambiguousRevision.json();
            assertWireContract(sitePackageCreateRevisionResultSchema, ambiguousRevisionBody);
            assert.equal(ambiguousRevisionBody.revision.revisionNumber, 2);
            const committedSecondRevision = await repository.findSitePackageRevisionById(
                ambiguousCreateBody.packageId,
                ambiguousRevisionBody.revision.id
            );
            assert.ok(committedSecondRevision);
            assert.equal(await storage.exists(committedSecondRevision.source_key), true);
            assert.equal(await storage.exists(committedSecondRevision.manifest_key), true);

            const metadata = await app.request('http://main.test/api/site-packages/hiro-2026');
            assert.equal(metadata.status, 200);
            const metadataBody = await metadata.json();
            assertWireContract(publicSitePackageSchema, metadataBody);
            assert.equal(metadataBody.revisionId, publishedId);
            assert.equal(metadataBody.siteUrl, 'http://main.test/sites/hiro-2026');
            assert.equal(
                metadataBody.contentUrl,
                `http://main.test/site-content/hiro-2026/${publishedId}/`
            );
            const stable = await app.request('http://main.test/sites/hiro-2026');
            assert.equal(stable.status, 200);
            const stableHtml = await stable.text();
            assert.match(
                stableHtml,
                new RegExp(`src="http://main\\.test/site-content/hiro-2026/${publishedId}/"`)
            );
            assert.match(
                stableHtml,
                new RegExp(
                    `rel="icon" href="https://assets\\.example\\.test/${publishedPrefix}/` +
                    'files/assets/favicon\\.svg"'
                )
            );
            assert.match(stableHtml, /<nav aria-label="站点导航">/);
            assert.match(
                stableHtml,
                /<a class="site-return" href="\/" aria-label="返回 IMSWeb 主站"/
            );
            assert.match(stableHtml, /bottom: max\(12px, env\(safe-area-inset-bottom\)\);/);
            assert.match(stableHtml, /left: env\(safe-area-inset-left, 0px\);/);
            assert.doesNotMatch(stableHtml, /top: 50%;|translateY\(-50%\)/);
            assert.match(stableHtml, /@media \(hover: hover\) and \(pointer: fine\)/);
            assert.match(stableHtml, /@media \(prefers-reduced-motion: reduce\)/);
            assert.match(stableHtml, /iframe \{ display: block; width: 100%; height: 100%; height: 100dvh;/);
            assert.doesNotMatch(stableHtml, /<header>/);
            assert.match(stable.headers.get('content-security-policy') || '',
                /frame-src http:\/\/main\.test/);
            assert.match(stable.headers.get('content-security-policy') || '',
                /img-src https:\/\/assets\.example\.test/);
            assert.equal(stable.headers.get('x-frame-options'), 'DENY');

            const published = await app.request(
                `http://main.test/site-content/hiro-2026/${publishedId}/`
            );
            assert.equal(published.status, 200);
            const publishedText = await published.text();
            assert.match(publishedText, /published/);
            assert.match(publishedText, /body \{ color: black; \}/);
            assert.doesNotMatch(publishedText, /fonts\/fonts\.css|@import/);
            assert.equal(published.headers.get('cache-control'), 'public, max-age=0, must-revalidate');
            assert.equal(published.headers.get('x-frame-options'), null);
            assert.equal(published.headers.get('access-control-allow-origin'), 'null');
            assert.match(published.headers.get('content-security-policy') || '', /script-src 'none'/);
            assert.match(published.headers.get('content-security-policy') || '', /connect-src 'none'/);
            assert.match(published.headers.get('content-security-policy') || '', /frame-ancestors http:\/\/main\.test/);
            assert.match(
                published.headers.get('content-security-policy') || '',
                new RegExp(
                    `img-src http:\\/\\/main\\.test\\/site-content\\/hiro-2026\\/` +
                    `${publishedId}\\/ data: https:\\/\\/assets\\.example\\.test`
                )
            );
            assert.doesNotMatch(published.headers.get('content-security-policy') || '', /'self'/);

            const stylesheet = await app.request(
                `http://main.test/site-content/hiro-2026/${publishedId}/fonts.css?v=20260813-34`
            );
            const stylesheetText = await stylesheet.text();
            assert.equal(stylesheet.status, 200);
            assert.equal(stylesheet.headers.get('content-type'), 'text/css; charset=utf-8');
            assert.equal(stylesheet.headers.get('cache-control'), 'public, max-age=31536000, immutable');
            assert.doesNotMatch(stylesheetText, /fonts\.example|font-family: Remote/);
            assert.match(stylesheetText, /font-family: Local|url\(local\.woff2\)/);
            assert.equal(
                stylesheet.headers.get('content-length'),
                String(new TextEncoder().encode(stylesheetText).byteLength)
            );

            const textAsset = await app.request(
                `http://main.test/site-content/hiro-2026/${publishedId}/email_template.txt`
            );
            assert.equal(textAsset.status, 200);
            assert.equal(await textAsset.text(), 'hello');

            const readsBeforeDirectAsset = storage.reads.length;
            const directAssetUrl =
                `http://main.test/site-content/hiro-2026/${publishedId}/hero.webp`;
            const directAsset = await app.request(directAssetUrl);
            assert.equal(directAsset.status, 307);
            assert.equal(
                directAsset.headers.get('location'),
                `https://assets.example.test/${publishedPrefix}/files/hero.webp`
            );
            assert.equal(
                directAsset.headers.get('cache-control'),
                'public, max-age=31536000, immutable'
            );
            assert.equal(directAsset.headers.get('access-control-allow-origin'), 'null');
            assert.equal(storage.reads.length, readsBeforeDirectAsset);
            const directAssetHead = await app.request(directAssetUrl, { method: 'HEAD' });
            assert.equal(directAssetHead.status, 307);
            assert.deepEqual(storage.readUrls.slice(-2).map((call) => call.method), ['GET', 'HEAD']);

            const readsBeforeDenials = storage.reads.length;
            for (const pathname of [
                `/site-content/hiro-2026/${publishedId}/source.zip`,
                `/site-content/hiro-2026/${publishedId}/manifest.json`,
                `/site-content/hiro-2026/${publishedId}/leak.txt`,
                `/site-content/hiro-2026/${publishedId}/%252e%252e/source.zip`
            ]) {
                const denied = await app.request(`http://main.test${pathname}`);
                assert.notEqual(denied.status, 200, pathname);
            }
            assert.equal(storage.reads.length, readsBeforeDenials, 'denied paths do not reach storage');

            const preview = await app.request(
                `http://main.test/site-content/_preview/${'b'.repeat(64)}/`
            );
            assert.equal(preview.status, 200);
            assert.equal(preview.headers.get('cache-control'), 'private, no-store');
            assert.equal(preview.headers.get('access-control-allow-origin'), 'null');
            const previewCsp = preview.headers.get('content-security-policy') || '';
            assert.match(
                previewCsp,
                new RegExp(
                    `script-src http:\\/\\/main\\.test\\/site-content\\/_preview\\/` +
                    `${'b'.repeat(64)}\\/ 'unsafe-inline'`
                )
            );
            assert.match(
                previewCsp,
                new RegExp(
                    `style-src http:\\/\\/main\\.test\\/site-content\\/_preview\\/` +
                    `${'b'.repeat(64)}\\/ 'unsafe-inline'`
                )
            );
            assert.match(
                previewCsp,
                new RegExp(
                    `connect-src http://main.test/site-content/_preview/` +
                    `${'b'.repeat(64)}/`
                )
            );
            assert.match(previewCsp, /sandbox allow-scripts/);
            assert.doesNotMatch(
                previewCsp,
                /'self'|allow-same-origin|allow-forms|allow-top-navigation/
            );
            const previewScript = await app.request(
                `http://main.test/site-content/_preview/${'b'.repeat(64)}/app.js?v=20260813-26`
            );
            assert.equal(previewScript.status, 200);
            assert.equal(
                previewScript.headers.get('content-type'),
                'text/javascript; charset=utf-8'
            );
            assert.equal(await previewScript.text(), 'document.body.dataset.ok = "1";');
            assert.equal(previewScript.headers.get('access-control-allow-origin'), 'null');
            assert.equal(previewScript.headers.get('content-security-policy'), previewCsp);
            const previewAsset = await app.request(
                `http://main.test/site-content/_preview/${'b'.repeat(64)}/preview.webp`
            );
            assert.equal(previewAsset.status, 200);
            assert.equal(previewAsset.headers.get('cache-control'), 'private, no-store');
            assert.equal(previewAsset.headers.get('access-control-allow-origin'), 'null');
            assert.equal(previewAsset.headers.get('location'), null);

            const rotated = await app.request(
                `http://main.test/api/admin/site-packages/${packageId}/revisions/${previewId}/preview-token`,
                { method: 'POST', headers: { authorization: 'Bearer op-token' } }
            );
            assert.equal(rotated.status, 200);
            const rotatedBody = await rotated.json();
            assertWireContract(sitePackagePreviewResultSchema, rotatedBody);
            assert.match(rotatedBody.previewToken, /^[a-f0-9]{64}$/);
            assert.equal(
                rotatedBody.previewUrl,
                `http://main.test/site-content/_preview/${rotatedBody.previewToken}/`
            );
            assert.equal((await app.request(
                `http://main.test/site-content/_preview/${'b'.repeat(64)}/`
            )).status, 404, 'rotating a token invalidates the previous bearer URL');
            assert.equal((await app.request(rotatedBody.previewUrl)).status, 200);

            const publishSecond = await app.request(
                `http://main.test/api/admin/site-packages/${packageId}/revisions/${previewId}/publish`,
                { method: 'POST', headers: { authorization: 'Bearer op-token' } }
            );
            assert.equal(publishSecond.status, 200);
            const publishSecondBody = await publishSecond.json();
            assertWireContract(sitePackagePublishResultSchema, publishSecondBody);
            assert.equal(publishSecondBody.operation, 'publish');
            assert.equal(
                publishSecondBody.publishedAt,
                (await repository.findSitePackageRevisionById(packageId, previewId))?.published_at
            );
            assert.equal((await audit.listRecentAuditLogs(1))[0]?.action, '发布站点包版本');
            const readsBeforeOldRevision = storage.reads.length;
            assert.equal((await app.request(
                `http://main.test/site-content/hiro-2026/${publishedId}/`
            )).status, 404, 'a historical revision is not a public content URL');
            assert.equal(storage.reads.length, readsBeforeOldRevision);
            assert.equal((await app.request(
                `http://main.test/site-content/hiro-2026/${previewId}/`
            )).status, 200);
            assert.equal((await app.request(
                `http://main.test/site-content/_preview/${'a'.repeat(64)}/`
            )).status, 200, 'historical revisions remain available through their preview token');
            assert.match(
                await (await app.request('http://main.test/sites/hiro-2026')).text(),
                new RegExp(`/site-content/hiro-2026/${previewId}/`)
            );

            const rollback = await app.request(
                `http://main.test/api/admin/site-packages/${packageId}/revisions/${publishedId}/publish`,
                { method: 'POST', headers: { authorization: 'Bearer op-token' } }
            );
            assert.equal(rollback.status, 200);
            const rollbackBody = await rollback.json();
            assertWireContract(sitePackagePublishResultSchema, rollbackBody);
            assert.equal(rollbackBody.operation, 'rollback');
            assert.equal(rollbackBody.publishedAt, 3_000);
            assert.equal((await audit.listRecentAuditLogs(1))[0]?.action, '回滚站点包版本');
            assert.equal((await app.request(
                `http://main.test/site-content/hiro-2026/${previewId}/`
            )).status, 404);
            assert.equal((await app.request(
                `http://main.test/site-content/hiro-2026/${publishedId}/`
            )).status, 200);
            assert.match(
                await (await app.request('http://main.test/sites/hiro-2026')).text(),
                new RegExp(`/site-content/hiro-2026/${publishedId}/`)
            );

            const auditCountBeforeFailedPublish = (await audit.listRecentAuditLogs(100)).length;
            const failedPublish = await app.request(
                `/api/admin/site-packages/${packageId}/revisions/` +
                '44444444-4444-4444-8444-444444444444/publish',
                { method: 'POST', headers: { authorization: 'Bearer op-token' } }
            );
            assert.equal(failedPublish.status, 404);
            assert.equal(
                (await audit.listRecentAuditLogs(100)).length,
                auditCountBeforeFailedPublish,
                'a failed publication must not append an audit record'
            );

            const deletePublished = await app.request(
                `http://main.test/api/admin/site-packages/${packageId}/revisions/${publishedId}`,
                { method: 'DELETE', headers: { authorization: 'Bearer op-token' } }
            );
            assert.equal(deletePublished.status, 409);
            const deletePublishedBody = await deletePublished.json();
            assertWireContract(sitePackageErrorResponseSchema, deletePublishedBody);
            assert.deepEqual(deletePublishedBody, {
                error: '当前线上版本不能删除，请先发布其他版本'
            });
            assert.equal(
                (await queryOne<{ count: number }>(database,
                    'SELECT COUNT(*) AS count FROM object_deletion_jobs'
                ))?.count,
                0,
                'a protected publication must not enqueue object deletion'
            );

            const unauthorizedDelete = await app.request(
                `http://main.test/api/admin/site-packages/${packageId}/revisions/${previewId}`,
                { method: 'DELETE' }
            );
            assert.equal(unauthorizedDelete.status, 401);
            const historicalObject = `${previewPrefix}/files/app.js`;
            assert.equal(await storage.exists(historicalObject), true);
            const deleted = await app.request(
                `http://main.test/api/admin/site-packages/${packageId}/revisions/${previewId}`,
                { method: 'DELETE', headers: { authorization: 'Bearer op-token' } }
            );
            assert.equal(deleted.status, 200);
            const deletedBody = await deleted.json();
            assertWireContract(sitePackageDeleteRevisionResultSchema, deletedBody);
            assert.deepEqual(deletedBody, {
                success: true,
                packageId,
                revisionId: previewId,
                revisionNumber: 2,
                packageDeleted: false,
                objectCleanup: 'queued'
            });
            assert.equal(await repository.findSitePackageRevisionById(packageId, previewId), null);
            assert.equal(await storage.exists(historicalObject), true, 'request only commits the outbox job');
            const deletionAudit = (await audit.listRecentAuditLogs(1))[0];
            assert.equal(deletionAudit?.action, '删除站点包历史版本');
            assert.equal(deletionAudit?.target, 'hiro-2026#2');
            assert.equal(
                (await queryOne<{ state: string }>(database,
                    'SELECT state FROM object_deletion_jobs WHERE resource_id=?',
                    [previewId]
                ))?.state,
                'pending'
            );

            const refreshedAfterDelete = await app.request(
                'http://main.test/api/admin/site-packages',
                { headers: { authorization: 'Bearer op-token' } }
            );
            assert.equal(refreshedAfterDelete.status, 200);
            assert.equal((await refreshedAfterDelete.json()).packages[0].revisions.length, 1);
            assert.equal(await storage.exists(historicalObject), false);
            assert.deepEqual(storage.deletedPrefixes, [`${previewPrefix}/`]);
            assert.equal(
                (await queryOne<{ state: string }>(database,
                    'SELECT state FROM object_deletion_jobs WHERE resource_id=?',
                    [previewId]
                ))?.state,
                'completed'
            );
            assert.equal((await app.request(rotatedBody.previewUrl)).status, 404);
            assert.equal((await app.request(
                `http://main.test/api/admin/site-packages/${packageId}/revisions/${previewId}`,
                { method: 'DELETE', headers: { authorization: 'Bearer op-token' } }
            )).status, 404);

            const head = await app.request(
                `http://main.test/site-content/hiro-2026/${publishedId}/`,
                { method: 'HEAD' }
            );
            assert.equal(head.status, 200);
            assert.equal(await head.text(), '');
        });
    });
}
