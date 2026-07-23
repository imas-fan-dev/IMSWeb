'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const {
    buildManifest,
    mergeManifests,
    verifyLocalObjects
} = require('../../scripts/migration/r2-manifest');

function pngFixture() {
    return Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3
    ]);
}

test('[R2-01] strict manifest rejects transient directories and symlinks', (context) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ims-r2-contract-'));
    try {
        fs.writeFileSync(path.join(root, 'valid.png'), pngFixture());
        for (const directory of ['.staging', '.trash']) {
            fs.mkdirSync(path.join(root, directory));
            fs.writeFileSync(path.join(root, directory, 'partial.png'), pngFixture());
        }
        try {
            fs.symlinkSync(path.join(root, 'valid.png'), path.join(root, 'link.png'));
        } catch (error) {
            context.skip(`symbolic links unavailable: ${error.message}`);
            return;
        }

        const { manifest, errors } = buildManifest(root, { runId: 'strict-fixture' });
        assert.deepEqual(manifest.entries.map((entry) => entry.oldPath), ['valid.png']);
        assert.deepEqual(new Set(errors.map((error) => error.code)), new Set([
            'symlink',
            'work-directory'
        ]));
        assert.equal(errors.filter((error) => error.code === 'work-directory').length, 2);

        const entry = manifest.entries[0];
        assert.equal(entry.runId, 'strict-fixture');
        assert.equal(entry.bytes, pngFixture().byteLength);
        assert.equal(entry.mime, 'image/png');
        assert.equal(entry.sha256, crypto.createHash('sha256').update(pngFixture()).digest('hex'));
        assert.match(entry.objectKey, /^objects\/[a-f0-9]{64}$/);
        assert.ok(Buffer.byteLength(entry.objectKey, 'utf8') <= 1024);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('[R2-01] NFC-equivalent source paths are treated as a collision', (context) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ims-r2-unicode-'));
    const rootBuffer = Buffer.from(fs.realpathSync.native(root));
    const nfd = Buffer.from('e\u0301.png');
    const nfc = Buffer.from('\u00e9.png');
    const body = pngFixture();
    const originalReaddir = fs.readdirSync;
    const originalLstat = fs.lstatSync;
    const originalRead = fs.readFileSync;
    const fakeStat = (inode) => ({
        dev: 1n,
        ino: BigInt(inode),
        size: BigInt(body.byteLength),
        mtimeNs: 1n,
        isSymbolicLink: () => false,
        isDirectory: () => false,
        isFile: () => true
    });

    context.mock.method(fs, 'readdirSync', (target, options) => {
        if (Buffer.isBuffer(target) && target.equals(rootBuffer)) {
            return [
                { name: nfd },
                { name: nfc }
            ];
        }
        return originalReaddir(target, options);
    });
    context.mock.method(fs, 'lstatSync', (target, options) => {
        if (Buffer.isBuffer(target) && target.subarray(-nfd.length).equals(nfd)) return fakeStat(1);
        if (Buffer.isBuffer(target) && target.subarray(-nfc.length).equals(nfc)) return fakeStat(2);
        return originalLstat(target, options);
    });
    context.mock.method(fs, 'readFileSync', (target, options) => {
        if (Buffer.isBuffer(target)) return body;
        return originalRead(target, options);
    });

    try {
        const { manifest, errors } = buildManifest(root, { runId: 'unicode-fixture' });
        assert.equal(manifest.entries.length, 1);
        assert.equal(errors.length, 1);
        assert.equal(errors[0].code, 'unicode-normalization-collision');
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('[R2-01] verification rejects overlong keys and checks every object digest', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ims-r2-verify-'));
    const source = path.join(root, 'source');
    const objects = path.join(root, 'objects');
    fs.mkdirSync(source);
    try {
        fs.writeFileSync(path.join(source, 'one.png'), pngFixture());
        fs.writeFileSync(path.join(source, 'two.png'), Buffer.concat([pngFixture(), Buffer.from([4])]));
        const { manifest, errors } = buildManifest(source, { runId: 'verify-fixture' });
        assert.deepEqual(errors, []);

        for (const entry of manifest.entries) {
            const destination = path.join(objects, entry.objectKey);
            fs.mkdirSync(path.dirname(destination), { recursive: true });
            fs.copyFileSync(path.join(source, entry.oldPath), destination);
        }
        assert.deepEqual(verifyLocalObjects(manifest, objects), []);

        const changed = manifest.entries[1];
        fs.appendFileSync(path.join(objects, changed.objectKey), 'changed');
        const differences = verifyLocalObjects(manifest, objects);
        assert.equal(differences.length, 1);
        assert.equal(differences[0].objectKey, changed.objectKey);

        const extra = path.join(objects, 'objects', 'unexpected');
        fs.writeFileSync(extra, 'extra');
        const withExtra = verifyLocalObjects(manifest, objects);
        assert.ok(withExtra.some((difference) =>
            difference.objectKey === 'objects/unexpected' && difference.error === 'unexpected target object'
        ));

        const overlongKey = 'x'.repeat(1025);
        const rejected = verifyLocalObjects({
            entries: [{ objectKey: overlongKey, bytes: 0, sha256: '0'.repeat(64) }]
        }, objects);
        assert.ok(rejected.some((difference) => difference.objectKey === overlongKey));
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('[R2-01] selected-file manifest includes both Unity data files and excludes sibling bundles', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ims-r2-unity-'));
    try {
        for (const directory of ['Build', 'BuildMobile']) {
            fs.mkdirSync(path.join(root, directory));
            fs.writeFileSync(path.join(root, directory, 'webgame.data'), Buffer.from(`${directory}-data`));
            fs.writeFileSync(path.join(root, directory, 'webgame.wasm'), Buffer.from(`${directory}-wasm`));
        }
        const result = buildManifest(root, {
            runId: 'unity-data-run',
            logicalPrefix: 'runninggame',
            includePaths: ['Build/webgame.data', 'BuildMobile/webgame.data']
        });

        assert.deepEqual(result.errors, []);
        assert.deepEqual(result.manifest.scopes, ['runninggame']);
        assert.deepEqual(result.manifest.entries.map((entry) => entry.logicalKey), [
            'runninggame/Build/webgame.data',
            'runninggame/BuildMobile/webgame.data'
        ]);
        assert.ok(result.manifest.entries.every((entry) => entry.mime === 'application/octet-stream'));

        const missing = buildManifest(root, {
            runId: 'unity-missing-run',
            logicalPrefix: 'runninggame',
            includePaths: ['Build/webgame.data', 'BuildMobile/missing.data']
        });
        assert.ok(missing.errors.some((error) => error.code === 'selected-file-missing'));
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('[R2-01] manifest and merge ordering is UTF-8 lexical and locale independent', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ims-r2-order-'));
    const upper = path.join(root, 'upper');
    const lower = path.join(root, 'lower');
    fs.mkdirSync(upper);
    fs.mkdirSync(lower);
    try {
        fs.writeFileSync(path.join(upper, 'Z.png'), pngFixture());
        fs.writeFileSync(path.join(upper, 'a.png'), pngFixture());
        fs.writeFileSync(path.join(lower, 'one.png'), pngFixture());
        const upperManifest = buildManifest(upper, {
            runId: 'deterministic-order',
            logicalPrefix: 'Z-scope'
        });
        const lowerManifest = buildManifest(lower, {
            runId: 'deterministic-order',
            logicalPrefix: 'a-scope'
        });
        assert.deepEqual(
            upperManifest.manifest.entries.map((entry) => entry.oldPath),
            ['Z.png', 'a.png']
        );
        const merged = mergeManifests([lowerManifest, upperManifest]);
        assert.deepEqual(merged.scopes, ['Z-scope', 'a-scope']);
        assert.deepEqual(merged.entries.map((entry) => entry.logicalKey), [
            'Z-scope/Z.png',
            'Z-scope/a.png',
            'a-scope/one.png'
        ]);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});
