'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const serverRoot = path.join(root, 'src/server');
const domainRoot = path.join(root, 'src/server/domains');
const failures = [];

function filesUnder(directory) {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const absolute = path.join(directory, entry.name);
        if (entry.isDirectory()) return filesUnder(absolute);
        return /\.tsx?$/.test(entry.name) ? [absolute] : [];
    });
}

const relativeInternalImport = /\b(?:from\s*|import\s*(?:\(\s*)?)(['"])\.{1,2}\//;
for (const file of filesUnder(serverRoot)) {
    if (relativeInternalImport.test(fs.readFileSync(file, 'utf8'))) {
        failures.push(`${path.relative(root, file)}: internal imports must use the @ root alias`);
    }
}

for (const configFile of ['tsconfig.server.json', 'tsconfig.worker.json']) {
    const config = JSON.parse(fs.readFileSync(path.join(root, configFile), 'utf8'));
    if (JSON.stringify(config.compilerOptions?.paths?.['@/*']) !== JSON.stringify(['./src/server/*'])) {
        failures.push(`${configFile}: @/* must map to ./src/server/*`);
    }
}
const bundleTsconfig = JSON.parse(fs.readFileSync(path.join(root, 'tsconfig.json'), 'utf8'));
if (bundleTsconfig.extends !== './tsconfig.worker.json') {
    failures.push('tsconfig.json: Worker bundling must inherit tsconfig.worker.json');
}

const forbiddenDomainPatterns = [
    [/\bfrom\s+['"](?:express|sqlite3|sharp|multer|node:fs|fs)['"]/, 'forbidden runtime import'],
    [/\brequire\(\s*['"](?:express|sqlite3|sharp|multer|node:fs|fs)['"]\s*\)/, 'forbidden runtime require'],
    [/\bprocess\.env\b/, 'direct environment access'],
    [/\b(?:Flask|Pillow)\b/, 'Python web/image runtime reference']
];

for (const file of filesUnder(domainRoot)) {
    const source = fs.readFileSync(file, 'utf8');
    for (const [pattern, label] of forbiddenDomainPatterns) {
        if (pattern.test(source)) failures.push(`${path.relative(root, file)}: ${label}`);
    }
}

const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
for (const dependency of ['express', 'flask', 'cookie-parser', 'cors', 'helmet', 'multer', 'jsonwebtoken', 'jose']) {
    if (packageJson.dependencies?.[dependency] || packageJson.devDependencies?.[dependency]) {
        failures.push(`package.json: legacy dependency remains: ${dependency}`);
    }
}

for (const legacyRuntime of [
    'public/app.py',
    'public/gunicorn_conf.py',
    'public/requirements.txt',
    'public/templates',
    'public/uwsgi.ini',
    'public/uwsgi.pid',
    'tests/test_flask_security.py'
]) {
    if (fs.existsSync(path.join(root, legacyRuntime))) {
        failures.push(`${legacyRuntime}: removed Flask runtime surface has returned`);
    }
}

const appSource = fs.readFileSync(path.join(root, 'src/server/app.ts'), 'utf8');
if (!appSource.includes('export function createHonoApp') || !appSource.includes("c.set('services'")) {
    failures.push('src/server/app.ts: request-scoped service resolution contract is missing');
}
const workerSource = fs.readFileSync(path.join(root, 'src/server/worker.ts'), 'utf8');
if (!workerSource.includes('createHonoApp<WorkerBindings>((env) => createCloudflareServices(env))')) {
    failures.push('src/server/worker.ts: Worker services are not resolved from request bindings');
}
const mainSource = fs.readFileSync(path.join(root, 'src/server/main.ts'), 'utf8');
for (const exportName of ['honoApp', 'app', 'startServer', 'closeDatabase']) {
    if (!new RegExp(`export (?:const|function|async function) ${exportName}\\b`).test(mainSource)) {
        failures.push(`src/server/main.ts: missing ${exportName} export`);
    }
}

if (failures.length) throw new Error(`Hono architecture check failed:\n${failures.join('\n')}`);
process.stdout.write(`Hono architecture check passed: ${filesUnder(domainRoot).length} domain modules\n`);
