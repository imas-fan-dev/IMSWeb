import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import test from 'node:test';
import { ZipFile } from 'yazl';
import {
    parseSitePackageArchive,
    SITE_PACKAGE_ARCHIVE_LIMITS,
    SitePackageArchiveError
} from '@/domains/delivery/site-packages/package-archive';

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

test('parses a hiro-like isolated package into an immutable manifest', async () => {
    const archive = await createArchive([
        { path: 'assets/', directory: true },
        {
            path: 'hiro2026.html',
            body: Buffer.from(`<!doctype html><html><head>
                <link rel="stylesheet" href="assets/site.css">
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
