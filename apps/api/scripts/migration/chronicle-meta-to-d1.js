'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const RUN_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const utf8 = new TextDecoder('utf-8', { fatal: true });
const CHRONICLE_PREFIX = 'assets/images/eventchronicle/events/';
const ACTIVE_PREFIXES = [`${CHRONICLE_PREFIX}upload/`, `${CHRONICLE_PREFIX}used/`];
const CONTROL = {
    guard: '_ims_chronicle_snapshot_guard',
    runs: '_ims_chronicle_snapshot_runs',
    assertion: '_ims_chronicle_snapshot_assertion',
    metadata: '_ims_chronicle_snapshot_stage_metadata',
    items: '_ims_chronicle_snapshot_stage_items',
    objects: '_ims_chronicle_snapshot_stage_objects'
};
const RECONCILIATION_DEFINITIONS = {
    chronicle_metadata: {
        key: ['activity_id'],
        fields: ['activity_id', 'document_json', 'updated_at', 'commit_token']
    },
    chronicle_items: {
        key: ['id'],
        fields: [
            'id', 'activity_id', 'filename', 'uploader', 'uploaded_at',
            'status', 'logical_key', 'idempotency_key'
        ]
    },
    object_index: {
        key: ['logical_key'],
        fields: ['logical_key', 'object_id', 'state', 'byte_size', 'content_type', 'sha256']
    }
};

function sha256(value) {
    return crypto.createHash('sha256').update(value).digest('hex');
}

function canonical(value) {
    if (Array.isArray(value)) return value.map(canonical);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
}

function compareText(left, right) {
    return left < right ? -1 : left > right ? 1 : 0;
}

function snapshotHash(value) {
    return sha256(JSON.stringify(canonical(value)));
}

function validateRunId(runId) {
    if (typeof runId !== 'string' || !RUN_ID_PATTERN.test(runId)) {
        throw new Error('Run ID must match [A-Za-z0-9][A-Za-z0-9._-]{0,79}');
    }
    return runId;
}

function literal(value) {
    if (value === null || value === undefined) return 'NULL';
    if (typeof value === 'number') {
        if (!Number.isSafeInteger(value)) throw new Error('Only safe integers can be imported');
        return String(value);
    }
    if (typeof value !== 'string') throw new Error(`Unsupported SQL literal: ${typeof value}`);
    if (value.includes('\0')) throw new Error('NUL text cannot be imported');
    return `'${value.replaceAll("'", "''")}'`;
}

function safeSegment(value) {
    return typeof value === 'string' && value.length > 0 && value === value.trim() &&
        value === value.normalize('NFC') && value !== '.' && value !== '..' &&
        !/[\x00-\x1f\x7f\\/<>:"|?*]/.test(value) &&
        Buffer.byteLength(value, 'utf16le') / 2 <= 180;
}

function statProof(stat) {
    return {
        dev: stat.dev.toString(),
        ino: stat.ino.toString(),
        size: stat.size.toString(),
        mtimeNs: stat.mtimeNs.toString(),
        ctimeNs: stat.ctimeNs.toString(),
        mode: stat.mode.toString()
    };
}

function sameProof(left, right) {
    return JSON.stringify(left) === JSON.stringify(right);
}

function bufferPath(root, name) {
    return Buffer.concat([Buffer.from(root), Buffer.from(path.sep), name]);
}

function directoryProof(root) {
    const rootStat = fs.lstatSync(root, { bigint: true });
    if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) {
        throw new Error('Chronicle metadata root must be a real directory');
    }
    const entries = fs.readdirSync(root, { encoding: 'buffer', withFileTypes: true })
        .map((entry) => {
            const name = Buffer.from(entry.name);
            const stat = fs.lstatSync(bufferPath(root, name), { bigint: true });
            return {
                name,
                nameHex: name.toString('hex'),
                type: stat.isSymbolicLink() ? 'symlink' : stat.isFile() ? 'file' :
                    stat.isDirectory() ? 'directory' : 'other',
                stat: statProof(stat)
            };
        })
        .sort((left, right) => compareText(left.nameHex, right.nameHex));
    return { root: statProof(rootStat), entries };
}

function serializableDirectoryProof(proof) {
    return {
        root: proof.root,
        entries: proof.entries.map(({ nameHex, type, stat }) => ({ nameHex, type, stat }))
    };
}

function readStableFile(file, expectedProof, options = {}) {
    const before = statProof(fs.lstatSync(file, { bigint: true }));
    if (!sameProof(before, expectedProof)) throw new Error('Source changed before file read');
    options.beforeRead?.(file);
    const body = fs.readFileSync(file);
    options.afterRead?.(file);
    const afterStat = fs.lstatSync(file, { bigint: true });
    const after = statProof(afterStat);
    if (!sameProof(before, after) || BigInt(body.byteLength) !== afterStat.size) {
        throw new Error('Source changed while reading');
    }
    return { body, proof: before, sha256: sha256(body) };
}

function decodeName(name) {
    try {
        return utf8.decode(name);
    } catch {
        return null;
    }
}

function isoFromMtime(proof) {
    return new Date(Number(BigInt(proof.mtimeNs) / 1000000n)).toISOString();
}

function chronicleItem(activityId, record) {
    const status = record.status === 'approved'
        ? 'ready'
        : record.status === 'pending' ? 'pending' : 'deleted';
    const bucket = status === 'ready' ? 'used' : 'upload';
    const filename = record.filename;
    return {
        id: `ci-${sha256(`chronicle-item\0${activityId}\0${filename}`)}`,
        activity_id: activityId,
        filename,
        uploader: typeof record.uploader === 'string' ? record.uploader : null,
        uploaded_at: typeof record.time === 'string' ? record.time : null,
        status,
        logical_key: `${CHRONICLE_PREFIX}${bucket}/${activityId}/${filename}`,
        idempotency_key: typeof record.idempotencyKey === 'string' && record.idempotencyKey
            ? record.idempotencyKey
            : `legacy:${activityId}:${filename}`
    };
}

function parseMetadataEntry(root, entry, rejects, options = {}) {
    const name = decodeName(entry.name);
    if (name === null) {
        rejects.push({ code: 'invalid-utf8-name', nameHex: entry.nameHex });
        return null;
    }
    if (entry.type !== 'file') {
        rejects.push({ code: entry.type, file: name });
        return null;
    }
    if (!name.endsWith('.json')) {
        rejects.push({ code: 'non-json-entry', file: name });
        return null;
    }
    const activityId = name.slice(0, -'.json'.length);
    if (!safeSegment(activityId)) {
        rejects.push({ code: 'unsafe-activity-id', file: name, activityId });
        return null;
    }
    const file = path.join(root, name);
    const source = readStableFile(file, entry.stat, options);
    let documentJson;
    try {
        documentJson = utf8.decode(source.body);
    } catch {
        rejects.push({ code: 'invalid-utf8-json', file: name });
        return null;
    }
    if (documentJson.includes('\0')) {
        rejects.push({ code: 'nul-json', file: name });
        return null;
    }
    let document;
    try {
        document = JSON.parse(documentJson);
    } catch (error) {
        rejects.push({ code: 'invalid-json', file: name, detail: error.message });
        return null;
    }
    const records = Array.isArray(document)
        ? document
        : document && typeof document === 'object' && !Array.isArray(document)
            ? !Object.hasOwn(document, 'records')
                ? []
                : Array.isArray(document.records) ? document.records : null
            : null;
    if (!records) {
        rejects.push({ code: 'invalid-records', file: name });
        return null;
    }
    const seen = new Set();
    const items = [];
    for (let index = 0; index < records.length; index += 1) {
        const record = records[index];
        if (!record || typeof record !== 'object' || Array.isArray(record)) {
            rejects.push({ code: 'non-object-record', file: name, record: index });
            continue;
        }
        if (!safeSegment(record.filename)) {
            rejects.push({ code: 'unsafe-filename', file: name, record: index });
            continue;
        }
        if (!['pending', 'approved', 'deleted'].includes(record.status)) {
            rejects.push({ code: 'invalid-status', file: name, record: index, value: record.status });
            continue;
        }
        if (seen.has(record.filename)) {
            rejects.push({ code: 'duplicate-filename', file: name, record: index, filename: record.filename });
            continue;
        }
        seen.add(record.filename);
        for (const field of ['uploader', 'time', 'idempotencyKey']) {
            if (record[field] !== undefined && record[field] !== null && typeof record[field] !== 'string') {
                rejects.push({ code: 'invalid-optional-field', file: name, record: index, field });
            }
        }
        items.push(chronicleItem(activityId, record));
    }
    return {
        metadata: {
            activity_id: activityId,
            document_json: documentJson,
            updated_at: isoFromMtime(source.proof),
            document_sha256: source.sha256
        },
        items,
        source: { file: name, sha256: source.sha256, bytes: source.body.byteLength, stat: source.proof }
    };
}

function loadManifest(file, rejects) {
    const linkStat = fs.lstatSync(file, { bigint: true });
    if (linkStat.isSymbolicLink() || !linkStat.isFile()) {
        throw new Error('R2 manifest must be a real regular file');
    }
    const before = statProof(linkStat);
    const body = fs.readFileSync(file);
    const after = statProof(fs.lstatSync(file, { bigint: true }));
    if (!sameProof(before, after)) throw new Error('R2 manifest changed while reading');
    let parsed;
    try {
        parsed = JSON.parse(utf8.decode(body));
    } catch (error) {
        rejects.push({ code: 'invalid-r2-manifest', detail: error.message });
        return { document: null, sha256: sha256(body) };
    }
    const blockers = Array.isArray(parsed.errors) ? parsed.errors : [];
    if (blockers.length) rejects.push({ code: 'r2-manifest-blockers', count: blockers.length });
    return { document: parsed.manifest || parsed, sha256: sha256(body) };
}

function manifestAssociations(manifest, runId, items, rejects) {
    if (!manifest || typeof manifest !== 'object' || manifest.version !== 1 || !Array.isArray(manifest.entries)) {
        rejects.push({ code: 'invalid-r2-manifest-shape' });
        return [];
    }
    if (manifest.runId !== runId) {
        rejects.push({ code: 'r2-run-id-mismatch', expected: runId, actual: manifest.runId });
    }
    const activeItems = new Map(items.filter((item) => item.status !== 'deleted')
        .map((item) => [item.logical_key, item]));
    const associations = new Map();
    for (let index = 0; index < manifest.entries.length; index += 1) {
        const entry = manifest.entries[index];
        if (!entry || typeof entry !== 'object' || typeof entry.logicalKey !== 'string') continue;
        if (!ACTIVE_PREFIXES.some((prefix) => entry.logicalKey.startsWith(prefix))) continue;
        const key = entry.logicalKey;
        if (key !== key.normalize('NFC')) {
            rejects.push({ code: 'non-nfc-r2-key', logicalKey: key });
            continue;
        }
        if (associations.has(key)) {
            rejects.push({ code: 'duplicate-r2-key', logicalKey: key });
            continue;
        }
        if (entry.runId !== runId || typeof entry.objectId !== 'string' ||
            entry.objectKey !== `objects/${entry.objectId}` ||
            !Number.isSafeInteger(entry.bytes) || entry.bytes < 0 ||
            typeof entry.sha256 !== 'string' || !SHA256_PATTERN.test(entry.sha256) ||
            typeof entry.mime !== 'string' || !entry.mime.startsWith('image/') ||
            !['pending', 'ready'].includes(entry.state)) {
            rejects.push({ code: 'invalid-r2-association', logicalKey: key, entry: index });
            continue;
        }
        const item = activeItems.get(key);
        if (!item) {
            rejects.push({ code: 'orphan-r2-object', logicalKey: key });
        } else if (item.status !== entry.state) {
            rejects.push({
                code: 'r2-state-mismatch', logicalKey: key,
                expected: item.status, actual: entry.state
            });
        }
        associations.set(key, {
            logical_key: key,
            object_id: entry.objectId,
            state: entry.state,
            byte_size: entry.bytes,
            content_type: entry.mime,
            sha256: entry.sha256.toLowerCase()
        });
    }
    for (const item of activeItems.values()) {
        if (!associations.has(item.logical_key)) {
            rejects.push({ code: 'missing-r2-object', logicalKey: item.logical_key });
        }
    }
    return [...associations.values()].sort((left, right) => compareText(left.logical_key, right.logical_key));
}

function uniqueActivityProofs(entries, rejects) {
    const normalized = new Map();
    for (const entry of entries) {
        const name = decodeName(entry.name);
        if (name === null || !name.endsWith('.json')) continue;
        const activityId = name.slice(0, -5);
        const key = activityId.normalize('NFC');
        if (normalized.has(key) && normalized.get(key) !== activityId) {
            rejects.push({ code: 'activity-normalization-collision', values: [normalized.get(key), activityId] });
        } else {
            normalized.set(key, activityId);
        }
    }
}

function buildChronicleSnapshot(metaDirInput, manifestPathInput, runId, options = {}) {
    validateRunId(runId);
    const metaDir = path.resolve(metaDirInput);
    const manifestPath = path.resolve(manifestPathInput);
    const before = directoryProof(metaDir);
    const rejects = [];
    uniqueActivityProofs(before.entries, rejects);
    const parsedEntries = [];
    for (const entry of before.entries) {
        const parsed = parseMetadataEntry(metaDir, entry, rejects, options);
        if (parsed) parsedEntries.push(parsed);
    }
    const after = directoryProof(metaDir);
    if (!sameProof(serializableDirectoryProof(before), serializableDirectoryProof(after))) {
        throw new Error('Chronicle metadata directory changed during export');
    }
    const sourceSnapshotSha256 = snapshotHash(serializableDirectoryProof(before));
    if (!parsedEntries.length && options.confirmEmptySourceSha256?.toLowerCase() !== sourceSnapshotSha256) {
        throw new Error(
            `Empty Chronicle metadata requires --confirm-empty-source-sha256 ${sourceSnapshotSha256}`
        );
    }
    const manifestResult = loadManifest(manifestPath, rejects);
    const metadata = parsedEntries.map((entry) => entry.metadata)
        .sort((left, right) => compareText(left.activity_id, right.activity_id));
    const items = parsedEntries.flatMap((entry) => entry.items)
        .sort((left, right) => compareText(left.activity_id, right.activity_id) ||
            compareText(left.filename, right.filename));
    const objects = manifestAssociations(manifestResult.document, runId, items, rejects);
    const hash = snapshotHash({
        metadata: metadata.map(({ document_sha256: _digest, ...row }) => row),
        items,
        objects
    });
    const finalizedMetadata = metadata.map(({ document_sha256, ...row }) => ({
        ...row,
        commit_token: `migration:${runId}:${document_sha256}`
    }));
    return {
        version: 1,
        runId,
        snapshotHash: hash,
        source: {
            metaDir,
            sourceSnapshotSha256,
            files: parsedEntries.map((entry) => entry.source),
            manifestPath,
            manifestSha256: manifestResult.sha256
        },
        metadata: finalizedMetadata,
        items,
        objects,
        rejects
    };
}

function values(row, columns) {
    return columns.map((column) => literal(row[column])).join(', ');
}

function upsert(table, columns, conflictColumns, row) {
    const conflict = conflictColumns.join(', ');
    const update = columns.filter((column) => !conflictColumns.includes(column))
        .map((column) => `${column}=excluded.${column}`).join(', ');
    return `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${values(row, columns)}) ` +
        `ON CONFLICT(${conflict}) DO UPDATE SET ${update};`;
}

function rowMatch(left, right, columns) {
    return columns.map((column) => `${left}.${column} IS ${right}.${column}`).join(' AND ');
}

function chronicleSql(snapshot) {
    if (snapshot.rejects.length) return [];
    const run = literal(snapshot.runId);
    const hash = literal(snapshot.snapshotHash);
    const metadataColumns = ['activity_id', 'document_json', 'updated_at', 'commit_token'];
    const itemColumns = [
        'id', 'activity_id', 'filename', 'uploader', 'uploaded_at',
        'status', 'logical_key', 'idempotency_key'
    ];
    const objectColumns = ['logical_key', 'object_id', 'state', 'byte_size', 'content_type', 'sha256'];
    const objectMismatch = `
            EXISTS (SELECT 1 FROM ${CONTROL.objects} stage
                    WHERE NOT EXISTS (SELECT 1 FROM object_index target
                                      WHERE ${rowMatch('target', 'stage', objectColumns)}))
            OR EXISTS (SELECT 1 FROM object_index target
                       WHERE target.state IN ('pending','ready')
                         AND (target.logical_key LIKE ${literal(`${ACTIVE_PREFIXES[0]}%`)}
                              OR target.logical_key LIKE ${literal(`${ACTIVE_PREFIXES[1]}%`)})
                         AND NOT EXISTS (SELECT 1 FROM ${CONTROL.objects} stage
                                         WHERE ${rowMatch('target', 'stage', objectColumns)}))`;
    const statements = [
        'PRAGMA defer_foreign_keys = TRUE;',
        `CREATE TABLE IF NOT EXISTS ${CONTROL.guard} (
            lock_id INTEGER PRIMARY KEY CHECK(lock_id=1),
            run_id TEXT NOT NULL,
            snapshot_hash TEXT NOT NULL,
            phase TEXT NOT NULL CHECK(phase IN ('staging','applying')),
            started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );`,
        `CREATE TABLE IF NOT EXISTS ${CONTROL.runs} (
            run_id TEXT PRIMARY KEY,
            snapshot_hash TEXT NOT NULL,
            status TEXT NOT NULL CHECK(status IN ('active','completed')),
            started_at TEXT NOT NULL,
            completed_at TEXT
        );`,
        `INSERT INTO ${CONTROL.runs} (run_id,snapshot_hash,status,started_at,completed_at)
         SELECT ${run},${hash},'active',CURRENT_TIMESTAMP,NULL
         WHERE EXISTS (SELECT 1 FROM ${CONTROL.runs}
                       WHERE run_id=${run} AND snapshot_hash<>${hash});`,
        `INSERT INTO ${CONTROL.guard} (lock_id,run_id,snapshot_hash,phase)
         VALUES (1,${run},${hash},'staging');`,
        `INSERT INTO ${CONTROL.runs} (run_id,snapshot_hash,status,started_at,completed_at)
         VALUES (${run},${hash},'active',CURRENT_TIMESTAMP,NULL)
         ON CONFLICT(run_id) DO UPDATE SET status='active',started_at=CURRENT_TIMESTAMP,completed_at=NULL
         WHERE ${CONTROL.runs}.snapshot_hash=excluded.snapshot_hash;`,
        `CREATE TABLE IF NOT EXISTS ${CONTROL.assertion} (ok INTEGER NOT NULL CHECK(ok=1));`,
        `CREATE TABLE IF NOT EXISTS ${CONTROL.metadata} (
            activity_id TEXT PRIMARY KEY, document_json TEXT NOT NULL,
            updated_at TEXT NOT NULL, commit_token TEXT NOT NULL
        );`,
        `CREATE TABLE IF NOT EXISTS ${CONTROL.items} (
            id TEXT PRIMARY KEY, activity_id TEXT NOT NULL, filename TEXT NOT NULL,
            uploader TEXT, uploaded_at TEXT, status TEXT NOT NULL,
            logical_key TEXT NOT NULL, idempotency_key TEXT NOT NULL,
            UNIQUE(activity_id,filename)
        );`,
        `CREATE TABLE IF NOT EXISTS ${CONTROL.objects} (
            logical_key TEXT PRIMARY KEY, object_id TEXT NOT NULL, state TEXT NOT NULL,
            byte_size INTEGER NOT NULL, content_type TEXT NOT NULL, sha256 TEXT NOT NULL
        );`,
        `DELETE FROM ${CONTROL.metadata};`,
        `DELETE FROM ${CONTROL.items};`,
        `DELETE FROM ${CONTROL.objects};`,
        ...snapshot.metadata.map((row) =>
            `INSERT INTO ${CONTROL.metadata} (${metadataColumns.join(', ')}) VALUES (${values(row, metadataColumns)});`
        ),
        ...snapshot.items.map((row) =>
            `INSERT INTO ${CONTROL.items} (${itemColumns.join(', ')}) VALUES (${values(row, itemColumns)});`
        ),
        ...snapshot.objects.map((row) =>
            `INSERT INTO ${CONTROL.objects} (${objectColumns.join(', ')}) VALUES (${values(row, objectColumns)});`
        ),
        `DELETE FROM ${CONTROL.assertion};`,
        `INSERT INTO ${CONTROL.assertion} (ok)
         SELECT 0 WHERE ${objectMismatch};`,
        `UPDATE ${CONTROL.guard} SET phase='applying'
         WHERE lock_id=1 AND run_id=${run} AND snapshot_hash=${hash};`,
        `DELETE FROM chronicle_items
         WHERE NOT EXISTS (SELECT 1 FROM ${CONTROL.items} stage
                           WHERE stage.id IS chronicle_items.id
                             AND stage.activity_id IS chronicle_items.activity_id
                             AND stage.filename IS chronicle_items.filename);`,
        ...snapshot.metadata.map((row) =>
            upsert('chronicle_metadata', metadataColumns, ['activity_id'], row)
        ),
        ...snapshot.items.map((row) =>
            upsert('chronicle_items', itemColumns, ['id'], row)
        ),
        `DELETE FROM chronicle_metadata
         WHERE NOT EXISTS (SELECT 1 FROM ${CONTROL.metadata} stage
                           WHERE stage.activity_id IS chronicle_metadata.activity_id);`,
        `DELETE FROM ${CONTROL.assertion};`,
        `INSERT INTO ${CONTROL.assertion} (ok)
         SELECT 0 WHERE
            EXISTS (SELECT 1 FROM chronicle_metadata target
                    WHERE NOT EXISTS (SELECT 1 FROM ${CONTROL.metadata} stage
                                      WHERE ${rowMatch('target', 'stage', metadataColumns)}))
            OR EXISTS (SELECT 1 FROM ${CONTROL.metadata} stage
                       WHERE NOT EXISTS (SELECT 1 FROM chronicle_metadata target
                                         WHERE ${rowMatch('target', 'stage', metadataColumns)}))
            OR EXISTS (SELECT 1 FROM chronicle_items target
                       WHERE NOT EXISTS (SELECT 1 FROM ${CONTROL.items} stage
                                         WHERE ${rowMatch('target', 'stage', itemColumns)}))
            OR EXISTS (SELECT 1 FROM ${CONTROL.items} stage
                       WHERE NOT EXISTS (SELECT 1 FROM chronicle_items target
                                         WHERE ${rowMatch('target', 'stage', itemColumns)}))
            OR (${objectMismatch});`,
        `DROP TABLE ${CONTROL.objects};`,
        `DROP TABLE ${CONTROL.items};`,
        `DROP TABLE ${CONTROL.metadata};`,
        `DROP TABLE ${CONTROL.assertion};`,
        `UPDATE ${CONTROL.runs} SET status='completed',completed_at=CURRENT_TIMESTAMP
         WHERE run_id=${run} AND snapshot_hash=${hash};`,
        `DELETE FROM ${CONTROL.guard}
         WHERE lock_id=1 AND run_id=${run} AND snapshot_hash=${hash}
           AND EXISTS (SELECT 1 FROM ${CONTROL.runs}
                       WHERE run_id=${run} AND snapshot_hash=${hash} AND status='completed');`
    ];
    return statements;
}

function comparableSnapshot(snapshot) {
    return {
        chronicle_metadata: snapshot.metadata,
        chronicle_items: snapshot.items,
        object_index: snapshot.objects
    };
}

function keyedRows(rows, fields) {
    return new Map(rows.map((row) => [JSON.stringify(fields.map((field) => row[field])), row]));
}

function requireRows(document, table, definition, options = {}) {
    const rows = document[table];
    if (!Array.isArray(rows)) throw new Error(`Chronicle ${options.label || 'document'} must contain ${table}[]`);
    const seen = new Set();
    for (let index = 0; index < rows.length; index += 1) {
        const row = rows[index];
        if (!row || typeof row !== 'object' || Array.isArray(row)) {
            throw new Error(`Chronicle ${options.label || 'document'} ${table}[${index}] must be an object`);
        }
        const requiredFields = options.fieldsForRow ? options.fieldsForRow(row) : definition.fields;
        for (const field of requiredFields) {
            if (!Object.hasOwn(row, field) || row[field] === undefined) {
                throw new Error(`Chronicle ${options.label || 'document'} ${table}[${index}] lacks ${field}`);
            }
        }
        const key = JSON.stringify(definition.key.map((field) => row[field]));
        if (seen.has(key)) {
            throw new Error(`Chronicle ${options.label || 'document'} ${table} has duplicate key ${key}`);
        }
        seen.add(key);
    }
    return rows;
}

function validateSnapshotForReconcile(snapshot) {
    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot) || snapshot.version !== 1) {
        throw new Error('Chronicle snapshot version must be 1');
    }
    validateRunId(snapshot.runId);
    if (typeof snapshot.snapshotHash !== 'string' || !SHA256_PATTERN.test(snapshot.snapshotHash)) {
        throw new Error('Chronicle snapshot hash must be a SHA-256');
    }
    if (!Array.isArray(snapshot.rejects) || snapshot.rejects.length) {
        throw new Error('Chronicle snapshot must contain an empty rejects array');
    }
    for (const [table, definition] of Object.entries(RECONCILIATION_DEFINITIONS)) {
        requireRows(snapshot, table, definition, { label: 'snapshot' });
    }
    for (const row of snapshot.chronicle_metadata) {
        if (typeof row.commit_token !== 'string' ||
            !row.commit_token.startsWith(`migration:${snapshot.runId}:`) ||
            !SHA256_PATTERN.test(row.commit_token.slice(`migration:${snapshot.runId}:`.length))) {
            throw new Error('Chronicle snapshot contains an invalid metadata commit token');
        }
    }
    const calculated = snapshotHash({
        metadata: snapshot.chronicle_metadata.map(({ commit_token: _token, ...row }) => row),
        items: snapshot.chronicle_items,
        objects: snapshot.object_index
    });
    if (calculated !== snapshot.snapshotHash) {
        throw new Error('Chronicle snapshot hash does not match its rows');
    }
}

function validateTargetForReconcile(target) {
    if (!target || typeof target !== 'object' || Array.isArray(target)) {
        throw new Error('Chronicle target export must be an object');
    }
    requireRows(target, 'chronicle_metadata', RECONCILIATION_DEFINITIONS.chronicle_metadata, {
        label: 'target export'
    });
    requireRows(target, 'chronicle_items', RECONCILIATION_DEFINITIONS.chronicle_items, {
        label: 'target export'
    });
    requireRows(target, 'object_index', RECONCILIATION_DEFINITIONS.object_index, {
        label: 'target export',
        fieldsForRow(row) {
            const relevant = typeof row.logical_key === 'string' &&
                ACTIVE_PREFIXES.some((prefix) => row.logical_key.startsWith(prefix)) &&
                ['pending', 'ready'].includes(row.state);
            return relevant
                ? RECONCILIATION_DEFINITIONS.object_index.fields
                : ['logical_key', 'state'];
        }
    });
}

function reconcileChronicle(snapshot, target) {
    const normalizedSnapshot = {
        ...snapshot,
        chronicle_metadata: snapshot?.metadata,
        chronicle_items: snapshot?.items,
        object_index: snapshot?.objects
    };
    validateSnapshotForReconcile(normalizedSnapshot);
    validateTargetForReconcile(target);
    const expected = comparableSnapshot(snapshot);
    const differences = [];
    for (const [table, definition] of Object.entries(RECONCILIATION_DEFINITIONS)) {
        const expectedRows = expected[table];
        let actualRows = Array.isArray(target[table]) ? target[table] : [];
        if (table === 'object_index') {
            actualRows = actualRows.filter((row) => ACTIVE_PREFIXES.some((prefix) =>
                typeof row.logical_key === 'string' && row.logical_key.startsWith(prefix)
            ) && ['pending', 'ready'].includes(row.state));
        }
        const expectedByKey = keyedRows(expectedRows, definition.key);
        const actualByKey = keyedRows(actualRows, definition.key);
        for (const key of [...new Set([...expectedByKey.keys(), ...actualByKey.keys()])].sort()) {
            const left = expectedByKey.get(key);
            const right = actualByKey.get(key);
            if (!left) {
                differences.push({ table, code: 'extra-target-row', key: JSON.parse(key) });
                continue;
            }
            if (!right) {
                differences.push({ table, code: 'missing-target-row', key: JSON.parse(key) });
                continue;
            }
            const fields = definition.fields.filter((field) => left[field] !== right[field]);
            if (fields.length) differences.push({ table, code: 'field-mismatch', key: JSON.parse(key), fields });
        }
    }
    return { snapshotHash: snapshot.snapshotHash, differences };
}

function parseOptions(argv, allowed) {
    const positional = [];
    const options = {};
    for (let index = 0; index < argv.length; index += 1) {
        const value = argv[index];
        if (!value.startsWith('--')) {
            positional.push(value);
            continue;
        }
        if (!allowed.has(value)) throw new Error(`Unknown option: ${value}`);
        const next = argv[index + 1];
        if (!next || next.startsWith('--')) throw new Error(`${value} requires a value`);
        options[value.slice(2).replaceAll('-', '_')] = next;
        index += 1;
    }
    return { positional, options };
}

function writeJson(file, value) {
    fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
}

function writeRejects(file, metadata, rejects) {
    writeJson(file, { version: 1, generatedAt: new Date().toISOString(), ...metadata, rejects });
}

function main(argv) {
    const command = argv[0];
    if (command === 'export') {
        const { positional, options } = parseOptions(
            argv.slice(1),
            new Set(['--rejects', '--snapshot-json', '--confirm-empty-source-sha256'])
        );
        if (positional.length !== 4 || !options.rejects || !options.snapshot_json) {
            throw new Error(
                'Usage: chronicle-meta-to-d1.js export <meta-dir> <r2-manifest.json> <output.sql> <run-id> --rejects <file> --snapshot-json <file> [--confirm-empty-source-sha256 <sha256>]'
            );
        }
        const [metaDir, manifest, output, runId] = positional;
        const artifacts = [output, options.rejects, options.snapshot_json].map((file) => path.resolve(file));
        if (new Set(artifacts).size !== artifacts.length) throw new Error('Output paths must differ');
        for (const file of artifacts) if (fs.existsSync(file)) throw new Error(`Output already exists: ${file}`);
        if (options.confirm_empty_source_sha256 && !SHA256_PATTERN.test(options.confirm_empty_source_sha256)) {
            throw new Error('Empty source confirmation must be a SHA-256');
        }
        const snapshot = buildChronicleSnapshot(metaDir, manifest, runId, {
            confirmEmptySourceSha256: options.confirm_empty_source_sha256
        });
        const metadata = {
            runId,
            snapshotHash: snapshot.snapshotHash,
            source: snapshot.source
        };
        if (snapshot.rejects.length) {
            writeRejects(options.rejects, metadata, snapshot.rejects);
            process.stdout.write(`${JSON.stringify({ runId, rejects: snapshot.rejects.length })}\n`);
            process.exitCode = 2;
            return;
        }
        const statements = chronicleSql(snapshot);
        fs.writeFileSync(output, `${[
            '-- Generated from a frozen Chronicle metadata snapshot and merged R2 manifest.',
            `-- run_id=${runId} snapshot_hash=${snapshot.snapshotHash}`,
            ...statements
        ].join('\n')}\n`, { flag: 'wx', mode: 0o600 });
        writeRejects(options.rejects, metadata, []);
        writeJson(options.snapshot_json, snapshot);
        process.stdout.write(`${JSON.stringify({
            runId,
            snapshotHash: snapshot.snapshotHash,
            metadata: snapshot.metadata.length,
            items: snapshot.items.length,
            objects: snapshot.objects.length
        })}\n`);
        return;
    }
    if (command === 'reconcile') {
        const { positional, options } = parseOptions(argv.slice(1), new Set(['--rejects']));
        if (positional.length !== 2 || !options.rejects) {
            throw new Error(
                'Usage: chronicle-meta-to-d1.js reconcile <snapshot.json> <d1-export.json> --rejects <file>'
            );
        }
        const snapshot = JSON.parse(fs.readFileSync(positional[0], 'utf8'));
        const target = JSON.parse(fs.readFileSync(positional[1], 'utf8'));
        const result = reconcileChronicle(snapshot, target);
        writeRejects(options.rejects, { snapshotHash: result.snapshotHash }, result.differences);
        process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
        if (result.differences.length) process.exitCode = 4;
        return;
    }
    throw new Error('First argument must be export or reconcile');
}

if (require.main === module) {
    try {
        main(process.argv.slice(2));
    } catch (error) {
        console.error(error.message);
        process.exitCode = 1;
    }
}

module.exports = {
    ACTIVE_PREFIXES,
    buildChronicleSnapshot,
    chronicleSql,
    reconcileChronicle,
    safeSegment,
    snapshotHash,
    validateRunId
};
