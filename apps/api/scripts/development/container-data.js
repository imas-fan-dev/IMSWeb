#!/usr/bin/env node

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const API_ROOT = path.resolve(__dirname, '../..');
const REPOSITORY_ROOT = path.resolve(API_ROOT, '../..');
const COMPOSE_FILE = path.join(REPOSITORY_ROOT, 'deploy/compose.yaml');
const ARCHIVE_ROOT = 'imsweb-development-data';
const FORMAT_VERSION = 2;
const LEGACY_FORMAT_VERSION = 1;
const MAX_CAPTURE_BYTES = 128 * 1024 * 1024;

function usage() {
    return `Usage:
  pnpm run dev:data:export [-- --output <archive.tar.gz>]
  pnpm run dev:data:restore -- <archive.tar.gz> [--force]

Commands:
  export   Start the repository data containers and create a logical snapshot.
  restore  Restore a snapshot into the repository development containers.

Options:
  --output <path>  Export destination, relative to the repository root.
  --force          Allow restore to replace a non-empty database and bucket.
  --help           Show this help.

The default export directory is data/exports/. Archives contain application
data and password hashes. Treat them as secrets and share them privately.`;
}

function parseArguments(argv) {
    const values = argv.filter(value => value !== '--');
    if (values.length === 0 || values[0] === '--help' || values[0] === '-h') {
        return { action: 'help' };
    }

    const action = values.shift();
    if (action !== 'export' && action !== 'restore') {
        throw new Error(`Unknown action: ${action}`);
    }

    let output;
    let archive;
    let force = false;
    while (values.length > 0) {
        const argument = values.shift();
        if (argument === '--help' || argument === '-h') {
            return { action: 'help' };
        }
        if (action === 'export' && argument === '--output') {
            output = values.shift();
            if (!output) throw new Error('--output requires a path');
            continue;
        }
        if (action === 'restore' && argument === '--force') {
            force = true;
            continue;
        }
        if (action === 'restore' && !archive && !argument.startsWith('-')) {
            archive = argument;
            continue;
        }
        throw new Error(`Unknown argument for ${action}: ${argument}`);
    }

    if (action === 'restore' && !archive) {
        throw new Error('restore requires an archive path');
    }
    return { action, output, archive, force };
}

function runProcess(command, args, options = {}) {
    const result = spawnSync(command, args, {
        cwd: options.cwd || REPOSITORY_ROOT,
        env: { ...process.env, ...options.env },
        encoding: options.encoding,
        maxBuffer: MAX_CAPTURE_BYTES,
        stdio: options.stdio || 'inherit'
    });
    if (result.error) throw result.error;
    if (result.status !== 0) {
        const label = options.label || `${command} ${args[0] || ''}`.trim();
        throw new Error(`${label} failed with exit code ${result.status}`);
    }
    return result.stdout;
}

function captureProcess(command, args, options = {}) {
    return runProcess(command, args, {
        ...options,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', options.quietStderr ? 'pipe' : 'inherit']
    }).trim();
}

function composeArguments(args) {
    return ['compose', '-f', COMPOSE_FILE, ...args];
}

function runCompose(args, options = {}) {
    return runProcess('docker', composeArguments(args), options);
}

function captureCompose(args, options = {}) {
    return captureProcess('docker', composeArguments(args), options);
}

function readComposeConfig() {
    const source = captureCompose(['config', '--format', 'json'], {
        label: 'reading Docker Compose configuration'
    });
    const config = JSON.parse(source);
    const bucket = config.services?.['rustfs-init']?.environment
        ?.IMS_RUSTFS_BUCKET;
    if (!bucket) {
        throw new Error('IMS_RUSTFS_BUCKET is missing from rustfs-init');
    }
    return { bucket };
}

function startDataServices() {
    const running = new Set(captureCompose([
        'ps', '--status', 'running', '--services'
    ], { label: 'checking development data containers' }).split('\n'));
    const services = [];
    if (!running.has('postgres')) services.push('postgres');
    if (!running.has('rustfs')) services.push('rustfs', 'rustfs-init');
    if (services.length === 0) {
        console.log('PostgreSQL and RustFS development containers are running.');
        return;
    }

    console.log(`Starting missing development containers: ${services.join(', ')}...`);
    runCompose(['up', '-d', ...services], {
        label: 'starting development data containers'
    });
}

function capturePostgresQuery(sql) {
    return captureCompose([
        'exec', '-T', 'postgres', 'sh', '-ec',
        'exec psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atqc "$1"',
        'imsweb-query', sql
    ], { label: 'querying PostgreSQL' });
}

function postgresMetadata() {
    const database = capturePostgresQuery('SELECT current_database()');
    const serverVersion = capturePostgresQuery('SHOW server_version');
    const tableCount = Number(capturePostgresQuery(
        "SELECT count(*) FROM pg_tables WHERE schemaname = 'public'"
    ));
    if (!Number.isInteger(tableCount)) {
        throw new Error('PostgreSQL returned an invalid public table count');
    }
    return { database, serverVersion, tableCount };
}

function rustfsRunArguments(shellSource, mount) {
    const args = ['run', '--rm', '-T', '--no-deps'];
    if (mount) {
        const suffix = mount.readOnly ? ':ro' : '';
        args.push(
            '--volume',
            `${mount.hostPath}:${mount.containerPath}${suffix}`
        );
    }
    args.push(
        '--entrypoint', '/bin/sh', 'rustfs-init', '-ec', shellSource
    );
    return args;
}

function captureRustfs(shellSource, options = {}) {
    return captureCompose(rustfsRunArguments(shellSource, options.mount), {
        label: options.label || 'querying RustFS'
    });
}

function runRustfs(shellSource, options = {}) {
    return runCompose(rustfsRunArguments(shellSource, options.mount), {
        label: options.label || 'running RustFS data operation',
        stdio: options.quietOutput
            ? ['ignore', 'ignore', 'inherit']
            : 'inherit'
    });
}

const RUSTFS_ALIAS = [
    'mc alias set development http://rustfs:9000',
    '"$RUSTFS_ACCESS_KEY" "$RUSTFS_SECRET_KEY" >/dev/null'
].join(' ');

function rustfsUsage() {
    const source = captureRustfs([
        RUSTFS_ALIAS,
        'mc du --json "development/$IMS_RUSTFS_BUCKET"'
    ].join('\n'), { label: 'reading RustFS bucket usage' });
    const line = source.split('\n').filter(Boolean).at(-1);
    const usage = JSON.parse(line);
    if (usage.status !== 'success' ||
        !Number.isInteger(usage.objects) ||
        !Number.isInteger(usage.size)) {
        throw new Error('RustFS returned invalid bucket usage data');
    }
    return { objects: usage.objects, bytes: usage.size };
}

function dumpPostgres(destination) {
    console.log('Exporting PostgreSQL logical dump...');
    const file = fs.openSync(destination, 'wx', 0o600);
    try {
        runCompose([
            'exec', '-T', 'postgres', 'sh', '-ec',
            'exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" ' +
                '--format=custom --no-owner --no-privileges'
        ], {
            label: 'exporting PostgreSQL',
            stdio: ['ignore', file, 'inherit']
        });
    } finally {
        fs.closeSync(file);
    }
    validatePostgresDump(destination);
}

function validatePostgresDump(dumpPath) {
    const file = fs.openSync(dumpPath, 'r');
    try {
        runCompose([
            'exec', '-T', 'postgres', 'pg_restore', '--list'
        ], {
            label: 'validating PostgreSQL dump',
            stdio: [file, 'ignore', 'inherit']
        });
    } finally {
        fs.closeSync(file);
    }
}

function exportRustfs(destination) {
    console.log('Exporting current RustFS bucket objects...');
    runRustfs([
        RUSTFS_ALIAS,
        'mc stat "development/$IMS_RUSTFS_BUCKET" >/dev/null',
        'mc mirror --quiet --preserve ' +
            '"development/$IMS_RUSTFS_BUCKET" /export'
    ].join('\n'), {
        label: 'exporting RustFS bucket',
        mount: { hostPath: destination, containerPath: '/export' },
        quietOutput: true
    });
}

function summarizeDirectory(directory) {
    let objects = 0;
    let bytes = 0;
    const visit = current => {
        for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
            const candidate = path.join(current, entry.name);
            if (entry.isSymbolicLink()) {
                throw new Error(`Snapshot contains a symbolic link: ${candidate}`);
            }
            if (entry.isDirectory()) {
                visit(candidate);
                continue;
            }
            if (!entry.isFile()) {
                throw new Error(`Snapshot contains an unsupported entry: ${candidate}`);
            }
            const stat = fs.statSync(candidate);
            objects += 1;
            bytes += stat.size;
        }
    };
    visit(directory);
    return { objects, bytes };
}

function makeWorkingDirectory(prefix) {
    const dataDirectory = path.join(REPOSITORY_ROOT, 'data');
    fs.mkdirSync(dataDirectory, { recursive: true });
    return fs.mkdtempSync(path.join(dataDirectory, prefix));
}

function defaultArchivePath() {
    const timestamp = new Date().toISOString()
        .replaceAll('-', '')
        .replaceAll(':', '')
        .replace(/\.\d{3}Z$/, 'Z');
    return path.join(
        REPOSITORY_ROOT,
        'data/exports',
        `imsweb-development-data-${timestamp}.tar.gz`
    );
}

function resolveRepositoryPath(value) {
    return path.resolve(REPOSITORY_ROOT, value);
}

function assertArchiveName(archivePath) {
    if (!archivePath.endsWith('.tar.gz') && !archivePath.endsWith('.tgz')) {
        throw new Error('Archive path must end in .tar.gz or .tgz');
    }
}

function isNonEmptyFile(filePath) {
    try {
        const stat = fs.statSync(filePath);
        return stat.isFile() && stat.size > 0;
    } catch (error) {
        if (error.code === 'ENOENT') return false;
        throw error;
    }
}

function validateArchiveEntries(entries) {
    if (!Array.isArray(entries) || entries.length === 0) {
        throw new Error('Archive is empty');
    }
    for (const original of entries) {
        const entry = original.replace(/\/$/, '');
        const segments = entry.split('/');
        if (segments[0] !== ARCHIVE_ROOT ||
            segments.some(segment => !segment || segment === '.' || segment === '..')) {
            throw new Error(`Unsafe or unexpected archive entry: ${original}`);
        }
    }
    if (!entries.some(entry =>
        entry.replace(/\/$/, '') === `${ARCHIVE_ROOT}/manifest.json`
    )) {
        throw new Error('Archive does not contain manifest.json');
    }
}

function validateArchiveEntryTypes(entries) {
    for (const entry of entries) {
        const type = entry[0];
        if (type !== '-' && type !== 'd') {
            throw new Error('Snapshot archive may contain only files and directories');
        }
    }
}

function readArchiveEntries(archivePath) {
    const source = captureProcess('tar', ['-tzf', archivePath], {
        label: 'reading snapshot archive',
        env: { LC_ALL: 'C' }
    });
    const entries = source.split('\n').filter(Boolean);
    validateArchiveEntries(entries);
    const verboseSource = captureProcess('tar', ['-tvzf', archivePath], {
        label: 'checking snapshot archive entry types',
        env: { LC_ALL: 'C' }
    });
    validateArchiveEntryTypes(verboseSource.split('\n').filter(Boolean));
    return entries;
}

function snapshotStorage(manifest) {
    if (manifest?.formatVersion === FORMAT_VERSION) {
        return { directoryName: 'rustfs', storage: manifest.rustfs };
    }
    if (manifest?.formatVersion === LEGACY_FORMAT_VERSION) {
        return { directoryName: 'minio', storage: manifest.minio };
    }
    throw new Error(
        `Unsupported snapshot format version: ${manifest?.formatVersion}`
    );
}

function validateManifest(manifest) {
    if (![FORMAT_VERSION, LEGACY_FORMAT_VERSION].includes(manifest?.formatVersion)) {
        throw new Error(
            `Unsupported snapshot format version: ${manifest?.formatVersion}`
        );
    }
    const { directoryName, storage } = snapshotStorage(manifest);
    const bucket = storage?.bucket;
    if (manifest.archiveRoot !== ARCHIVE_ROOT ||
        manifest.postgresql?.file !== 'postgresql.dump' ||
        !Number.isInteger(manifest.postgresql?.publicTables) ||
        manifest.postgresql.publicTables < 0 ||
        !Number.isInteger(manifest.postgresql?.bytes) ||
        manifest.postgresql.bytes <= 0 ||
        typeof bucket !== 'string' ||
        !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket) ||
        storage.directory !== `${directoryName}/${bucket}` ||
        !Number.isInteger(storage?.objects) ||
        storage.objects < 0 ||
        !Number.isInteger(storage?.bytes) ||
        storage.bytes < 0) {
        throw new Error('Snapshot manifest is incomplete or invalid');
    }
    return storage;
}

function sha256File(filePath) {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash('sha256');
        const input = fs.createReadStream(filePath);
        input.on('error', reject);
        input.on('data', chunk => hash.update(chunk));
        input.on('end', () => resolve(hash.digest('hex')));
    });
}

async function verifyArchiveChecksum(archivePath) {
    const checksumPath = `${archivePath}.sha256`;
    if (!fs.existsSync(checksumPath)) {
        console.warn(`Checksum sidecar not found: ${checksumPath}`);
        return;
    }
    const source = fs.readFileSync(checksumPath, 'utf8').trim();
    const expected = source.match(/^([a-f0-9]{64})(?:\s|$)/)?.[1];
    if (!expected) throw new Error('Checksum sidecar is invalid');
    console.log('Verifying archive SHA-256...');
    const actual = await sha256File(archivePath);
    if (actual !== expected) {
        throw new Error(`Archive checksum mismatch: expected ${expected}, got ${actual}`);
    }
}

function snapshotReadme(manifest) {
    return `IMSWeb development data snapshot

Created: ${manifest.createdAt}
PostgreSQL database: ${manifest.postgresql.database}
RustFS bucket: ${manifest.rustfs.bucket}

Restore from the IMSWeb repository root:
  pnpm run dev:data:restore -- <archive.tar.gz>

The restore command refuses non-empty targets unless --force is supplied.
The archive contains application data and password hashes. Keep it private.
PostgreSQL and RustFS are captured separately, not as one cross-system atomic
transaction. RustFS version history and delete markers are not included.
`;
}

async function exportSnapshot(options) {
    const output = options.output
        ? resolveRepositoryPath(options.output)
        : defaultArchivePath();
    assertArchiveName(output);
    if (fs.existsSync(output)) {
        throw new Error(`Refusing to overwrite existing archive: ${output}`);
    }
    fs.mkdirSync(path.dirname(output), { recursive: true });

    const config = readComposeConfig();
    startDataServices();
    const workingDirectory = makeWorkingDirectory('.dev-data-export-');
    const snapshotDirectory = path.join(workingDirectory, ARCHIVE_ROOT);
    const rustfsDirectory = path.join(
        snapshotDirectory,
        'rustfs',
        config.bucket
    );
    const dumpPath = path.join(snapshotDirectory, 'postgresql.dump');
    const partialArchive = `${output}.partial-${process.pid}`;

    try {
        fs.mkdirSync(rustfsDirectory, { recursive: true, mode: 0o700 });
        const postgres = postgresMetadata();
        const rustfsBefore = rustfsUsage();
        dumpPostgres(dumpPath);
        exportRustfs(rustfsDirectory);
        const rustfsAfter = rustfsUsage();
        const exportedRustfs = summarizeDirectory(rustfsDirectory);
        if (rustfsBefore.objects !== rustfsAfter.objects ||
            rustfsBefore.bytes !== rustfsAfter.bytes ||
            rustfsAfter.objects !== exportedRustfs.objects ||
            rustfsAfter.bytes !== exportedRustfs.bytes) {
            throw new Error(
                'RustFS changed during export or the mirrored data is incomplete; retry'
            );
        }

        const manifest = {
            formatVersion: FORMAT_VERSION,
            archiveRoot: ARCHIVE_ROOT,
            createdAt: new Date().toISOString(),
            consistency: 'PostgreSQL and RustFS component snapshots are not atomic together',
            postgresql: {
                file: 'postgresql.dump',
                format: 'pg_dump-custom',
                database: postgres.database,
                serverVersion: postgres.serverVersion,
                publicTables: postgres.tableCount,
                bytes: fs.statSync(dumpPath).size
            },
            rustfs: {
                directory: `rustfs/${config.bucket}`,
                bucket: config.bucket,
                objects: exportedRustfs.objects,
                bytes: exportedRustfs.bytes,
                includesVersions: false
            }
        };
        fs.writeFileSync(
            path.join(snapshotDirectory, 'manifest.json'),
            `${JSON.stringify(manifest, null, 2)}\n`,
            { mode: 0o600 }
        );
        fs.writeFileSync(
            path.join(snapshotDirectory, 'README.txt'),
            snapshotReadme(manifest),
            { mode: 0o600 }
        );

        console.log('Packing snapshot archive...');
        runProcess('tar', [
            '-czf', partialArchive,
            '-C', workingDirectory,
            ARCHIVE_ROOT
        ], {
            label: 'packing snapshot archive',
            env: { COPYFILE_DISABLE: '1' }
        });
        fs.chmodSync(partialArchive, 0o600);
        fs.renameSync(partialArchive, output);

        console.log('Calculating archive SHA-256...');
        const checksum = await sha256File(output);
        const checksumPath = `${output}.sha256`;
        fs.writeFileSync(
            checksumPath,
            `${checksum}  ${path.basename(output)}\n`,
            { mode: 0o600 }
        );
        console.log(`Snapshot: ${output}`);
        console.log(`Checksum: ${checksumPath}`);
        console.log(
            `PostgreSQL tables: ${postgres.tableCount}; ` +
            `RustFS objects: ${exportedRustfs.objects}; ` +
            `RustFS bytes: ${exportedRustfs.bytes}`
        );
        return { output, checksumPath, manifest };
    } finally {
        fs.rmSync(workingDirectory, { recursive: true, force: true });
        fs.rmSync(partialArchive, { force: true });
    }
}

function resetPostgresSchema() {
    runCompose([
        'exec', '-T', 'postgres', 'sh', '-ec',
        'exec psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" ' +
            '-d "$POSTGRES_DB" -c ' +
            "'DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;'"
    ], { label: 'resetting PostgreSQL public schema' });
}

function restorePostgres(dumpPath) {
    console.log('Restoring PostgreSQL logical dump...');
    resetPostgresSchema();
    const file = fs.openSync(dumpPath, 'r');
    try {
        runCompose([
            'exec', '-T', 'postgres', 'sh', '-ec',
            'exec pg_restore --exit-on-error --no-owner --no-privileges ' +
                '-U "$POSTGRES_USER" -d "$POSTGRES_DB"'
        ], {
            label: 'restoring PostgreSQL',
            stdio: [file, 'inherit', 'inherit']
        });
    } finally {
        fs.closeSync(file);
    }
}

function restoreRustfs(source) {
    console.log('Restoring RustFS bucket objects...');
    runRustfs([
        RUSTFS_ALIAS,
        'mc mb --ignore-existing "development/$IMS_RUSTFS_BUCKET" >/dev/null',
        'mc anonymous set none "development/$IMS_RUSTFS_BUCKET" >/dev/null',
        'mc version enable "development/$IMS_RUSTFS_BUCKET" >/dev/null',
        'mc mirror --quiet --preserve --overwrite --remove ' +
            '/import "development/$IMS_RUSTFS_BUCKET"'
    ].join('\n'), {
        label: 'restoring RustFS bucket',
        mount: {
            hostPath: source,
            containerPath: '/import',
            readOnly: true
        },
        quietOutput: true
    });
}

async function restoreSnapshot(options) {
    const archivePath = resolveRepositoryPath(options.archive);
    assertArchiveName(archivePath);
    if (!isNonEmptyFile(archivePath)) {
        throw new Error(`Snapshot archive is missing or empty: ${archivePath}`);
    }
    const config = readComposeConfig();
    startDataServices();
    const currentPostgres = postgresMetadata();
    const currentRustfs = rustfsUsage();
    if (!options.force &&
        (currentPostgres.tableCount > 0 || currentRustfs.objects > 0)) {
        throw new Error(
            'Restore target is not empty. Re-run with --force to replace ' +
            `database ${currentPostgres.database} and bucket ${config.bucket}.`
        );
    }

    await verifyArchiveChecksum(archivePath);
    readArchiveEntries(archivePath);

    const workingDirectory = makeWorkingDirectory('.dev-data-restore-');
    try {
        runProcess('tar', ['-xzf', archivePath, '-C', workingDirectory], {
            label: 'extracting snapshot archive'
        });
        const snapshotDirectory = path.join(workingDirectory, ARCHIVE_ROOT);
        const manifest = JSON.parse(fs.readFileSync(
            path.join(snapshotDirectory, 'manifest.json'),
            'utf8'
        ));
        const storage = validateManifest(manifest);
        const dumpPath = path.join(snapshotDirectory, manifest.postgresql.file);
        const rustfsDirectory = path.join(
            snapshotDirectory,
            storage.directory
        );
        validatePostgresDumpFile(dumpPath);
        if (fs.statSync(dumpPath).size !== manifest.postgresql.bytes) {
            throw new Error('Extracted PostgreSQL dump does not match the manifest');
        }
        const localRustfs = summarizeDirectory(rustfsDirectory);
        if (localRustfs.objects !== storage.objects ||
            localRustfs.bytes !== storage.bytes) {
            throw new Error('Extracted object data does not match the manifest');
        }

        validatePostgresDump(dumpPath);
        restorePostgres(dumpPath);
        restoreRustfs(rustfsDirectory);
        const restoredPostgres = postgresMetadata();
        const restoredRustfs = rustfsUsage();
        if (restoredPostgres.tableCount !== manifest.postgresql.publicTables) {
            throw new Error(
                'Restored PostgreSQL table count does not match the manifest'
            );
        }
        if (restoredRustfs.objects !== storage.objects ||
            restoredRustfs.bytes !== storage.bytes) {
            throw new Error('Restored RustFS usage does not match the manifest');
        }
        console.log(
            `Restored ${archivePath} into database ${restoredPostgres.database} ` +
            `and bucket ${config.bucket}.`
        );
    } finally {
        fs.rmSync(workingDirectory, { recursive: true, force: true });
    }
}

function validatePostgresDumpFile(dumpPath) {
    if (!isNonEmptyFile(dumpPath)) {
        throw new Error('Snapshot PostgreSQL dump is missing or empty');
    }
}

async function main() {
    const options = parseArguments(process.argv.slice(2));
    if (options.action === 'help') {
        console.log(usage());
        return;
    }
    if (options.action === 'export') {
        await exportSnapshot(options);
        return;
    }
    await restoreSnapshot(options);
}

module.exports = {
    ARCHIVE_ROOT,
    isNonEmptyFile,
    parseArguments,
    summarizeDirectory,
    validateArchiveEntries,
    validateArchiveEntryTypes,
    validateManifest
};

if (require.main === module) {
    main().catch(error => {
        console.error(`Development data operation failed: ${error.message}`);
        process.exitCode = 1;
    });
}
