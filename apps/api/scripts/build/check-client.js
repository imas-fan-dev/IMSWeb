'use strict';

const fs = require('node:fs');
const path = require('node:path');

const packageRoot = path.resolve(__dirname, '../..');
const customClientRoot = process.env.IMS_CLIENT_OUTPUT_DIR
    ? path.resolve(process.env.IMS_CLIENT_OUTPUT_DIR)
    : null;
const clientRoots = customClientRoot
    ? [customClientRoot]
    : [path.join(packageRoot, 'dist/client'), path.join(packageRoot, 'dist/node-client')];
const manifest = JSON.parse(
    fs.readFileSync(path.join(packageRoot, 'dist/client-manifest.json'), 'utf8')
);

if (manifest.version !== 1 || manifest.source !== '@imsweb/web' || !Array.isArray(manifest.files)) {
    throw new Error('Generated client manifest must describe a version 1 @imsweb/web build');
}
if (!manifest.files.length || new Set(manifest.files).size !== manifest.files.length) {
    throw new Error('Generated client manifest must contain unique files');
}
for (const value of manifest.files) {
    if (typeof value !== 'string' || !value || value !== value.normalize('NFC')) {
        throw new Error(`Client manifest path must be NFC-normalized: ${JSON.stringify(value)}`);
    }
}

function compareUtf8(left, right) {
    return Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'));
}

const expected = [...manifest.files].sort(compareUtf8);
if (manifest.files.some((value, index) => value !== expected[index])) {
    throw new Error('Generated client manifest must be sorted by UTF-8 bytes');
}

function walk(directory, root = directory) {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const absolute = path.join(directory, entry.name);
        const relative = path.relative(root, absolute).split(path.sep).join('/');
        if (entry.isSymbolicLink()) throw new Error(`Symlink in client output: ${relative}`);
        if (entry.isDirectory()) return walk(absolute, root);
        if (!entry.isFile()) throw new Error(`Non-file entry in client output: ${relative}`);
        return [process.platform === 'darwin' ? relative.normalize('NFC') : relative];
    });
}

for (const root of clientRoots) {
    const actual = walk(root).sort(compareUtf8);
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        const actualSet = new Set(actual);
        const expectedSet = new Set(expected);
        throw new Error(JSON.stringify({
            root,
            missing: expected.filter((file) => !actualSet.has(file)),
            extra: actual.filter((file) => !expectedSet.has(file))
        }, null, 2));
    }
}

if (!customClientRoot) {
    const [baseRoot, nodeRoot] = clientRoots;
    for (const relative of expected) {
        const base = fs.readFileSync(path.join(baseRoot, ...relative.split('/')));
        const node = fs.readFileSync(path.join(nodeRoot, ...relative.split('/')));
        if (!base.equals(node)) throw new Error(`Client release copies differ: ${relative}`);
    }
}

process.stdout.write(`Client asset scan passed: ${expected.length} Web build files\n`);
