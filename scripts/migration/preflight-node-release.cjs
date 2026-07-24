#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const net = require('node:net');

function fail(message) {
    throw new Error(message);
}

function isInside(parent, candidate) {
    const relative = path.relative(parent, candidate);
    return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function absolutePath(name, value) {
    if (!value || !path.isAbsolute(value)) fail(`${name} must be an absolute path`);
    return path.normalize(value);
}

function pathPrefixes(candidate) {
    const parsed = path.parse(candidate);
    const relative = candidate.slice(parsed.root.length);
    const segments = relative.split(path.sep).filter(Boolean);
    const prefixes = [parsed.root];
    let current = parsed.root;
    for (const segment of segments) {
        current = path.join(current, segment);
        prefixes.push(current);
    }
    return prefixes;
}

function assertExistingPath(name, candidate, kind) {
    const normalized = absolutePath(name, candidate);
    for (const prefix of pathPrefixes(normalized)) {
        let stat;
        try {
            stat = fs.lstatSync(prefix);
        } catch (error) {
            if (error && error.code === 'ENOENT') fail(`${name} does not exist: ${normalized}`);
            throw error;
        }
        if (stat.isSymbolicLink()) fail(`${name} or one of its parents is a symbolic link: ${prefix}`);
    }
    const stat = fs.lstatSync(normalized);
    if (kind === 'file' && !stat.isFile()) fail(`${name} must be a regular file: ${normalized}`);
    if (kind === 'directory' && !stat.isDirectory()) fail(`${name} must be a directory: ${normalized}`);
    return fs.realpathSync(normalized);
}

function assertRequiredPath(releaseRoot, relative, kind) {
    const candidate = path.join(releaseRoot, relative);
    const resolved = assertExistingPath(`staging release path ${relative}`, candidate, kind);
    if (!isInside(releaseRoot, resolved)) fail(`staging release path escapes the release root: ${relative}`);
    return resolved;
}

function assertDisjoint(entries) {
    for (let left = 0; left < entries.length; left += 1) {
        for (let right = left + 1; right < entries.length; right += 1) {
            const [leftName, leftPath, leftDevice, leftInode] = entries[left];
            const [rightName, rightPath, rightDevice, rightInode] = entries[right];
            if (leftDevice === rightDevice && leftInode === rightInode) {
                fail(`${leftName} and ${rightName} must be disjoint and cannot identify the same filesystem object`);
            }
            if (isInside(leftPath, rightPath) || isInside(rightPath, leftPath)) {
                fail(`${leftName} and ${rightName} must be disjoint: ${leftPath} <> ${rightPath}`);
            }
        }
    }
}

function boundary(name, resolved) {
    const stat = fs.lstatSync(resolved);
    return [name, resolved, stat.dev, stat.ino];
}

function assertLoadedInsideRelease(releaseRoot, baselineCache) {
    for (const loadedPath of Object.keys(require.cache)) {
        if (baselineCache.has(loadedPath)) continue;
        const resolved = fs.realpathSync(loadedPath);
        if (!isInside(releaseRoot, resolved)) {
            fail(`server dependency escaped the release root: ${loadedPath} -> ${resolved}`);
        }
    }
}

function compareUtf8(left, right) {
    return Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'));
}

function walkRegularFiles(root, label) {
    const files = [];
    function walk(directory, prefix) {
        for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
            const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
            const absolute = path.join(directory, entry.name);
            if (entry.isSymbolicLink()) fail(`${label} contains a symbolic link: ${relative}`);
            if (entry.isDirectory()) {
                walk(absolute, relative);
            } else if (entry.isFile()) {
                files.push(relative);
            } else {
                fail(`${label} contains a non-regular entry: ${relative}`);
            }
        }
    }
    walk(root, '');
    return files.sort(compareUtf8);
}

function validateClientArtifacts(required) {
    const manifest = JSON.parse(fs.readFileSync(required.get('apps/api/dist/client-manifest.json'), 'utf8'));
    if (
        manifest.version !== 1 ||
        manifest.source !== '@imsweb/web' ||
        !Array.isArray(manifest.files) ||
        !manifest.files.length
    ) {
        fail('client manifest must be a non-empty version 1 @imsweb/web manifest');
    }
    const expected = manifest.files.map((value) => {
        if (typeof value !== 'string' || !value || value !== value.normalize('NFC') ||
            value.includes('\\') || value.includes('\0') ||
            path.posix.normalize(value) !== value || value.startsWith('/') || value.startsWith('../')) {
            fail(`invalid client allowlist entry: ${JSON.stringify(value)}`);
        }
        return value;
    });
    const sortedExpected = [...expected].sort(compareUtf8);
    if (new Set(expected).size !== expected.length || expected.some((value, index) => value !== sortedExpected[index])) {
        fail('client allowlist must be unique and sorted by UTF-8 bytes');
    }

    const clientRoot = required.get('apps/api/dist/client');
    const nodeClientRoot = required.get('apps/api/dist/node-client');
    const clientFiles = walkRegularFiles(clientRoot, 'dist/client');
    if (JSON.stringify(clientFiles) !== JSON.stringify(expected)) {
        fail('dist/client tree is not the exact reviewed client allowlist');
    }

    const nodeFiles = walkRegularFiles(nodeClientRoot, 'dist/node-client');
    if (JSON.stringify(nodeFiles) !== JSON.stringify(expected)) {
        fail('dist/node-client tree is not the exact Web client manifest');
    }
    for (const relative of expected) {
        const baseBody = fs.readFileSync(path.join(clientRoot, ...relative.split('/')));
        const nodeBody = fs.readFileSync(path.join(nodeClientRoot, ...relative.split('/')));
        if (!baseBody.equals(nodeBody)) fail(`dist/client and dist/node-client differ: ${relative}`);
    }
}

function yamlScalar(value) {
    const trimmed = String(value).trim();
    if (trimmed.length >= 2 && trimmed.startsWith("'") && trimmed.endsWith("'")) {
        return trimmed.slice(1, -1).replaceAll("''", "'");
    }
    if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
        return JSON.parse(trimmed);
    }
    return trimmed;
}

function parseHonoLockDependencies(lockBody) {
    const lines = lockBody.split(/\r?\n/);
    const versionLine = lines.find((line) => line.startsWith('lockfileVersion:'));
    if (!versionLine || yamlScalar(versionLine.slice(versionLine.indexOf(':') + 1)) !== '9.0') {
        fail('pnpm lockfile must use lockfileVersion 9.0');
    }
    const importer = lines.indexOf('  apps/api:');
    if (importer < 0) fail('pnpm lockfile is missing the apps/api importer');
    let dependencies = -1;
    for (let index = importer + 1; index < lines.length; index += 1) {
        if (/^\S/.test(lines[index]) || /^  \S/.test(lines[index])) break;
        if (lines[index] === '    dependencies:') {
            dependencies = index;
            break;
        }
    }
    if (dependencies < 0) fail('pnpm lockfile is missing apps/api production dependencies');

    const result = new Map();
    for (let index = dependencies + 1; index < lines.length;) {
        if (/^\S/.test(lines[index]) || /^    \S/.test(lines[index]) || /^  \S/.test(lines[index])) break;
        if (!lines[index].trim()) {
            index += 1;
            continue;
        }
        const dependency = lines[index].match(/^      (.+):$/);
        if (!dependency) fail(`invalid apps/api lock dependency line: ${lines[index]}`);
        const specifier = lines[index + 1]?.match(/^        specifier: (.+)$/);
        const version = lines[index + 2]?.match(/^        version: (.+)$/);
        if (!specifier || !version) fail(`incomplete apps/api lock dependency: ${dependency[1]}`);
        result.set(yamlScalar(dependency[1]), {
            specifier: yamlScalar(specifier[1]),
            version: yamlScalar(version[1]).split('(', 1)[0]
        });
        index += 3;
    }
    return result;
}

function packageMetadataForResolvedModule(resolvedModule, releaseRoot, dependency) {
    let current = path.dirname(fs.realpathSync(resolvedModule));
    while (isInside(releaseRoot, current)) {
        const packagePath = path.join(current, 'package.json');
        if (fs.existsSync(packagePath)) {
            const metadata = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
            if (metadata.name === dependency) return { metadata, packagePath };
        }
        if (current === releaseRoot) break;
        current = path.dirname(current);
    }
    fail(`cannot locate installed package metadata for ${dependency}`);
}

function validateFrozenInstall(required, releaseRoot) {
    const sourceLock = fs.readFileSync(required.get('pnpm-lock.yaml'));
    const installedLock = fs.readFileSync(required.get('node_modules/.pnpm/lock.yaml'));
    if (!sourceLock.equals(installedLock)) {
        fail('installed pnpm lock does not match the staged frozen lockfile');
    }
    const rootPackage = JSON.parse(fs.readFileSync(required.get('package.json'), 'utf8'));
    const appPackage = JSON.parse(fs.readFileSync(required.get('apps/api/package.json'), 'utf8'));
    if (!/^pnpm@\d+\.\d+\.\d+$/.test(rootPackage.packageManager || '')) {
        fail('root package.json must pin an exact pnpm packageManager version');
    }
    let modulesMetadata;
    try {
        modulesMetadata = JSON.parse(fs.readFileSync(required.get('node_modules/.modules.yaml'), 'utf8'));
    } catch (error) {
        fail(`installed pnpm metadata is not the pnpm 11 structured format: ${error.message}`);
    }
    if (modulesMetadata.packageManager !== rootPackage.packageManager ||
        modulesMetadata.virtualStoreDir !== '.pnpm') {
        fail('installed pnpm metadata does not match packageManager or virtual store');
    }

    const locked = parseHonoLockDependencies(sourceLock.toString('utf8'));
    const declared = appPackage.dependencies || {};
    const expectedNames = Object.keys(declared).sort(compareUtf8);
    const lockedNames = [...locked.keys()].sort(compareUtf8);
    if (JSON.stringify(expectedNames) !== JSON.stringify(lockedNames)) {
        fail('apps/api production dependencies differ from the frozen lock importer');
    }
    const appRequire = createRequire(required.get('apps/api/package.json'));
    for (const dependency of expectedNames) {
        const lockEntry = locked.get(dependency);
        if (lockEntry.specifier !== declared[dependency]) {
            fail(`frozen lock specifier differs for ${dependency}`);
        }
        let resolved;
        try {
            resolved = appRequire.resolve(dependency);
        } catch (error) {
            fail(`cannot resolve installed production dependency ${dependency}: ${error.message}`);
        }
        const resolvedPhysical = fs.realpathSync(resolved);
        if (!isInside(releaseRoot, resolvedPhysical)) {
            fail(`installed production dependency escapes the release root: ${dependency} -> ${resolvedPhysical}`);
        }
        const { metadata, packagePath } = packageMetadataForResolvedModule(resolved, releaseRoot, dependency);
        if (!isInside(releaseRoot, fs.realpathSync(packagePath))) {
            fail(`installed package metadata escapes release root: ${dependency}`);
        }
        if (metadata.version !== lockEntry.version) {
            fail(`installed dependency version differs from frozen lock for ${dependency}`);
        }
    }
}

async function probeRuntime(releaseRoot, publicDir, publicIndex, appPackagePath, mainPath) {
    const baselineCache = new Set(Object.keys(require.cache));
    const appPackage = JSON.parse(fs.readFileSync(appPackagePath, 'utf8'));
    const appRequire = createRequire(appPackagePath);

    for (const dependency of Object.keys(appPackage.dependencies || {}).sort()) {
        let resolved;
        try {
            resolved = appRequire.resolve(dependency);
            appRequire(dependency);
        } catch (error) {
            fail(`cannot load production dependency ${dependency}: ${error.message}`);
        }
        const physical = fs.realpathSync(resolved);
        if (!isInside(releaseRoot, physical)) {
            fail(`production dependency escapes the release root: ${dependency} -> ${physical}`);
        }
    }

    const originalListen = net.Server.prototype.listen;
    net.Server.prototype.listen = function forbiddenReleaseProbeListen() {
        fail('release runtime probe attempted to listen on a socket');
    };

    const previousProjectRoot = process.env.IMS_PROJECT_ROOT;
    const previousPublicDir = process.env.IMS_PUBLIC_DIR;
    process.env.IMS_PROJECT_ROOT = releaseRoot;
    process.env.IMS_PUBLIC_DIR = publicDir;

    let loaded;
    try {
        loaded = require(mainPath);
    } catch (error) {
        fail(`cannot load built server entry: ${error.message}`);
    } finally {
        net.Server.prototype.listen = originalListen;
    }

    try {
        if (typeof loaded.startServer !== 'function' || typeof loaded.createHonoApp !== 'function' ||
            typeof loaded.app !== 'function' || !loaded.honoApp || typeof loaded.closeDatabase !== 'function') {
            fail('built server entry does not expose the expected Node runtime contract');
        }

        const staticModulePath = path.join(
            releaseRoot,
            'apps/api/dist/server/infra/http/filesystem/static-assets.js'
        );
        const staticModule = require(staticModulePath);
        if (typeof staticModule.NodeStaticAssets !== 'function') {
            fail('built Node static-assets adapter is unavailable');
        }
        const runtime = loaded.createHonoApp(() => ({
            staticAssets: new staticModule.NodeStaticAssets(publicDir)
        }));
        const response = await runtime.request('http://release.invalid/');
        const expected = fs.readFileSync(publicIndex);
        const actual = Buffer.from(await response.arrayBuffer());
        if (response.status !== 200 || !actual.equals(expected)) {
            fail(`static runtime probe failed: status=${response.status} bytes=${actual.length}/${expected.length}`);
        }
        const manifest = JSON.parse(fs.readFileSync(
            path.join(releaseRoot, 'apps/api/dist/client-manifest.json'),
            'utf8'
        ));
        const relative = manifest.files.find((candidate) =>
            candidate !== 'index.html' &&
            fs.statSync(path.join(publicDir, ...candidate.split('/'))).size >= 4
        );
        if (!relative) fail('client manifest has no static file suitable for a runtime probe');
        const expectedAsset = fs.readFileSync(path.join(publicDir, ...relative.split('/')));
        const url = `http://release.invalid/${relative}`;
        const getResponse = await runtime.request(url);
        const getBody = Buffer.from(await getResponse.arrayBuffer());
        if (getResponse.status !== 200 || !getBody.equals(expectedAsset)) {
            fail(`Node static GET probe failed: ${relative}`);
        }
        const headResponse = await runtime.request(url, { method: 'HEAD' });
        const headBody = Buffer.from(await headResponse.arrayBuffer());
        if (headResponse.status !== 200 || headBody.length !== 0 ||
            headResponse.headers.get('content-length') !== String(expectedAsset.length)) {
            fail(`Node static HEAD probe failed: ${relative}`);
        }
        const rangeResponse = await runtime.request(url, { headers: { range: 'bytes=1-3' } });
        const rangeBody = Buffer.from(await rangeResponse.arrayBuffer());
        if (rangeResponse.status !== 206 || !rangeBody.equals(expectedAsset.subarray(1, 4)) ||
            rangeResponse.headers.get('content-range') !== `bytes 1-3/${expectedAsset.length}`) {
            fail(`Node static Range probe failed: ${relative}`);
        }
        assertLoadedInsideRelease(releaseRoot, baselineCache);
    } finally {
        if (loaded && typeof loaded.closeDatabase === 'function') {
            await loaded.closeDatabase().catch(() => undefined);
        }
        if (previousProjectRoot === undefined) delete process.env.IMS_PROJECT_ROOT;
        else process.env.IMS_PROJECT_ROOT = previousProjectRoot;
        if (previousPublicDir === undefined) delete process.env.IMS_PUBLIC_DIR;
        else process.env.IMS_PUBLIC_DIR = previousPublicDir;
    }
}

async function main() {
    if (process.argv.length !== 4) {
        fail('usage: preflight-node-release.cjs <release-directory> <current-link>');
    }
    const requestedRelease = absolutePath('release directory', process.argv[2]);
    const releaseRoot = assertExistingPath('release directory', requestedRelease, 'directory');
    if (releaseRoot !== requestedRelease) fail('release directory canonical path differs from its lexical path');
    const releasesRoot = path.dirname(releaseRoot);

    const current = absolutePath('IMS_CURRENT_LINK', process.argv[3]);
    const currentParent = assertExistingPath('IMS_CURRENT_LINK parent', path.dirname(current), 'directory');
    if (currentParent !== path.dirname(current)) {
        fail('IMS_CURRENT_LINK parent canonical path differs from its lexical path');
    }

    const configuredPublic = absolutePath('IMS_PUBLIC_DIR', process.env.IMS_PUBLIC_DIR || '');
    const configuredProjectRoot = absolutePath('IMS_PROJECT_ROOT', process.env.IMS_PROJECT_ROOT || '');
    if (configuredProjectRoot !== current) {
        fail(`IMS_PROJECT_ROOT must be the stable current release path: ${current}`);
    }
    const expectedPublic = path.join(current, 'apps/api/dist/node-client');
    if (configuredPublic !== expectedPublic) {
        fail(`IMS_PUBLIC_DIR must be the stable current release path: ${expectedPublic}`);
    }

    const requiredFiles = [
        'package.json',
        'pnpm-lock.yaml',
        'pnpm-workspace.yaml',
        'apps/api/package.json',
        'apps/api/dist/server/main.js',
        'apps/api/dist/server/infra/http/filesystem/static-assets.js',
        'apps/api/dist/client/index.html',
        'apps/api/dist/node-client/index.html',
        'apps/api/dist/client-manifest.json',
        'node_modules/.pnpm/lock.yaml',
        'node_modules/.modules.yaml'
    ];
    const requiredDirectories = [
        'node_modules',
        'node_modules/.pnpm',
        'apps/api/node_modules',
        'apps/api/dist/server',
        'apps/api/dist/client',
        'apps/api/dist/node-client'
    ];
    const resolvedRequired = new Map();
    for (const relative of requiredDirectories) {
        resolvedRequired.set(relative, assertRequiredPath(releaseRoot, relative, 'directory'));
    }
    for (const relative of requiredFiles) {
        resolvedRequired.set(relative, assertRequiredPath(releaseRoot, relative, 'file'));
    }
    const publicIndex = resolvedRequired.get('apps/api/dist/node-client/index.html');
    if (fs.statSync(publicIndex).size < 1) fail('dist/node-client/index.html must not be empty');
    fs.accessSync(publicIndex, fs.constants.R_OK);
    validateFrozenInstall(resolvedRequired, releaseRoot);
    validateClientArtifacts(resolvedRequired);

    const objectStorage = String(process.env.IMS_OBJECT_STORAGE || 'filesystem')
        .trim().toLowerCase();
    if (!['filesystem', 's3'].includes(objectStorage)) {
        fail('IMS_OBJECT_STORAGE must be filesystem or s3');
    }
    const database = String(process.env.IMS_DATABASE || 'sqlite').trim().toLowerCase();
    if (!['sqlite', 'postgres', 'postgresql', 'pgsql'].includes(database)) {
        fail('IMS_DATABASE must be sqlite or postgresql');
    }
    if (database !== 'sqlite') {
        let databaseUrl;
        try {
            databaseUrl = new URL(process.env.DATABASE_URL || '');
        } catch {
            fail('DATABASE_URL must be a valid PostgreSQL URL');
        }
        if (!['postgres:', 'postgresql:'].includes(databaseUrl.protocol) ||
            !databaseUrl.hostname || !databaseUrl.pathname) {
            fail('DATABASE_URL must be a valid PostgreSQL URL');
        }
    }
    const mutableDefinitions = [
        ...(database === 'sqlite' ? [
            ['IMS_SQLITE_PATH', 'file']
        ] : []),
        ['IMS_COMPENSATION_DIR', 'directory'],
        ...(objectStorage === 'filesystem' ? [
            ['IMS_UPLOADS_DIR', 'directory'],
            ['IMS_STORY_DATA_DIR', 'directory'],
            ['IMS_EVENT_BASE_DIR', 'directory']
        ] : [])
    ];
    const boundaries = [boundary('IMS_PUBLIC_DIR', resolvedRequired.get('apps/api/dist/node-client'))];
    for (const [name, kind] of mutableDefinitions) {
        const lexical = absolutePath(name, process.env[name] || '');
        if (isInside(current, lexical)) {
            fail(`${name} must not be inside the lexical IMS_CURRENT_LINK tree: ${lexical}`);
        }
        const resolved = assertExistingPath(name, lexical, kind);
        if (resolved !== lexical) fail(`${name} canonical path differs from its lexical path: ${lexical} -> ${resolved}`);
        if (isInside(releasesRoot, resolved)) {
            fail(`${name} must be outside IMS_RELEASES_DIR: ${resolved}`);
        }
        boundaries.push(boundary(name, resolved));
    }
    assertDisjoint(boundaries);

    await probeRuntime(
        releaseRoot,
        resolvedRequired.get('apps/api/dist/node-client'),
        publicIndex,
        resolvedRequired.get('apps/api/package.json'),
        resolvedRequired.get('apps/api/dist/server/main.js')
    );
}

main().catch((error) => {
    console.error(`release preflight refused: ${error.message}`);
    process.exitCode = 1;
});
