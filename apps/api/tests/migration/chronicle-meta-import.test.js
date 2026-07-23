'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');
const {
    buildChronicleSnapshot,
    chronicleSql,
    reconcileChronicle
} = require('../../scripts/migration/chronicle-meta-to-d1');
const { buildManifest } = require('../../scripts/migration/r2-manifest');
const { transferManifest, verifyTransferredManifest } = require('../../scripts/migration/r2-transfer');
const { FixtureTransferTransport } = require('../../scripts/migration/r2-transfer-transports');

const PROJECT_ROOT = path.resolve(__dirname, '../..');
const SCRIPT = path.join(PROJECT_ROOT, 'scripts/migration/chronicle-meta-to-d1.js');
const WRANGLER = path.join(PROJECT_ROOT, 'node_modules/wrangler/bin/wrangler.js');
const PREFIX = 'assets/images/eventchronicle/events';

function digest(value) {
    return crypto.createHash('sha256').update(value).digest('hex');
}

function writeMetadata(root, documents, timestamp = '2026-07-21T00:00:00.000Z') {
    fs.mkdirSync(root, { recursive: true });
    const modifiedAt = new Date(timestamp);
    for (const [activityId, document] of Object.entries(documents)) {
        const file = path.join(root, `${activityId}.json`);
        const body = typeof document === 'string' ? document : JSON.stringify(document);
        fs.writeFileSync(file, body);
        fs.utimesSync(file, modifiedAt, modifiedAt);
    }
}

function manifestEntry(runId, logicalKey, state, suffix = '') {
    const objectId = `object-${digest(`${logicalKey}\0${suffix}`).slice(0, 32)}`;
    return {
        runId,
        oldPath: logicalKey.split('/').at(-1),
        logicalKey,
        objectKey: `objects/${objectId}`,
        objectId,
        state,
        bytes: 12,
        mime: 'image/png',
        sha256: digest(`body:${logicalKey}:${suffix}`)
    };
}

function writeManifest(file, runId, entries) {
    fs.writeFileSync(file, `${JSON.stringify({
        manifest: { version: 1, runId, sourceRoot: path.dirname(file), entries },
        errors: []
    })}\n`);
}

function fixtureSnapshot(root, runId, documents, timestamp, suffix = '') {
    const meta = path.join(root, `meta-${runId}-${suffix || 'base'}`);
    const manifest = path.join(root, `manifest-${runId}-${suffix || 'base'}.json`);
    writeMetadata(meta, documents, timestamp);
    const entries = [];
    for (const [activityId, document] of Object.entries(documents)) {
        const parsed = typeof document === 'string' ? JSON.parse(document) : document;
        const records = Array.isArray(parsed)
            ? parsed
            : Array.isArray(parsed.records) ? parsed.records : [];
        for (const record of records) {
            if (record.status === 'deleted') continue;
            const state = record.status === 'approved' ? 'ready' : 'pending';
            const bucket = state === 'ready' ? 'used' : 'upload';
            entries.push(manifestEntry(
                runId,
                `${PREFIX}/${bucket}/${activityId}/${record.filename}`,
                state,
                suffix
            ));
        }
    }
    writeManifest(manifest, runId, entries);
    return buildChronicleSnapshot(meta, manifest, runId);
}

function confirmedEmptySnapshot(root, runId) {
    const meta = path.join(root, `meta-${runId}`);
    const manifest = path.join(root, `manifest-${runId}.json`);
    fs.mkdirSync(meta);
    writeManifest(manifest, runId, []);
    let confirmation = '';
    try {
        buildChronicleSnapshot(meta, manifest, runId);
    } catch (error) {
        const match = String(error.message).match(/[a-f0-9]{64}/);
        confirmation = match?.[0] || '';
    }
    assert.match(confirmation, /^[a-f0-9]{64}$/);
    return buildChronicleSnapshot(meta, manifest, runId, {
        confirmEmptySourceSha256: confirmation
    });
}

function wrangler(root, args, expectedStatus = 0) {
    const home = path.join(root, 'home');
    const xdg = path.join(root, 'xdg');
    fs.mkdirSync(home, { recursive: true });
    fs.mkdirSync(xdg, { recursive: true });
    const result = spawnSync(process.execPath, [WRANGLER, ...args], {
        cwd: PROJECT_ROOT,
        encoding: 'utf8',
        timeout: 60_000,
        env: { ...process.env, CI: '1', NO_COLOR: '1', HOME: home, XDG_CONFIG_HOME: xdg }
    });
    assert.equal(
        result.status,
        expectedStatus,
        `wrangler ${args.join(' ')}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
    );
    return result;
}

function query(root, persist, sql) {
    const result = wrangler(root, [
        'd1', 'execute', 'CORE_DB', '--local', '--persist-to', persist,
        '--command', sql, '--json'
    ]);
    const document = JSON.parse(result.stdout);
    assert.equal(document[0].success, true);
    return document[0].results;
}

function findLocalCoreDatabase(persist) {
    const candidates = [];
    const visit = (directory) => {
        for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
            const child = path.join(directory, entry.name);
            if (entry.isDirectory()) visit(child);
            else if (
                entry.isFile() && entry.name.endsWith('.sqlite') && entry.name !== 'metadata.sqlite'
            ) candidates.push(child);
        }
    };
    visit(persist);
    assert.equal(candidates.length, 1, `expected one local Core D1 database: ${candidates.join(', ')}`);
    return candidates[0];
}

function sqlLiteral(value) {
    if (typeof value === 'number') return String(value);
    return `'${String(value).replaceAll("'", "''")}'`;
}

function seedObjectIndex(root, persist, objects) {
    const rows = objects.map((row) => `(
        ${sqlLiteral(row.logical_key)}, ${sqlLiteral(row.object_id)}, ${sqlLiteral(row.state)},
        ${row.byte_size}, ${sqlLiteral(row.content_type)}, ${sqlLiteral(row.sha256)}, NULL,
        '2026-07-21T00:00:00.000Z', '2026-07-21T00:00:00.000Z'
    )`).join(',');
    const statement = `DELETE FROM object_index WHERE logical_key LIKE '${PREFIX}/upload/%'
        OR logical_key LIKE '${PREFIX}/used/%';${rows ? `
        INSERT INTO object_index
            (logical_key,object_id,state,byte_size,content_type,sha256,etag,created_at,updated_at)
        VALUES ${rows};` : ''}`;
    wrangler(root, [
        'd1', 'execute', 'CORE_DB', '--local', '--persist-to', persist,
        '--command', statement
    ]);
}

function writeSql(file, snapshot, statements = chronicleSql(snapshot)) {
    fs.writeFileSync(file, `${statements.join('\n')}\n`, { mode: 0o600 });
}

test('[D1-CHR] Chronicle snapshot maps legacy metadata and reconciles exact fields', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ims-chronicle-meta-unit-'));
    try {
        const snapshot = fixtureSnapshot(root, 'chronicle-unit', {
            alpha: {
                title: 'Alpha',
                records: [
                    { filename: 'approved.png', uploader: 'one', time: '2026-07-20T01:00:00Z', status: 'approved' },
                    { filename: 'pending.png', status: 'pending' },
                    { filename: 'deleted.png', status: 'deleted' }
                ]
            },
            beta: [{ filename: 'array.png', uploader: 'two', status: 'approved' }],
            empty: { title: 'No records is a valid empty Chronicle document' }
        }, '2026-07-21T00:00:00.000Z');
        assert.deepEqual(snapshot.rejects, []);
        assert.equal(snapshot.metadata.length, 3);
        assert.equal(snapshot.items.length, 4);
        assert.equal(snapshot.objects.length, 3);
        assert.match(snapshot.items[0].id, /^ci-[a-f0-9]{64}$/);
        assert.equal(snapshot.items.find((row) => row.filename === 'approved.png').status, 'ready');
        assert.equal(snapshot.items.find((row) => row.filename === 'pending.png').status, 'pending');
        assert.equal(snapshot.items.find((row) => row.filename === 'deleted.png').status, 'deleted');
        assert.equal(snapshot.metadata[0].updated_at, '2026-07-21T00:00:00.000Z');

        const statements = chronicleSql(snapshot);
        const document = statements.join('\n');
        assert.match(document, /_ims_chronicle_snapshot_guard/);
        assert.match(document, /_ims_chronicle_snapshot_stage_objects/);
        assert.doesNotMatch(document, /\bBEGIN\b|\bCOMMIT\b|PRAGMA\s+foreign_keys\s*=/i);
        const firstDrop = statements.findIndex((statement) => statement.startsWith('DROP TABLE'));
        const completed = statements.findIndex((statement) =>
            statement.startsWith('UPDATE _ims_chronicle_snapshot_runs SET status=\'completed\'')
        );
        const release = statements.findIndex((statement) =>
            statement.startsWith('DELETE FROM _ims_chronicle_snapshot_guard')
        );
        assert.ok(firstDrop > 0 && completed > firstDrop && release > completed);

        const target = {
            chronicle_metadata: snapshot.metadata.map((row) => ({ ...row })),
            chronicle_items: snapshot.items.map((row) => ({ ...row })),
            object_index: [
                ...snapshot.objects.map((row) => ({ ...row, etag: 'ignored' })),
                { logical_key: 'uploads/news/original/other.png', state: 'ready' }
            ]
        };
        assert.deepEqual(reconcileChronicle(snapshot, target).differences, []);
        target.chronicle_items[0].uploader = 'changed';
        assert.deepEqual(reconcileChronicle(snapshot, target).differences[0].fields, ['uploader']);
        assert.throws(
            () => reconcileChronicle({ ...snapshot, snapshotHash: '0'.repeat(64) }, target),
            /snapshot hash does not match/
        );
        assert.throws(
            () => reconcileChronicle(snapshot, {}),
            /must contain chronicle_metadata\[\]/
        );
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('[D1-CHR] Chronicle export rejects unsafe metadata and non-bijective R2 associations', (context) => {
    if (process.platform === 'win32') context.skip('symlink fixture requires POSIX semantics');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ims-chronicle-meta-reject-'));
    const meta = path.join(root, 'meta');
    const manifest = path.join(root, 'manifest.json');
    try {
        writeMetadata(meta, {
            alpha: {
                records: [
                    { filename: 'same.png', status: 'approved' },
                    { filename: 'same.png', status: 'pending' },
                    { filename: 'bad.png', status: 'unknown' },
                    { filename: 'e\u0301.png', status: 'pending' }
                ]
            }
        });
        fs.symlinkSync(path.join(meta, 'alpha.json'), path.join(meta, 'link.json'));
        writeManifest(manifest, 'chronicle-reject', [
            manifestEntry('chronicle-reject', `${PREFIX}/upload/orphan/orphan.png`, 'pending')
        ]);
        const snapshot = buildChronicleSnapshot(meta, manifest, 'chronicle-reject');
        const codes = new Set(snapshot.rejects.map((reject) => reject.code));
        for (const code of [
            'duplicate-filename', 'invalid-status', 'unsafe-filename', 'symlink',
            'orphan-r2-object', 'missing-r2-object'
        ]) assert.ok(codes.has(code), `missing ${code}: ${JSON.stringify(snapshot.rejects)}`);
        assert.deepEqual(chronicleSql(snapshot), []);

        const output = path.join(root, 'output.sql');
        const rejects = path.join(root, 'rejects.json');
        const snapshotFile = path.join(root, 'snapshot.json');
        const result = spawnSync(process.execPath, [
            SCRIPT, 'export', meta, manifest, output, 'chronicle-reject',
            '--rejects', rejects, '--snapshot-json', snapshotFile
        ], { cwd: PROJECT_ROOT, encoding: 'utf8' });
        assert.equal(result.status, 2, result.stderr);
        assert.equal(fs.existsSync(output), false);
        assert.equal(fs.existsSync(snapshotFile), false);
        assert.ok(JSON.parse(fs.readFileSync(rejects, 'utf8')).rejects.length > 0);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('[D1-CHR] source mutation and unconfirmed empty metadata produce no snapshot', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ims-chronicle-meta-proof-'));
    const meta = path.join(root, 'meta');
    const manifest = path.join(root, 'manifest.json');
    try {
        writeMetadata(meta, { alpha: { records: [] } });
        writeManifest(manifest, 'chronicle-proof', []);
        assert.throws(() => buildChronicleSnapshot(meta, manifest, 'chronicle-proof', {
            beforeRead(file) { fs.appendFileSync(file, ' '); }
        }), /changed while reading/);

        fs.rmSync(meta, { recursive: true, force: true });
        fs.mkdirSync(meta);
        let failure;
        try {
            buildChronicleSnapshot(meta, manifest, 'chronicle-proof');
        } catch (error) {
            failure = error;
        }
        assert.match(String(failure?.message), /confirm-empty-source-sha256/);
        const confirmation = String(failure.message).match(/[a-f0-9]{64}/)?.[0];
        assert.match(confirmation, /^[a-f0-9]{64}$/);
        const empty = buildChronicleSnapshot(meta, manifest, 'chronicle-proof', {
            confirmEmptySourceSha256: confirmation
        });
        assert.deepEqual(empty.rejects, []);
        assert.deepEqual(empty.metadata, []);
        assert.deepEqual(empty.items, []);
        assert.deepEqual(empty.objects, []);
        assert.ok(chronicleSql(empty).length > 0);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('[D1-CHR] reconcile CLI rejects a structurally incomplete target export', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ims-chronicle-reconcile-shape-'));
    try {
        const snapshot = confirmedEmptySnapshot(root, 'chronicle-empty-reconcile');
        const snapshotFile = path.join(root, 'snapshot.json');
        const targetFile = path.join(root, 'target.json');
        const rejects = path.join(root, 'rejects.json');
        fs.writeFileSync(snapshotFile, JSON.stringify(snapshot));
        fs.writeFileSync(targetFile, '{}');
        const result = spawnSync(process.execPath, [
            SCRIPT, 'reconcile', snapshotFile, targetFile, '--rejects', rejects
        ], { cwd: PROJECT_ROOT, encoding: 'utf8' });
        assert.equal(result.status, 1, result.stderr);
        assert.match(result.stderr, /must contain chronicle_metadata\[\]/);
        assert.equal(fs.existsSync(rejects), false);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('[D1-CHR] R2 transfer and Chronicle import reconcile through the same local Core D1', {
    timeout: 120_000
}, async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ims-chronicle-shared-core-'));
    const persist = path.join(root, 'persist');
    const media = path.join(root, 'media');
    const meta = path.join(root, 'meta');
    const target = path.join(root, 'r2-target');
    const manifestFile = path.join(root, 'manifest.json');
    const sqlFile = path.join(root, 'chronicle.sql');
    const runId = 'chronicle-shared-core';
    let transport;
    try {
        fs.mkdirSync(media);
        fs.writeFileSync(path.join(media, 'approved.png'), Buffer.from([
            0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3
        ]));
        writeMetadata(meta, {
            alpha: {
                title: 'Shared Core',
                records: [{
                    filename: 'approved.png',
                    uploader: 'fixture',
                    time: '2026-07-21T04:00:00.000Z',
                    status: 'approved'
                }]
            }
        }, '2026-07-21T05:00:00.000Z');
        const built = buildManifest(media, {
            runId,
            logicalPrefix: `${PREFIX}/used/alpha`,
            state: 'ready'
        });
        assert.deepEqual(built.errors, []);
        fs.writeFileSync(manifestFile, `${JSON.stringify(built)}\n`);
        const snapshot = buildChronicleSnapshot(meta, manifestFile, runId);
        assert.deepEqual(snapshot.rejects, []);
        writeSql(sqlFile, snapshot);

        wrangler(root, ['d1', 'migrations', 'apply', 'CORE_DB', '--local', '--persist-to', persist]);
        const coreDatabase = findLocalCoreDatabase(persist);
        transport = new FixtureTransferTransport(target, { databasePath: coreDatabase });
        const transfer = await transferManifest({
            manifest: built.manifest,
            sourceRoot: media,
            transport,
            dryRun: false,
            pruneExactScopes: true,
            bucketExact: true
        });
        assert.equal(transfer.runId, runId);
        assert.equal(transfer.verification.acceptanceMode, 'bucket-exact');
        assert.deepEqual(transfer.verification.differences, []);
        await transport.close();
        transport = null;

        wrangler(root, [
            'd1', 'execute', 'CORE_DB', '--local', '--persist-to', persist,
            '--file', sqlFile, '--yes'
        ]);
        const exported = {
            chronicle_metadata: query(root, persist, `
                SELECT activity_id,document_json,updated_at,commit_token
                FROM chronicle_metadata ORDER BY activity_id
            `),
            chronicle_items: query(root, persist, `
                SELECT id,activity_id,filename,uploader,uploaded_at,status,logical_key,idempotency_key
                FROM chronicle_items ORDER BY id
            `),
            object_index: query(root, persist, `
                SELECT logical_key,object_id,state,byte_size,content_type,sha256
                FROM object_index ORDER BY logical_key
            `)
        };
        assert.deepEqual(reconcileChronicle(snapshot, exported).differences, []);
        assert.deepEqual(query(root, persist, `
            SELECT status FROM _ims_chronicle_snapshot_runs WHERE run_id='${runId}'
        `), [{ status: 'completed' }]);

        transport = new FixtureTransferTransport(target, { databasePath: coreDatabase });
        const finalR2 = await verifyTransferredManifest(built.manifest, transport, undefined, {
            bucketExact: true
        });
        assert.deepEqual(finalR2.differences, []);
    } finally {
        await transport?.close();
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('[D1-CHR] real Wrangler converges A -> B -> B and fences conflict/tail truncation', {
    timeout: 120_000
}, () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ims-chronicle-meta-wrangler-'));
    const persist = path.join(root, 'persist');
    const tailPersist = path.join(root, 'tail-persist');
    const racePersist = path.join(root, 'race-persist');
    try {
        const snapshotA = fixtureSnapshot(root, 'chronicle-a', {
            alpha: { title: 'A', records: [{ filename: 'old.png', status: 'approved' }] },
            removed: { title: 'Removed', records: [] }
        }, '2026-07-21T01:00:00.000Z', 'a');
        const snapshotB = fixtureSnapshot(root, 'chronicle-b', {
            alpha: { title: 'B', records: [{ filename: 'new.png', status: 'pending' }] }
        }, '2026-07-21T02:00:00.000Z', 'b');
        const conflictingA = fixtureSnapshot(root, 'chronicle-a', {
            alpha: { title: 'Conflict', records: [{ filename: 'new.png', status: 'pending' }] }
        }, '2026-07-21T03:00:00.000Z', 'conflict');
        const empty = confirmedEmptySnapshot(root, 'chronicle-empty');
        for (const snapshot of [snapshotA, snapshotB, conflictingA, empty]) {
            assert.deepEqual(snapshot.rejects, []);
        }
        const fileA = path.join(root, 'a.sql');
        const fileB = path.join(root, 'b.sql');
        const fileConflict = path.join(root, 'conflict.sql');
        writeSql(fileA, snapshotA);
        writeSql(fileB, snapshotB);
        writeSql(fileConflict, conflictingA);

        wrangler(root, ['d1', 'migrations', 'apply', 'CORE_DB', '--local', '--persist-to', persist]);
        seedObjectIndex(root, persist, snapshotA.objects);
        wrangler(root, ['d1', 'execute', 'CORE_DB', '--local', '--persist-to', persist, '--file', fileA, '--yes']);
        wrangler(root, ['d1', 'execute', 'CORE_DB', '--local', '--persist-to', persist, '--file', fileA, '--yes']);
        const conflict = wrangler(root, [
            'd1', 'execute', 'CORE_DB', '--local', '--persist-to', persist, '--file', fileConflict, '--yes'
        ], 1);
        assert.match(`${conflict.stdout}\n${conflict.stderr}`, /(?:unique|constraint)/i);
        assert.deepEqual(query(root, persist, `
            SELECT (SELECT COUNT(*) FROM chronicle_metadata) AS metadata,
                   (SELECT COUNT(*) FROM chronicle_items) AS items,
                   (SELECT document_json FROM chronicle_metadata WHERE activity_id='alpha') AS document_json
        `), [{
            metadata: 2,
            items: 1,
            document_json: JSON.stringify({ title: 'A', records: [{ filename: 'old.png', status: 'approved' }] })
        }]);

        seedObjectIndex(root, persist, snapshotB.objects);
        wrangler(root, ['d1', 'execute', 'CORE_DB', '--local', '--persist-to', persist, '--file', fileB, '--yes']);
        wrangler(root, ['d1', 'execute', 'CORE_DB', '--local', '--persist-to', persist, '--file', fileB, '--yes']);
        assert.deepEqual(query(root, persist, `
            SELECT (SELECT COUNT(*) FROM chronicle_metadata) AS metadata,
                   (SELECT COUNT(*) FROM chronicle_items) AS items,
                   (SELECT status FROM chronicle_items) AS status,
                   (SELECT COUNT(*) FROM _ims_chronicle_snapshot_guard) AS guards,
                   (SELECT COUNT(*) FROM sqlite_master WHERE type='table'
                    AND name GLOB '_ims_chronicle_snapshot_stage_*') AS stages
        `), [{ metadata: 1, items: 1, status: 'pending', guards: 0, stages: 0 }]);

        const emptyFile = path.join(root, 'empty.sql');
        writeSql(emptyFile, empty);
        seedObjectIndex(root, persist, []);
        wrangler(root, ['d1', 'execute', 'CORE_DB', '--local', '--persist-to', persist, '--file', emptyFile, '--yes']);
        wrangler(root, ['d1', 'execute', 'CORE_DB', '--local', '--persist-to', persist, '--file', emptyFile, '--yes']);
        assert.deepEqual(query(root, persist, `
            SELECT (SELECT COUNT(*) FROM chronicle_metadata) AS metadata,
                   (SELECT COUNT(*) FROM chronicle_items) AS items,
                   (SELECT COUNT(*) FROM _ims_chronicle_snapshot_guard) AS guards,
                   (SELECT COUNT(*) FROM sqlite_master WHERE type='table'
                    AND name GLOB '_ims_chronicle_snapshot_stage_*') AS stages
        `), [{ metadata: 0, items: 0, guards: 0, stages: 0 }]);

        wrangler(root, ['d1', 'migrations', 'apply', 'CORE_DB', '--local', '--persist-to', racePersist]);
        seedObjectIndex(root, racePersist, snapshotB.objects);
        const raceStatements = chronicleSql(snapshotB);
        const applying = raceStatements.findIndex((statement) =>
            statement.startsWith('UPDATE _ims_chronicle_snapshot_guard SET phase=\'applying\'')
        );
        assert.ok(applying > 0);
        const racePrefix = path.join(root, 'race-prefix.sql');
        const raceSuffix = path.join(root, 'race-suffix.sql');
        writeSql(racePrefix, snapshotB, raceStatements.slice(0, applying));
        writeSql(raceSuffix, snapshotB, raceStatements.slice(applying));
        wrangler(root, [
            'd1', 'execute', 'CORE_DB', '--local', '--persist-to', racePersist,
            '--file', racePrefix, '--yes'
        ]);
        wrangler(root, [
            'd1', 'execute', 'CORE_DB', '--local', '--persist-to', racePersist,
            '--command', `DELETE FROM object_index WHERE logical_key=${sqlLiteral(snapshotB.objects[0].logical_key)}`
        ]);
        const raced = wrangler(root, [
            'd1', 'execute', 'CORE_DB', '--local', '--persist-to', racePersist,
            '--file', raceSuffix, '--yes'
        ], 1);
        assert.match(`${raced.stdout}\n${raced.stderr}`, /(?:check|constraint)/i);
        assert.deepEqual(query(root, racePersist, `
            SELECT (SELECT COUNT(*) FROM _ims_chronicle_snapshot_guard) AS guards,
                   (SELECT phase FROM _ims_chronicle_snapshot_guard) AS phase,
                   (SELECT status FROM _ims_chronicle_snapshot_runs WHERE run_id='chronicle-b') AS status,
                   (SELECT COUNT(*) FROM sqlite_master WHERE type='table'
                    AND (name='_ims_chronicle_snapshot_assertion'
                         OR name GLOB '_ims_chronicle_snapshot_stage_*')) AS transient
        `), [{ guards: 1, phase: 'staging', status: 'active', transient: 4 }]);

        wrangler(root, ['d1', 'migrations', 'apply', 'CORE_DB', '--local', '--persist-to', tailPersist]);
        seedObjectIndex(root, tailPersist, snapshotB.objects);
        const statements = chronicleSql(snapshotB);
        const firstDrop = statements.findIndex((statement) => statement.startsWith('DROP TABLE'));
        const tailFile = path.join(root, 'tail.sql');
        writeSql(tailFile, snapshotB, statements.slice(0, firstDrop));
        wrangler(root, [
            'd1', 'execute', 'CORE_DB', '--local', '--persist-to', tailPersist, '--file', tailFile, '--yes'
        ]);
        assert.deepEqual(query(root, tailPersist, `
            SELECT (SELECT COUNT(*) FROM _ims_chronicle_snapshot_guard) AS guards,
                   (SELECT status FROM _ims_chronicle_snapshot_runs WHERE run_id='chronicle-b') AS status,
                   (SELECT COUNT(*) FROM sqlite_master WHERE type='table'
                    AND (name='_ims_chronicle_snapshot_assertion'
                         OR name GLOB '_ims_chronicle_snapshot_stage_*')) AS transient
        `), [{ guards: 1, status: 'active', transient: 4 }]);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});
