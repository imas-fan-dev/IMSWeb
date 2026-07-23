'use strict';

const fs = require('node:fs');
const path = require('node:path');

const packageRoot = path.resolve(__dirname, '../..');
const repositoryRoot = path.resolve(packageRoot, '../..');
const publicRoot = path.join(repositoryRoot, 'apps/legacy/public');
const outputRoot = path.join(packageRoot, 'dist/client');
const nodeOutputRoot = path.join(packageRoot, 'dist/node-client');
const sourceAllowlistPath = path.join(__dirname, 'client-allowlist.json');
const outputAllowlistPath = path.join(packageRoot, 'dist/client-allowlist.json');
const r2ManifestPath = path.join(packageRoot, 'dist/client-r2-assets.json');

// Unity payloads keep their historical URLs but are published through R2.
// Like the Static Assets list, this list is intentionally closed: adding a
// file under apps/legacy/public never becomes deployable without a
// reviewed change to this package's allowlist.
const r2AssetFiles = [
    'runninggame/Build/webgame.data',
    'runninggame/BuildMobile/webgame.data'
];
const maxStaticAssetBytes = 25 * 1024 * 1024;
const maxStaticAssetFiles = 20_000;
const allowedStaticExtensions = new Set([
    '.avif', '.bmp', '.css', '.geojson', '.gif', '.html', '.ico', '.jfif',
    '.jpeg', '.jpg', '.js', '.json', '.png', '.svg', '.ttf', '.wasm',
    '.webp', '.woff', '.woff2'
]);

const forbiddenSegments = new Set([
    '.git', '.staging', '.trash', '.venv', '__pycache__', 'data', 'database',
    'logs', 'templates', 'uploads', 'venv'
]);
const forbiddenExtensions = /\.(?:7z|db|sqlite3?|py|ini|log|pid|env|psd|sql|txt|bak|conf|toml|lock|wal|shm)$/i;

function normalizeKey(value) {
    if (typeof value !== 'string' || !value || value.includes('\\') || value.includes('\0')) {
        throw new Error(`Invalid client asset key: ${JSON.stringify(value)}`);
    }
    if (value !== value.normalize('NFC')) {
        throw new Error(`Client asset key must be NFC-normalized: ${JSON.stringify(value)}`);
    }
    const normalized = path.posix.normalize(value);
    if (normalized !== value || normalized.startsWith('/') || normalized === '..' || normalized.startsWith('../')) {
        throw new Error(`Unsafe client asset key: ${value}`);
    }
    return value;
}

function assertPublishable(key, { r2 = false } = {}) {
    const lower = key.toLowerCase();
    const segments = lower.split('/');
    if (segments.some((segment) => forbiddenSegments.has(segment)) ||
        lower.startsWith('assets/images/eventchronicle/events/') ||
        forbiddenExtensions.test(lower)) {
        throw new Error(`Forbidden client asset: ${key}`);
    }
    if (r2 !== lower.endsWith('.data')) {
        throw new Error(`${r2 ? 'R2' : 'Static'} asset has the wrong publication class: ${key}`);
    }
    if (!r2 && !allowedStaticExtensions.has(path.posix.extname(lower))) {
        throw new Error(`Unsupported Static Asset extension: ${key}`);
    }
}

function sourceFile(key) {
    const segments = key.split('/');
    let current = publicRoot;
    for (const segment of segments) {
        current = path.join(current, segment);
        const stat = fs.lstatSync(current);
        if (stat.isSymbolicLink()) throw new Error(`Symlink is forbidden in client assets: ${key}`);
    }
    const stat = fs.statSync(current);
    if (!stat.isFile()) throw new Error(`Client asset is not a regular file: ${key}`);
    return { absolute: current, stat };
}

const sourceManifest = JSON.parse(fs.readFileSync(sourceAllowlistPath, 'utf8'));
if (sourceManifest.version !== 1 || !Array.isArray(sourceManifest.files)) {
    throw new Error('scripts/build/client-allowlist.json must be a version 1 file manifest');
}
const staticFiles = sourceManifest.files.map(normalizeKey);
if (new Set(staticFiles).size !== staticFiles.length) throw new Error('Duplicate client asset allowlist entry');
if (staticFiles.length > maxStaticAssetFiles) throw new Error('Static Asset file-count limit exceeded');
if (staticFiles.some((value, index) => index > 0 && staticFiles[index - 1] >= value)) {
    throw new Error('Client asset allowlist must be strictly sorted');
}

fs.rmSync(outputRoot, { recursive: true, force: true });
fs.rmSync(nodeOutputRoot, { recursive: true, force: true });
fs.mkdirSync(outputRoot, { recursive: true });
fs.mkdirSync(nodeOutputRoot, { recursive: true });

function copyAsset(absolute, root, key) {
    const destination = path.join(root, ...key.split('/'));
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(absolute, destination, fs.constants.COPYFILE_EXCL);
}

for (const key of staticFiles) {
    assertPublishable(key);
    const { absolute, stat } = sourceFile(key);
    if (stat.size > maxStaticAssetBytes) throw new Error(`Static Asset exceeds 25 MiB: ${key}`);
    copyAsset(absolute, outputRoot, key);
    copyAsset(absolute, nodeOutputRoot, key);
}

const r2 = r2AssetFiles.map((value) => {
    const key = normalizeKey(value);
    assertPublishable(key, { r2: true });
    const { absolute, stat } = sourceFile(key);
    copyAsset(absolute, nodeOutputRoot, key);
    return { url: `/${key}`, logicalKey: `unity/${key}`, bytes: stat.size };
});

fs.writeFileSync(r2ManifestPath, `${JSON.stringify({ generatedAt: new Date().toISOString(), assets: r2 }, null, 2)}\n`);
fs.writeFileSync(outputAllowlistPath, `${JSON.stringify({ version: 1, files: staticFiles }, null, 2)}\n`);
process.stdout.write(
    `Built dist/client: ${staticFiles.length} Worker files; ` +
    `dist/node-client: ${staticFiles.length + r2.length} Node files; ` +
    `${r2.length} Unity .data files routed to R2 for Workers\n`
);
