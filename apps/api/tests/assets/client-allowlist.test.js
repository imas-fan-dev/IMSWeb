'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');

const PROJECT_ROOT = path.resolve(__dirname, '../..');
const REPOSITORY_ROOT = path.resolve(PROJECT_ROOT, '../..');
const CLIENT_ROOT = path.join(PROJECT_ROOT, 'dist/client');
const NODE_CLIENT_ROOT = path.join(PROJECT_ROOT, 'dist/node-client');
const BUILD_SCRIPT = path.join(PROJECT_ROOT, 'scripts/build/build-client.js');
const CHECK_SCRIPT = path.join(PROJECT_ROOT, 'scripts/build/check-client.js');
const SOURCE_ALLOWLIST_PATH = path.join(PROJECT_ROOT, 'scripts/build/client-allowlist.json');
const WORKER_BUNDLE_SCRIPT = path.join(
    PROJECT_ROOT,
    'scripts/build/check-worker-bundle.js'
);
const ALLOWLIST_PATH = path.join(PROJECT_ROOT, 'dist/client-allowlist.json');
const R2_ASSETS_PATH = path.join(PROJECT_ROOT, 'dist/client-r2-assets.json');
const LEGACY_PUBLIC_ROOT = path.join(REPOSITORY_ROOT, 'apps/legacy/public');
const { stageClientAssets } = require(WORKER_BUNDLE_SCRIPT);

function walk(directory, root = directory) {
    const files = [];
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const absolute = path.join(directory, entry.name);
        assert.equal(entry.isSymbolicLink(), false, `symlink in client output: ${absolute}`);
        if (entry.isDirectory()) files.push(...walk(absolute, root));
        else files.push(path.relative(root, absolute).split(path.sep).join('/').normalize('NFC'));
    }
    return files;
}

function sha256(file) {
    const hash = crypto.createHash('sha256');
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    const descriptor = fs.openSync(file, 'r');
    try {
        let bytesRead;
        while ((bytesRead = fs.readSync(descriptor, buffer, 0, buffer.length, null)) > 0) {
            hash.update(buffer.subarray(0, bytesRead));
        }
    } finally {
        fs.closeSync(descriptor);
    }
    return hash.digest('hex');
}

test('[AST-01] reviewed paths match exact NFC bytes in the Git index', () => {
    const allowlist = JSON.parse(fs.readFileSync(SOURCE_ALLOWLIST_PATH, 'utf8')).files;
    const listed = spawnSync('git', ['ls-files', '-z', '--', 'apps/legacy/public'], {
        cwd: REPOSITORY_ROOT,
        encoding: 'buffer'
    });
    assert.equal(listed.status, 0, listed.stderr.toString('utf8'));

    const trackedPathBytes = new Set(
        listed.stdout
            .subarray(0, listed.stdout.length - (listed.stdout.at(-1) === 0 ? 1 : 0))
            .toString('binary')
            .split('\0')
            .map((value) => Buffer.from(value, 'binary').toString('hex'))
    );

    for (const key of allowlist) {
        assert.equal(key, key.normalize('NFC'), `allowlist path is not NFC: ${JSON.stringify(key)}`);
        const gitPathBytes = Buffer.from(`apps/legacy/public/${key}`, 'utf8').toString('hex');
        assert.ok(
            trackedPathBytes.has(gitPathBytes),
            `no exact Git path bytes for apps/legacy/public/${key}`
        );
    }
});

test('[AST-01] build and check reject a decomposed allowlist entry', () => {
    const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ims-client-nfd-'));
    const temporaryAllowlist = path.join(temporaryRoot, 'client-allowlist.json');
    const preload = path.join(temporaryRoot, 'override-allowlist.cjs');
    const manifest = JSON.parse(fs.readFileSync(SOURCE_ALLOWLIST_PATH, 'utf8'));
    const index = manifest.files.findIndex((value) => value !== value.normalize('NFD'));
    assert.notEqual(index, -1, 'fixture requires a path with a decomposable character');
    manifest.files[index] = manifest.files[index].normalize('NFD');
    assert.notEqual(manifest.files[index], manifest.files[index].normalize('NFC'));
    fs.writeFileSync(temporaryAllowlist, `${JSON.stringify(manifest, null, 2)}\n`);
    fs.writeFileSync(preload, `'use strict';
const fs = require('node:fs');
const path = require('node:path');
const originalReadFileSync = fs.readFileSync;
fs.readFileSync = function readFileSync(file, ...args) {
    if (path.resolve(String(file)) === ${JSON.stringify(SOURCE_ALLOWLIST_PATH)}) {
        return originalReadFileSync.call(fs, ${JSON.stringify(temporaryAllowlist)}, ...args);
    }
    return originalReadFileSync.call(fs, file, ...args);
};
`);

    try {
        for (const script of [BUILD_SCRIPT, CHECK_SCRIPT]) {
            const result = spawnSync(process.execPath, ['--require', preload, script], {
                cwd: PROJECT_ROOT,
                encoding: 'utf8'
            });
            assert.notEqual(result.status, 0, `${path.basename(script)} accepted an NFD path`);
            assert.match(`${result.stdout}\n${result.stderr}`, /NFC-normalized/);
        }
    } finally {
        fs.rmSync(temporaryRoot, { recursive: true, force: true });
    }
});

test('[AST-01] client build is exactly allowlisted and Unity data is routed to R2', () => {
    const build = spawnSync(process.execPath, [BUILD_SCRIPT], {
        cwd: PROJECT_ROOT,
        encoding: 'utf8'
    });
    assert.equal(build.status, 0, build.stderr);

    const check = spawnSync(process.execPath, [CHECK_SCRIPT], {
        cwd: PROJECT_ROOT,
        encoding: 'utf8'
    });
    assert.equal(check.status, 0, check.stderr);

    const actual = walk(CLIENT_ROOT).sort();
    const allowlist = JSON.parse(fs.readFileSync(ALLOWLIST_PATH, 'utf8')).files;
    assert.equal(allowlist.length, 355);
    assert.deepEqual(actual, allowlist);
    assert.ok(actual.length > 0);

    const forbidden = actual.filter((file) => {
        const lower = file.toLowerCase();
        return /(?:^|\/)(?:data|database|templates|uploads|logs|venv|\.venv|__pycache__)(?:\/|$)/.test(lower) ||
            /(?:^|\/)(?:\.staging|\.trash)(?:\/|$)/.test(lower) ||
            /\.(?:db|sqlite3?|py|ini|log|sql|wal|shm|data)$/.test(lower) ||
            lower.startsWith('assets/images/eventchronicle/events/');
    });
    assert.deepEqual(forbidden, []);

    for (const sensitive of [
        'app.py',
        'idol_data.db',
        'templates/index.html',
        'uploads',
        'Data',
        'assets/images/eventchronicle/events/meta'
    ]) {
        assert.equal(fs.existsSync(path.join(CLIENT_ROOT, sensitive)), false, sensitive);
    }

    const r2 = JSON.parse(fs.readFileSync(R2_ASSETS_PATH, 'utf8')).assets;
    const expectedUnity = [
        'runninggame/Build/webgame.data',
        'runninggame/BuildMobile/webgame.data'
    ];
    assert.deepEqual(r2.map((entry) => entry.url).sort(), expectedUnity.map((key) => `/${key}`));
    const nodeActual = walk(NODE_CLIENT_ROOT).sort();
    assert.deepEqual(nodeActual, [...allowlist, ...expectedUnity].sort());
    assert.equal(nodeActual.length, 357);
    for (const key of nodeActual) {
        assert.equal(key, key.normalize('NFC'), `Node asset path is not NFC: ${JSON.stringify(key)}`);
        assert.equal(fs.existsSync(path.join(LEGACY_PUBLIC_ROOT, key)), true, key);
    }
    for (const key of expectedUnity) {
        const entry = r2.find((candidate) => candidate.url === `/${key}`);
        assert.deepEqual(entry, {
            url: `/${key}`,
            logicalKey: `unity/${key}`,
            bytes: fs.statSync(path.join(LEGACY_PUBLIC_ROOT, key)).size
        });
        assert.equal(actual.includes(key), false);
        assert.equal(
            sha256(path.join(NODE_CLIENT_ROOT, key)),
            sha256(path.join(LEGACY_PUBLIC_ROOT, key)),
            `${key} differs from public source bytes`
        );
    }
});

test('[AST-01] Node client check rejects missing, extra, and changed payload bytes', () => {
    const dataFile = path.join(NODE_CLIENT_ROOT, 'runninggame/Build/webgame.data');
    const heldFile = path.join(PROJECT_ROOT, 'dist', `.node-client-held-${process.pid}.data`);
    fs.renameSync(dataFile, heldFile);
    try {
        const missingCheck = spawnSync(process.execPath, [CHECK_SCRIPT], {
            cwd: PROJECT_ROOT,
            encoding: 'utf8'
        });
        assert.notEqual(missingCheck.status, 0);
        assert.match(`${missingCheck.stdout}\n${missingCheck.stderr}`, /"missing"/);
        assert.match(`${missingCheck.stdout}\n${missingCheck.stderr}`, /runninggame\/Build\/webgame\.data/);
    } finally {
        fs.renameSync(heldFile, dataFile);
    }

    const extraFile = path.join(NODE_CLIENT_ROOT, '__unexpected-node-asset__.html');
    fs.writeFileSync(extraFile, '<!doctype html>not allowlisted', { flag: 'wx' });
    try {
        const extraCheck = spawnSync(process.execPath, [CHECK_SCRIPT], {
            cwd: PROJECT_ROOT,
            encoding: 'utf8'
        });
        assert.notEqual(extraCheck.status, 0);
        assert.match(`${extraCheck.stdout}\n${extraCheck.stderr}`, /"extra"/);
        assert.match(`${extraCheck.stdout}\n${extraCheck.stderr}`, /__unexpected-node-asset__\.html/);
    } finally {
        fs.rmSync(extraFile, { force: true });
    }

    const originalByte = Buffer.alloc(1);
    let descriptor = fs.openSync(dataFile, 'r+');
    fs.readSync(descriptor, originalByte, 0, 1, 0);
    fs.writeSync(descriptor, Buffer.from([originalByte[0] ^ 0xff]), 0, 1, 0);
    fs.closeSync(descriptor);
    descriptor = undefined;
    try {
        const changedCheck = spawnSync(process.execPath, [CHECK_SCRIPT], {
            cwd: PROJECT_ROOT,
            encoding: 'utf8'
        });
        assert.notEqual(changedCheck.status, 0);
        assert.match(`${changedCheck.stdout}\n${changedCheck.stderr}`, /"byteMismatches"/);
        assert.match(`${changedCheck.stdout}\n${changedCheck.stderr}`, /runninggame\/Build\/webgame\.data/);
    } finally {
        if (descriptor !== undefined) fs.closeSync(descriptor);
        const restoreDescriptor = fs.openSync(dataFile, 'r+');
        try {
            fs.writeSync(restoreDescriptor, originalByte, 0, 1, 0);
        } finally {
            fs.closeSync(restoreDescriptor);
        }
    }
});

test('[AST-01] Worker staging remains closed when the normal output gains a conflict copy', () => {
    const conflictCopy = path.join(CLIENT_ROOT, '__restored-conflict-copy__.html');
    let stagingRoot;
    fs.writeFileSync(conflictCopy, '<!doctype html>not allowlisted', { flag: 'wx' });
    try {
        stagingRoot = stageClientAssets();
        const actual = walk(stagingRoot).sort();
        const allowlist = JSON.parse(fs.readFileSync(ALLOWLIST_PATH, 'utf8')).files;
        assert.deepEqual(actual, allowlist);
        assert.equal(actual.includes(path.basename(conflictCopy)), false);

        const dirtyCheck = spawnSync(process.execPath, [CHECK_SCRIPT], {
            cwd: PROJECT_ROOT,
            encoding: 'utf8'
        });
        assert.notEqual(dirtyCheck.status, 0);

        const stagedCheck = spawnSync(process.execPath, [CHECK_SCRIPT], {
            cwd: PROJECT_ROOT,
            env: { ...process.env, IMS_CLIENT_OUTPUT_DIR: stagingRoot },
            encoding: 'utf8'
        });
        assert.equal(stagedCheck.status, 0, stagedCheck.stderr);
    } finally {
        fs.rmSync(conflictCopy, { force: true });
        if (stagingRoot) fs.rmSync(stagingRoot, { recursive: true, force: true });
    }
});
