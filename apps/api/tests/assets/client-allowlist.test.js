'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');
const { brotliDecompressSync, gunzipSync } = require('node:zlib');

const PACKAGE_ROOT = path.resolve(__dirname, '../..');
const REPOSITORY_ROOT = path.resolve(PACKAGE_ROOT, '../..');
const WEB_ROOT = path.join(REPOSITORY_ROOT, 'apps/web/build/client');
const CLIENT_ROOT = path.join(PACKAGE_ROOT, 'dist/client');
const NODE_CLIENT_ROOT = path.join(PACKAGE_ROOT, 'dist/node-client');
const BUILD_SCRIPT = path.join(PACKAGE_ROOT, 'scripts/build/build-client.js');
const CHECK_SCRIPT = path.join(PACKAGE_ROOT, 'scripts/build/check-client.js');
const MANIFEST_PATH = path.join(PACKAGE_ROOT, 'dist/client-manifest.json');

function walk(directory, root = directory) {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const absolute = path.join(directory, entry.name);
        assert.equal(entry.isSymbolicLink(), false, `symlink in build output: ${absolute}`);
        if (entry.isDirectory()) return walk(absolute, root);
        assert.equal(entry.isFile(), true, `non-file in build output: ${absolute}`);
        return [path.relative(root, absolute).split(path.sep).join('/').normalize('NFC')];
    });
}

function run(script, environment = process.env) {
    return spawnSync(process.execPath, [script], {
        cwd: PACKAGE_ROOT,
        env: environment,
        encoding: 'utf8'
    });
}

test('[AST-01] release clients package the Web build and encoded variants', () => {
    assert.ok(fs.existsSync(path.join(WEB_ROOT, 'index.html')), 'Web build must run first');

    const build = run(BUILD_SCRIPT);
    assert.equal(build.status, 0, build.stderr);
    const check = run(CHECK_SCRIPT);
    assert.equal(check.status, 0, check.stderr);

    const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
    assert.equal(manifest.version, 1);
    assert.equal(manifest.source, '@imsweb/web');
    assert.deepEqual(manifest.files, [...manifest.files].sort((left, right) =>
        Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'))
    ));
    const webFiles = walk(WEB_ROOT).sort();
    assert.deepEqual(
        manifest.files.filter((file) => !file.endsWith('.br') && !file.endsWith('.gz')),
        webFiles
    );
    assert.deepEqual(walk(CLIENT_ROOT).sort(), manifest.files);
    assert.deepEqual(walk(NODE_CLIENT_ROOT).sort(), manifest.files);
    assert.ok(manifest.files.includes('index.html'));
    assert.ok(manifest.files.includes('__spa-fallback.html'));
    assert.ok(manifest.files.includes('index.html.br'));
    assert.ok(manifest.files.includes('index.html.gz'));

    for (const relative of manifest.files) {
        assert.deepEqual(
            fs.readFileSync(path.join(CLIENT_ROOT, relative)),
            fs.readFileSync(path.join(NODE_CLIENT_ROOT, relative)),
            relative
        );
    }
    for (const relative of manifest.files.filter((file) => file.endsWith('.br'))) {
        const sourceRelative = relative.slice(0, -3);
        assert.deepEqual(
            brotliDecompressSync(fs.readFileSync(path.join(CLIENT_ROOT, relative))),
            fs.readFileSync(path.join(CLIENT_ROOT, sourceRelative)),
            relative
        );
    }
    for (const relative of manifest.files.filter((file) => file.endsWith('.gz'))) {
        const sourceRelative = relative.slice(0, -3);
        assert.deepEqual(
            gunzipSync(fs.readFileSync(path.join(CLIENT_ROOT, relative))),
            fs.readFileSync(path.join(CLIENT_ROOT, sourceRelative)),
            relative
        );
    }
});

test('[AST-01] client check rejects missing and extra release files', () => {
    const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
    const heldRelative = manifest.files.find((file) => file.startsWith('assets/'));
    assert.ok(heldRelative, 'fixture requires a compiled asset');
    const heldFile = path.join(NODE_CLIENT_ROOT, heldRelative);
    const temporaryFile = `${heldFile}.held`;
    fs.renameSync(heldFile, temporaryFile);
    try {
        const result = run(CHECK_SCRIPT);
        assert.notEqual(result.status, 0);
        assert.match(`${result.stdout}\n${result.stderr}`, /"missing"/);
    } finally {
        fs.renameSync(temporaryFile, heldFile);
    }

    const extraFile = path.join(CLIENT_ROOT, '__unexpected__.html');
    fs.writeFileSync(extraFile, '<!doctype html>', { flag: 'wx' });
    try {
        const result = run(CHECK_SCRIPT);
        assert.notEqual(result.status, 0);
        assert.match(`${result.stdout}\n${result.stderr}`, /"extra"/);
    } finally {
        fs.rmSync(extraFile, { force: true });
    }
});

test('[AST-01] custom client verification stays manifest-closed', () => {
    const clean = run(CHECK_SCRIPT, {
        ...process.env,
        IMS_CLIENT_OUTPUT_DIR: CLIENT_ROOT
    });
    assert.equal(clean.status, 0, clean.stderr);
});
