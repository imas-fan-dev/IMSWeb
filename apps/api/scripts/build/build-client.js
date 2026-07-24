'use strict';

const fs = require('node:fs');
const path = require('node:path');

const packageRoot = path.resolve(__dirname, '../..');
const repositoryRoot = path.resolve(packageRoot, '../..');
const sourceRoot = path.join(repositoryRoot, 'apps/web/build/client');
const outputRoots = [
    path.join(packageRoot, 'dist/client'),
    path.join(packageRoot, 'dist/node-client')
];
const manifestPath = path.join(packageRoot, 'dist/client-manifest.json');
const maxAssetBytes = 25 * 1024 * 1024;
const maxAssetFiles = 20_000;
const allowedExtensions = new Set([
    '.avif', '.bmp', '.css', '.gif', '.html', '.ico', '.jpeg', '.jpg', '.js',
    '.json', '.png', '.svg', '.webp', '.woff', '.woff2'
]);
const forbiddenSegments = new Set([
    '.git', '.staging', '.trash', '.venv', '__pycache__', 'data', 'database',
    'logs', 'templates', 'uploads', 'venv'
]);
const forbiddenExtensions = /\.(?:7z|db|sqlite3?|py|ini|log|pid|env|psd|sql|txt|bak|conf|toml|lock|wal|shm|data)$/i;

function compareUtf8(left, right) {
    return Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'));
}

function assertPublishable(relative, stat) {
    if (!relative || relative !== relative.normalize('NFC')) {
        throw new Error(`Client asset path must be NFC-normalized: ${JSON.stringify(relative)}`);
    }
    const normalized = path.posix.normalize(relative);
    if (normalized !== relative || relative.startsWith('/') || relative.startsWith('../')) {
        throw new Error(`Unsafe client asset path: ${relative}`);
    }
    const lower = relative.toLowerCase();
    if (
        lower.split('/').some((segment) => forbiddenSegments.has(segment)) ||
        forbiddenExtensions.test(lower) ||
        !allowedExtensions.has(path.posix.extname(lower))
    ) {
        throw new Error(`Forbidden client asset: ${relative}`);
    }
    if (stat.size > maxAssetBytes) {
        throw new Error(`Client asset exceeds 25 MiB: ${relative}`);
    }
}

function walk(directory, prefix = '') {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
        const absolute = path.join(directory, entry.name);
        if (entry.isSymbolicLink()) {
            throw new Error(`Symlink is forbidden in Web build output: ${relative}`);
        }
        if (entry.isDirectory()) return walk(absolute, relative);
        if (!entry.isFile()) throw new Error(`Non-file entry in Web build output: ${relative}`);
        const normalized = process.platform === 'darwin' ? relative.normalize('NFC') : relative;
        const stat = fs.statSync(absolute);
        assertPublishable(normalized, stat);
        return [{ absolute, relative: normalized }];
    });
}

if (!fs.statSync(sourceRoot, { throwIfNoEntry: false })?.isDirectory()) {
    throw new Error(`Web build output is missing: ${sourceRoot}\nRun pnpm run build:web first.`);
}

const files = walk(sourceRoot).sort((left, right) => compareUtf8(left.relative, right.relative));
if (!files.length || files.length > maxAssetFiles) {
    throw new Error(`Web build file count must be between 1 and ${maxAssetFiles}`);
}
for (const required of ['index.html', '__spa-fallback.html']) {
    if (!files.some((file) => file.relative === required)) {
        throw new Error(`Web build output is missing ${required}`);
    }
}

for (const outputRoot of outputRoots) {
    fs.rmSync(outputRoot, { recursive: true, force: true });
    fs.mkdirSync(outputRoot, { recursive: true });
    for (const file of files) {
        const destination = path.join(outputRoot, ...file.relative.split('/'));
        fs.mkdirSync(path.dirname(destination), { recursive: true });
        fs.copyFileSync(file.absolute, destination, fs.constants.COPYFILE_EXCL);
    }
}

fs.writeFileSync(manifestPath, `${JSON.stringify({
    version: 1,
    source: '@imsweb/web',
    files: files.map((file) => file.relative)
}, null, 2)}\n`);
process.stdout.write(`Packaged ${files.length} Web build files for the Node release\n`);
