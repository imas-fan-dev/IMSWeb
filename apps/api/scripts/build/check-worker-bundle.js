'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const packageRoot = path.resolve(__dirname, '../..');
const repositoryRoot = path.resolve(packageRoot, '../..');
const publicRoot = path.join(repositoryRoot, 'apps/legacy/public');
const allowlistPath = path.join(__dirname, 'client-allowlist.json');
const buildClientPath = path.join(__dirname, 'build-client.js');
const checkClientPath = path.join(__dirname, 'check-client.js');

function readAllowlist() {
    const manifest = JSON.parse(fs.readFileSync(allowlistPath, 'utf8'));
    if (manifest.version !== 1 || !Array.isArray(manifest.files)) {
        throw new Error('scripts/build/client-allowlist.json must be a version 1 file manifest');
    }
    if (new Set(manifest.files).size !== manifest.files.length) {
        throw new Error('Duplicate client asset allowlist entry');
    }
    return manifest.files;
}

function sourceFile(key) {
    if (typeof key !== 'string' || !key || key.includes('\\') || key.includes('\0')) {
        throw new Error(`Invalid client asset key: ${JSON.stringify(key)}`);
    }
    const normalized = path.posix.normalize(key);
    if (normalized !== key || normalized.startsWith('/') || normalized === '..' || normalized.startsWith('../')) {
        throw new Error(`Unsafe client asset key: ${key}`);
    }

    let current = publicRoot;
    for (const segment of key.split('/')) {
        current = path.join(current, segment);
        const stat = fs.lstatSync(current);
        if (stat.isSymbolicLink()) {
            throw new Error(`Symlink is forbidden in client assets: ${key}`);
        }
    }
    if (!fs.statSync(current).isFile()) {
        throw new Error(`Client asset is not a regular file: ${key}`);
    }
    return current;
}

function stageClientAssets() {
    const stagingRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ims-worker-assets-'));
    try {
        for (const key of readAllowlist()) {
            const destination = path.join(stagingRoot, ...key.split('/'));
            fs.mkdirSync(path.dirname(destination), { recursive: true });
            fs.copyFileSync(sourceFile(key), destination, fs.constants.COPYFILE_EXCL);
        }
        return stagingRoot;
    } catch (error) {
        fs.rmSync(stagingRoot, { recursive: true, force: true });
        throw error;
    }
}

function run(command, args, options = {}) {
    const result = spawnSync(command, args, {
        cwd: packageRoot,
        stdio: 'inherit',
        ...options
    });
    if (result.error) throw result.error;
    if (result.status !== 0) {
        throw new Error(`${path.basename(command)} exited with status ${result.status}`);
    }
}

function runWorkerDryRun() {
    run(process.execPath, [buildClientPath]);
    const stagingRoot = stageClientAssets();
    const wrangler = path.join(
        packageRoot,
        'node_modules/.bin',
        process.platform === 'win32' ? 'wrangler.cmd' : 'wrangler'
    );
    try {
        run(process.execPath, [checkClientPath], {
            env: { ...process.env, IMS_CLIENT_OUTPUT_DIR: stagingRoot }
        });
        run(wrangler, [
            'deploy',
            '--dry-run',
            '--outdir',
            'dist/worker',
            '--assets',
            stagingRoot
        ]);
    } finally {
        fs.rmSync(stagingRoot, { recursive: true, force: true });
    }
}

if (require.main === module) {
    try {
        runWorkerDryRun();
    } catch (error) {
        console.error(error instanceof Error ? error.message : error);
        process.exitCode = 1;
    }
}

module.exports = { stageClientAssets };
