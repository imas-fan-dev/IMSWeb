'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '../..');
const customClientRoot = Boolean(process.env.IMS_CLIENT_OUTPUT_DIR);
const clientRoot = customClientRoot
    ? path.resolve(process.env.IMS_CLIENT_OUTPUT_DIR)
    : path.join(projectRoot, 'dist/client');
const nodeClientRoot = path.join(projectRoot, 'dist/node-client');
const publicRoot = path.resolve(projectRoot, '../legacy/public');
const nodeOnlyFiles = [
    'runninggame/Build/webgame.data',
    'runninggame/BuildMobile/webgame.data'
];
const sourceAllowlistPath = path.join(projectRoot, 'scripts/build/client-allowlist.json');
const sourceManifest = JSON.parse(
    fs.readFileSync(sourceAllowlistPath, 'utf8')
);

function assertNfcManifest(manifest, label) {
    if (manifest.version !== 1 || !Array.isArray(manifest.files)) {
        throw new Error(`${label} must be a version 1 file manifest`);
    }
    for (const value of manifest.files) {
        if (typeof value !== 'string' || value !== value.normalize('NFC')) {
            throw new Error(`${label} path must be NFC-normalized: ${JSON.stringify(value)}`);
        }
    }
}

assertNfcManifest(sourceManifest, 'Reviewed client allowlist');
const outputManifest = JSON.parse(
    fs.readFileSync(path.join(projectRoot, 'dist/client-allowlist.json'), 'utf8')
);
assertNfcManifest(outputManifest, 'Generated client allowlist');
if (JSON.stringify(sourceManifest) !== JSON.stringify(outputManifest)) {
    throw new Error('Generated client allowlist differs from the reviewed source allowlist');
}
const allowlist = new Set(sourceManifest.files);
const nodeAllowlist = new Set([...allowlist, ...nodeOnlyFiles]);

function scanExact(root, expected, { allowData = false } = {}) {
    const actual = new Set();
    const forbidden = [];

    function walk(directory) {
        for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
            const absolute = path.join(directory, entry.name);
            const filesystemRelative = path.relative(root, absolute).split(path.sep).join('/');
            const relative = process.platform === 'darwin'
                ? filesystemRelative.normalize('NFC')
                : filesystemRelative;
            if (process.platform !== 'darwin' && relative !== relative.normalize('NFC')) {
                forbidden.push(`${relative}:not-nfc`);
            }
            if (entry.isSymbolicLink()) {
                forbidden.push(`${relative}:symlink`);
                continue;
            }
            if (entry.isDirectory()) {
                walk(absolute);
                continue;
            }
            actual.add(relative);
            const lower = relative.toLowerCase();
            if (
                /(?:^|\/)(?:data|database|templates|uploads|logs|venv|\.venv|__pycache__)(?:\/|$)/.test(lower) ||
                /(?:^|\/)(?:\.staging|\.trash)(?:\/|$)/.test(lower) ||
                /\.(?:7z|db|sqlite3?|py|ini|log|psd|sql|txt|wal|shm)$/.test(lower) ||
                (!allowData && lower.endsWith('.data')) ||
                lower.startsWith('assets/images/eventchronicle/events/')
            ) forbidden.push(relative);
        }
    }

    walk(root);
    return {
        forbidden,
        extra: [...actual].filter((file) => !expected.has(file)).sort(),
        missing: [...expected].filter((file) => !actual.has(file)).sort(),
        count: actual.size
    };
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

const result = {
    base: scanExact(clientRoot, allowlist)
};
if (!customClientRoot) {
    result.node = scanExact(nodeClientRoot, nodeAllowlist, { allowData: true });
    result.node.byteMismatches = nodeOnlyFiles.filter((key) => {
        const source = path.join(publicRoot, ...key.split('/'));
        const built = path.join(nodeClientRoot, ...key.split('/'));
        if (!fs.existsSync(built) || fs.lstatSync(built).isSymbolicLink() || !fs.statSync(built).isFile()) {
            return false;
        }
        const sourceStat = fs.statSync(source);
        const builtStat = fs.statSync(built);
        return sourceStat.size !== builtStat.size || sha256(source) !== sha256(built);
    });
}

const failed = Object.values(result).some((scan) =>
    scan.forbidden.length || scan.extra.length || scan.missing.length || scan.byteMismatches?.length
);
if (failed) throw new Error(JSON.stringify(result, null, 2));

const nodeSummary = result.node ? `; ${result.node.count} Node files` : '';
process.stdout.write(`Client asset scan passed: ${result.base.count} base files${nodeSummary}\n`);
