'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const utf8 = new TextDecoder('utf-8', { fatal: true });

function sha256(body) {
    return crypto.createHash('sha256').update(body).digest('hex');
}

function compareUtf8(left, right) {
    return Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'));
}

function detectedMime(body) {
    if (body.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
    if (body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff) return 'image/jpeg';
    if (body.subarray(0, 6).toString('ascii').startsWith('GIF8')) return 'image/gif';
    if (body.subarray(0, 4).toString('ascii') === 'RIFF' && body.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
    if (body.subarray(0, 2).toString('ascii') === 'BM') return 'image/bmp';
    if (body.length >= 12 && body.subarray(4, 8).toString('ascii') === 'ftyp') {
        const brand = body.subarray(8, 12).toString('ascii');
        if (['avif', 'avis'].includes(brand)) return 'image/avif';
    }
    if (body.subarray(0, 4).toString('hex') === '00010000') return 'font/ttf';
    if (body.subarray(0, 4).toString('ascii') === 'wOFF') return 'font/woff';
    if (body.subarray(0, 4).toString('ascii') === 'wOF2') return 'font/woff2';
    if (body.subarray(0, 4).toString('ascii') === '\0asm') return 'application/wasm';
    return 'application/octet-stream';
}

function bufferPath(parent, name) {
    return Buffer.concat([Buffer.isBuffer(parent) ? parent : Buffer.from(parent), Buffer.from(path.sep), name]);
}

function normalizeLogicalPrefix(value) {
    const prefix = String(value || '').replace(/^\/+|\/+$/g, '').normalize('NFC');
    if (prefix && (
        prefix.includes('\\') || prefix.split('/').some(segment => !segment || segment === '.' || segment === '..')
    )) throw new Error(`Invalid logical prefix: ${prefix}`);
    return prefix;
}

function normalizeIncludePath(value) {
    const selected = String(value || '').replace(/^\/+|\/+$/g, '').normalize('NFC');
    if (
        !selected || selected.includes('\\') ||
        selected.split('/').some(segment => !segment || segment === '.' || segment === '..')
    ) throw new Error(`Invalid included source path: ${String(value)}`);
    return selected;
}

function buildManifest(root, options = {}) {
    const runId = options.runId || crypto.randomUUID();
    const logicalPrefix = normalizeLogicalPrefix(options.logicalPrefix);
    const includePaths = options.includePaths === undefined
        ? null
        : new Set(options.includePaths.map(normalizeIncludePath));
    if (includePaths && !includePaths.size) throw new Error('At least one included source path is required');
    const foundIncludes = new Set();
    const state = options.state || 'ready';
    if (!['pending', 'ready'].includes(state)) throw new Error(`Invalid initial object state: ${state}`);
    const rootPath = fs.realpathSync.native(root);
    const entries = [];
    const errors = [];
    const normalizedPaths = new Map();
    const objectKeys = new Set();

    function reject(code, oldPath, detail) {
        errors.push({ code, oldPath, detail });
    }

    function visit(absolute, segments) {
        const directoryEntries = fs.readdirSync(absolute, {
            encoding: 'buffer',
            withFileTypes: true
        });
        for (const dirent of directoryEntries) {
            const nameBytes = dirent.name;
            let name;
            try {
                name = utf8.decode(nameBytes);
            } catch {
                reject('invalid-utf8', segments.join('/'), nameBytes.toString('hex'));
                continue;
            }
            const childSegments = [...segments, name];
            const oldPath = childSegments.join('/');
            const child = bufferPath(absolute, nameBytes);
            const stat = fs.lstatSync(child, { bigint: true });
            const selectedBranch = !includePaths || includePaths.has(oldPath) ||
                [...includePaths].some(selected => selected.startsWith(`${oldPath}/`));
            if (!selectedBranch) continue;
            if (stat.isSymbolicLink()) {
                reject('symlink', oldPath, 'symbolic links are never migrated');
                continue;
            }
            if (name === '.staging' || name === '.trash') {
                reject('work-directory', oldPath, 'transient chronicle directory excluded');
                continue;
            }
            if (stat.isDirectory()) {
                visit(child, childSegments);
                continue;
            }
            if (!stat.isFile()) {
                reject('non-regular-file', oldPath, 'only regular files are accepted');
                continue;
            }
            if (includePaths && !includePaths.has(oldPath)) continue;
            foundIncludes.add(oldPath);

            const normalized = oldPath.normalize('NFC');
            const collision = normalizedPaths.get(normalized);
            if (collision && collision !== oldPath) {
                reject('unicode-normalization-collision', oldPath, `collides with ${collision}`);
                continue;
            }
            normalizedPaths.set(normalized, oldPath);

            if (Buffer.byteLength(oldPath, 'utf8') > 1024) {
                reject('object-key-too-long', oldPath, `${Buffer.byteLength(oldPath, 'utf8')} bytes`);
                continue;
            }

            const before = stat;
            if (options.beforeRead) options.beforeRead({ absolute: child, oldPath });
            const body = fs.readFileSync(child);
            const after = fs.lstatSync(child, { bigint: true });
            if (
                before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size ||
                before.mtimeNs !== after.mtimeNs || BigInt(body.byteLength) !== after.size
            ) {
                reject('modified-during-inventory', oldPath, 'file metadata changed while hashing');
                continue;
            }

            const contentSha256 = sha256(body);
            const logicalPath = oldPath.normalize('NFC');
            const logicalKey = logicalPrefix ? `${logicalPrefix}/${logicalPath}` : logicalPath;
            const objectId = sha256(Buffer.concat([
                Buffer.from(logicalKey, 'utf8'), Buffer.from([0]), Buffer.from(contentSha256, 'ascii')
            ]));
            const objectKey = `objects/${objectId}`;
            if (Buffer.byteLength(objectKey, 'utf8') > 1024) {
                reject('object-key-too-long', oldPath, `${Buffer.byteLength(objectKey, 'utf8')} bytes`);
                continue;
            }
            if (objectKeys.has(objectKey)) {
                reject('duplicate-object-key', oldPath, objectKey);
                continue;
            }
            objectKeys.add(objectKey);
            entries.push({
                runId,
                oldPath,
                logicalKey,
                objectKey,
                objectId,
                state,
                bytes: body.byteLength,
                mime: detectedMime(body),
                sha256: contentSha256
            });
        }
    }

    visit(Buffer.from(rootPath), []);
    if (includePaths) {
        for (const selected of includePaths) {
            if (!foundIncludes.has(selected)) reject('selected-file-missing', selected, 'selected source file is missing');
        }
    }
    entries.sort((left, right) => compareUtf8(left.oldPath, right.oldPath));
    errors.sort((left, right) => compareUtf8(left.oldPath, right.oldPath));
    return {
        manifest: {
            version: 1,
            runId,
            sourceRoot: rootPath,
            scopes: [logicalPrefix || '*'],
            generatedAt: new Date().toISOString(),
            entries
        },
        errors
    };
}

function mergeManifests(documents) {
    if (!Array.isArray(documents) || documents.length < 2) {
        throw new Error('At least two manifests are required for merge');
    }
    const manifests = documents.map((document) => {
        const blockers = Array.isArray(document.errors) ? document.errors : [];
        if (blockers.length) throw new Error(`Cannot merge manifest with ${blockers.length} blocker(s)`);
        return document.manifest || document;
    });
    const runIds = new Set(manifests.map((manifest) => manifest.runId));
    if (runIds.size !== 1 || ![...runIds][0]) throw new Error('Merged manifests must share one non-empty run ID');
    const logicalKeys = new Set();
    const objectKeys = new Set();
    const entries = [];
    const scopes = new Set();
    for (const manifest of manifests) {
        if (!path.isAbsolute(manifest.sourceRoot || '')) throw new Error('Merged manifest sourceRoot must be absolute');
        for (const scope of manifest.scopes || ['*']) scopes.add(scope);
        for (const entry of manifest.entries || []) {
            if (logicalKeys.has(entry.logicalKey)) throw new Error(`Duplicate merged logical key: ${entry.logicalKey}`);
            if (objectKeys.has(entry.objectKey)) throw new Error(`Duplicate merged object key: ${entry.objectKey}`);
            logicalKeys.add(entry.logicalKey);
            objectKeys.add(entry.objectKey);
            entries.push({ ...entry, sourceRoot: manifest.sourceRoot });
        }
    }
    entries.sort((left, right) => compareUtf8(left.logicalKey, right.logicalKey));
    return {
        version: 1,
        runId: [...runIds][0],
        sourceRoot: null,
        sourceRoots: manifests.map((manifest) => manifest.sourceRoot),
        scopes: [...scopes].sort(compareUtf8),
        generatedAt: new Date().toISOString(),
        entries
    };
}

function verifyLocalObjects(manifest, objectRoot) {
    const differences = [];
    const expectedKeys = new Set(manifest.entries.map((entry) => entry.objectKey));
    const actualKeys = new Set();

    function visit(directory, segments = []) {
        let entries;
        try {
            entries = fs.readdirSync(directory, { withFileTypes: true });
        } catch (error) {
            if (error.code === 'ENOENT') return;
            throw error;
        }
        for (const entry of entries) {
            const childSegments = [...segments, entry.name];
            const key = childSegments.join('/');
            const child = path.join(directory, entry.name);
            if (entry.isSymbolicLink() || (!entry.isDirectory() && !entry.isFile())) {
                differences.push({ objectKey: key, error: 'target contains non-regular object' });
            } else if (entry.isDirectory()) visit(child, childSegments);
            else actualKeys.add(key);
        }
    }
    visit(path.resolve(objectRoot));
    for (const key of [...actualKeys].sort(compareUtf8)) {
        if (!expectedKeys.has(key)) differences.push({ objectKey: key, error: 'unexpected target object' });
    }

    for (const entry of manifest.entries) {
        const objectPath = path.resolve(objectRoot, entry.objectKey);
        const relative = path.relative(path.resolve(objectRoot), objectPath);
        if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
            differences.push({ objectKey: entry.objectKey, error: 'object key escapes root' });
            continue;
        }
        let body;
        try {
            body = fs.readFileSync(objectPath);
        } catch (error) {
            differences.push({ objectKey: entry.objectKey, error: error.code || error.message });
            continue;
        }
        const actualMime = detectedMime(body);
        if (
            body.byteLength !== entry.bytes || sha256(body) !== entry.sha256 ||
            (entry.mime && actualMime !== entry.mime)
        ) {
            differences.push({
                objectKey: entry.objectKey,
                expectedBytes: entry.bytes,
                actualBytes: body.byteLength,
                expectedSha256: entry.sha256,
                actualSha256: sha256(body),
                expectedMime: entry.mime,
                actualMime
            });
        }
    }
    return differences;
}

function main(argv) {
    const [command, input, output, ...rest] = argv;
    if (command === 'merge' && input && output) {
        const documents = [output, ...rest].map((file) => JSON.parse(fs.readFileSync(file, 'utf8')));
        const manifest = mergeManifests(documents);
        fs.writeFileSync(input, `${JSON.stringify({ manifest, errors: [] }, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
        process.stdout.write(`${JSON.stringify({ runId: manifest.runId, entries: manifest.entries.length, sources: manifest.sourceRoots.length })}\n`);
        return;
    }
    if ((command === 'audit' || command === 'audit-files') && input && output) {
        let runId;
        const options = command === 'audit-files' ? { includePaths: [] } : {};
        for (let index = 0; index < rest.length; index += 1) {
            const value = rest[index];
            if (!value.startsWith('--') && !runId) {
                runId = value;
                continue;
            }
            if (!['--logical-prefix', '--state', '--include'].includes(value) || !rest[index + 1]) {
                throw new Error(`Unknown audit option: ${value}`);
            }
            if (value === '--include') {
                if (command !== 'audit-files') throw new Error('--include requires audit-files');
                options.includePaths.push(rest[index + 1]);
            } else {
                options[value === '--state' ? 'state' : 'logicalPrefix'] = rest[index + 1];
            }
            index += 1;
        }
        const result = buildManifest(input, { ...options, runId });
        fs.writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
        process.stdout.write(`${JSON.stringify({ entries: result.manifest.entries.length, blockers: result.errors.length })}\n`);
        if (result.errors.length) process.exitCode = 2;
        return;
    }
    if (command === 'verify' && input && output) {
        const parsed = JSON.parse(fs.readFileSync(input, 'utf8'));
        const manifest = parsed.manifest || parsed;
        const differences = verifyLocalObjects(manifest, output);
        process.stdout.write(`${JSON.stringify({ checked: manifest.entries.length, differences }, null, 2)}\n`);
        if (differences.length) process.exitCode = 3;
        return;
    }
    throw new Error('Usage: r2-manifest.js audit <source-root> <output.json> [run-id] [--logical-prefix prefix] [--state pending|ready] | audit-files <source-root> <output.json> [run-id] --include path... [--logical-prefix prefix] [--state pending|ready] | merge <output.json> <manifest...> | verify <manifest.json> <object-root>');
}

if (require.main === module) main(process.argv.slice(2));

module.exports = { buildManifest, detectedMime, mergeManifests, verifyLocalObjects };
