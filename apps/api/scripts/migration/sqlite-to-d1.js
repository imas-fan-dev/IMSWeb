'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { TextDecoder } = require('node:util');
const sqlite3 = require('sqlite3').verbose();

const STORY_TABLES = ['765_stories', '876_stories', 'cg_stories', 'ml_stories', 'sidem_stories', 'sc_stories', 'gk_stories'];
const RUN_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/i;
const CORE_DEFINITIONS = {
    users: {
        columns: ['id', 'username', 'password', 'dept', 'producername'],
        types: ['INTEGER', 'TEXT', 'TEXT', 'TEXT', 'TEXT'],
        critical: ['id']
    },
    news: {
        columns: ['id', 'title', 'image', 'thumbnail', 'content', 'date', 'author'],
        types: ['INTEGER', 'TEXT', 'TEXT', 'TEXT', 'TEXT', 'TEXT', 'TEXT'],
        critical: ['id']
    },
    logs: {
        columns: ['id', 'username', 'producername', 'action', 'target', 'ip', 'time'],
        types: ['INTEGER', 'TEXT', 'TEXT', 'TEXT', 'TEXT', 'TEXT', 'TEXT'],
        critical: ['id']
    },
    cards: {
        columns: ['id', 'image1_url', 'image2_url', 'hash1', 'hash2', 'ip', 'status', 'created_at'],
        types: ['INTEGER', 'TEXT', 'TEXT', 'TEXT', 'TEXT', 'TEXT', 'TEXT', 'TEXT'],
        critical: ['id', 'image1_url', 'image2_url', 'status', 'created_at']
    },
    events: {
        columns: ['id', 'title', 'name', 'contact', 'image_url', 'created_at'],
        types: ['INTEGER', 'TEXT', 'TEXT', 'TEXT', 'TEXT', 'TEXT'],
        critical: ['id', 'created_at']
    },
    card_emojis: {
        columns: ['id', 'card_id', 'emoji', 'count'],
        types: ['INTEGER', 'INTEGER', 'TEXT', 'INTEGER'],
        critical: ['id', 'card_id', 'emoji', 'count']
    }
};
const STORY_BASE_DEFINITIONS = {
    agencies: {
        columns: ['id', 'code', 'name_cn', 'color'],
        types: ['INTEGER', 'TEXT', 'TEXT', 'TEXT']
    },
    idols: {
        columns: ['id', 'agency_id', 'name_cn', 'folder_name', 'color'],
        types: ['INTEGER', 'INTEGER', 'TEXT', 'TEXT', 'TEXT']
    },
    theme_colors: {
        columns: ['name', 'color'],
        types: ['TEXT', 'TEXT']
    }
};
const STORY_ROW_DEFINITION = {
    columns: ['id', 'idol_id', 'category', 'card_name', 'up_name', 'video_title', 'url', 'subtitle', 'image_file'],
    types: ['INTEGER', 'INTEGER', 'TEXT', 'TEXT', 'TEXT', 'TEXT', 'TEXT', 'TEXT', 'TEXT']
};
const CORE_GUARD_TABLE = '_ims_core_snapshot_guard';
const CORE_RUN_TABLE = '_ims_core_snapshot_runs';
const CORE_ASSERTION_TABLE = '_ims_core_snapshot_assertion';
const CORE_SEQUENCE_STAGE = '_ims_core_snapshot_stage_sqlite_sequence';
const CORE_SEQUENCE_DEFINITION = {
    columns: ['name', 'seq'],
    types: ['TEXT', 'INTEGER']
};
const STORY_GUARD_TABLE = '_ims_story_snapshot_guard';
const STORY_RUN_TABLE = '_ims_story_snapshot_runs';
const STORY_ASSERTION_TABLE = '_ims_story_snapshot_assertion';
const UTF8_DECODER = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
const STORY_TARGET_DEFINITIONS = {
    agencies: {
        columns: ['id', 'code', 'name_cn', 'color'],
        types: ['INTEGER', 'TEXT', 'TEXT', 'TEXT'],
        primary: ['id']
    },
    idols: {
        columns: ['id', 'agency_id', 'name_cn', 'folder_name', 'color'],
        types: ['INTEGER', 'INTEGER', 'TEXT', 'TEXT', 'TEXT'],
        primary: ['id']
    },
    theme_colors: {
        columns: ['name', 'color'],
        types: ['TEXT', 'TEXT'],
        primary: ['name']
    },
    story_legacy_rows: {
        columns: ['legacy_table', 'legacy_id', 'row_json', 'normalized_hash', 'last_seen_run_id'],
        types: ['TEXT', 'INTEGER', 'TEXT', 'TEXT', 'TEXT'],
        primary: ['legacy_table', 'legacy_id']
    },
    story_cards: {
        columns: [
            'idol_id', 'category', 'card_name', 'subtitle', 'image_file',
            'source_table', 'source_id', 'last_seen_run_id'
        ],
        types: ['INTEGER', 'TEXT', 'TEXT', 'TEXT', 'TEXT', 'TEXT', 'INTEGER', 'TEXT'],
        primary: ['source_table', 'source_id']
    },
    story_links: {
        columns: [
            'card_source_table', 'card_source_id', 'up_name', 'video_title', 'url',
            'source_table', 'source_id', 'source_link_index', 'last_seen_run_id'
        ],
        types: ['TEXT', 'INTEGER', 'TEXT', 'TEXT', 'TEXT', 'TEXT', 'INTEGER', 'INTEGER', 'TEXT'],
        primary: ['source_table', 'source_id', 'source_link_index']
    }
};

function all(database, sql, params = []) {
    return new Promise((resolve, reject) => database.all(sql, params, (error, rows) => error ? reject(error) : resolve(rows)));
}

function exec(database, sql) {
    return new Promise((resolve, reject) => database.exec(sql, (error) => error ? reject(error) : resolve()));
}

function close(database) {
    return new Promise((resolve, reject) => database.close(error => error ? reject(error) : resolve()));
}

function stable(value) {
    if (Array.isArray(value)) return value.map(stable);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
}

function hash(value) {
    return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
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
        if (!Number.isSafeInteger(value)) throw new Error('Only safe SQLite integers can be imported');
        return String(value);
    }
    if (typeof value !== 'string') throw new Error(`Unsupported SQL literal type: ${typeof value}`);
    if (value.includes('\0')) throw new Error('NUL text cannot be imported through a SQL file');
    return `'${value.replaceAll("'", "''")}'`;
}

function quoted(identifier) {
    return `"${identifier.replaceAll('"', '""')}"`;
}

async function typedRows(database, table, definition, orderBy, whereClause = '') {
    const typeAliases = definition.columns.map((_, index) => `__ims_type_${index}`);
    const byteAliases = definition.columns.map((_, index) => `__ims_bytes_${index}`);
    const selected = [
        ...definition.columns.map(quoted),
        ...definition.columns.map((column, index) => `typeof(${quoted(column)}) AS ${quoted(typeAliases[index])}`),
        ...definition.columns.map((column, index) =>
            `CASE WHEN typeof(${quoted(column)})='text' ` +
            `THEN hex(CAST(${quoted(column)} AS BLOB)) END AS ${quoted(byteAliases[index])}`
        )
    ];
    const records = await all(
        database,
        `SELECT ${selected.join(', ')} FROM ${quoted(table)}` +
        `${whereClause ? ` WHERE ${whereClause}` : ''} ORDER BY ${quoted(orderBy)}`
    );
    const rows = [];
    const rejects = [];
    for (let rowIndex = 0; rowIndex < records.length; rowIndex += 1) {
        const record = records[rowIndex];
        const row = Object.fromEntries(definition.columns.map((column) => [column, record[column]]));
        rows.push(row);
        for (let columnIndex = 0; columnIndex < definition.columns.length; columnIndex += 1) {
            const field = definition.columns[columnIndex];
            const storageClass = record[typeAliases[columnIndex]];
            if (storageClass === 'null') continue;
            const expected = definition.types[columnIndex].toLowerCase();
            if (storageClass !== expected) {
                rejects.push({
                    table, sourceId: row.id ?? row.name ?? rowIndex, code: 'storage-class',
                    field, expected, actual: storageClass
                });
                continue;
            }
            if (expected === 'integer' && !Number.isSafeInteger(row[field])) {
                rejects.push({
                    table, sourceId: row.id ?? row.name ?? rowIndex, code: 'unsafe-integer', field
                });
            }
            if (expected === 'text' && (typeof row[field] !== 'string' || row[field].includes('\0'))) {
                rejects.push({
                    table, sourceId: row.id ?? row.name ?? rowIndex,
                    code: row[field]?.includes?.('\0') ? 'nul-text' : 'storage-class',
                    field, expected: 'text', actual: storageClass
                });
                continue;
            }
            if (expected === 'text') {
                const rawHex = record[byteAliases[columnIndex]];
                const rawBytes = typeof rawHex === 'string' ? Buffer.from(rawHex, 'hex') : null;
                let decoded;
                try {
                    decoded = rawBytes ? UTF8_DECODER.decode(rawBytes) : undefined;
                } catch {
                    rejects.push({
                        table, sourceId: row.id ?? row.name ?? rowIndex,
                        code: 'invalid-utf8', field
                    });
                    continue;
                }
                if (decoded !== row[field] || !Buffer.from(decoded, 'utf8').equals(rawBytes)) {
                    rejects.push({
                        table, sourceId: row.id ?? row.name ?? rowIndex,
                        code: 'text-byte-roundtrip', field
                    });
                    continue;
                }
            }
            if (expected === 'text' && row[field] !== row[field].normalize('NFC')) {
                rejects.push({
                    table, sourceId: row.id ?? row.name ?? rowIndex,
                    code: 'non-nfc-text', field
                });
            }
        }
    }
    return { rows, rejects };
}

function sha256File(file) {
    return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function assertNoSqliteSidecars(source) {
    const sidecars = ['-wal', '-journal', '-shm'].map((suffix) => `${source}${suffix}`)
        .filter((file) => fs.existsSync(file));
    if (sidecars.length) {
        throw new Error(`Snapshot database has SQLite sidecar files: ${sidecars.join(', ')}`);
    }
}

function sourceProof(source) {
    const linkStat = fs.lstatSync(source, { bigint: true });
    if (linkStat.isSymbolicLink()) {
        throw new Error('Snapshot database must not be a symbolic link');
    }
    if (!linkStat.isFile()) throw new Error('Snapshot database does not exist');
    assertNoSqliteSidecars(source);
    const stat = fs.statSync(source, { bigint: true });
    return {
        dev: stat.dev,
        ino: stat.ino,
        size: stat.size,
        mtimeNs: stat.mtimeNs,
        ctimeNs: stat.ctimeNs,
        sha256: sha256File(source)
    };
}

function assertSameSourceProof(before, after) {
    for (const field of ['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs', 'sha256']) {
        if (before[field] !== after[field]) {
            throw new Error(`Snapshot database changed during export: ${field}`);
        }
    }
}

function immutableSqliteUri(source) {
    const uri = pathToFileURL(source);
    uri.searchParams.set('mode', 'ro');
    uri.searchParams.set('immutable', '1');
    return uri.href;
}

function insert(table, columns, row, conflictColumn = 'id') {
    const values = columns.map(column => literal(row[column])).join(', ');
    const updates = columns.filter(column => column !== conflictColumn)
        .map(column => `${column}=excluded.${column}`).join(', ');
    return `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${values}) ON CONFLICT(${conflictColumn}) DO UPDATE SET ${updates};`;
}

function coreStageTable(table) {
    return `_ims_core_snapshot_stage_${table}`;
}

function coreControlStatements() {
    return [
        `CREATE TABLE IF NOT EXISTS ${CORE_GUARD_TABLE} (
            lock_id INTEGER PRIMARY KEY CHECK(lock_id=1),
            run_id TEXT NOT NULL,
            snapshot_hash TEXT NOT NULL,
            phase TEXT NOT NULL CHECK(phase IN ('staging', 'applying')),
            started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );`,
        `CREATE TABLE IF NOT EXISTS ${CORE_RUN_TABLE} (
            run_id TEXT PRIMARY KEY,
            snapshot_hash TEXT NOT NULL,
            status TEXT NOT NULL CHECK(status IN ('active', 'completed')),
            started_at TEXT NOT NULL,
            completed_at TEXT
        );`,
        `CREATE TABLE IF NOT EXISTS ${CORE_ASSERTION_TABLE} (
            ok INTEGER NOT NULL CHECK(ok=1)
        );`
    ];
}

function coreStageStatements() {
    const statements = [];
    for (const [table, definition] of Object.entries(CORE_DEFINITIONS)) {
        const stage = coreStageTable(table);
        const stageColumns = definition.columns.map((column, index) =>
            `${column} ${definition.types[index]}${column === 'id' ? ' PRIMARY KEY' : ''}`
        ).join(', ');
        statements.push(`CREATE TABLE IF NOT EXISTS ${stage} (${stageColumns});`);
    }
    statements.push(
        `CREATE TABLE IF NOT EXISTS ${CORE_SEQUENCE_STAGE} (` +
        `name TEXT PRIMARY KEY, seq INTEGER);`
    );
    return statements;
}

function coreMismatchCondition() {
    const conditions = [];
    for (const [table, definition] of Object.entries(CORE_DEFINITIONS)) {
        const stage = coreStageTable(table);
        const targetMatchesStage = definition.columns
            .map((column) => `stage.${column} IS target.${column}`).join(' AND ');
        const stageMatchesTarget = definition.columns
            .map((column) => `target.${column} IS stage.${column}`).join(' AND ');
        conditions.push(
            `EXISTS (
                SELECT 1 FROM ${table} AS target
                WHERE NOT EXISTS (SELECT 1 FROM ${stage} AS stage WHERE ${targetMatchesStage})
            )`,
            `EXISTS (
                SELECT 1 FROM ${stage} AS stage
                WHERE NOT EXISTS (SELECT 1 FROM ${table} AS target WHERE ${stageMatchesTarget})
            )`
        );
    }
    conditions.push(
        `EXISTS (
            SELECT 1 FROM ${CORE_SEQUENCE_STAGE} AS stage
            WHERE (SELECT COUNT(*) FROM sqlite_sequence AS target
                   WHERE target.name=stage.name) <>
                  CASE WHEN stage.seq IS NULL THEN 0 ELSE 1 END
               OR (stage.seq IS NULL AND EXISTS (
                SELECT 1 FROM sqlite_sequence AS target WHERE target.name=stage.name
            )) OR (stage.seq IS NOT NULL AND NOT EXISTS (
                SELECT 1 FROM sqlite_sequence AS target
                WHERE target.name=stage.name AND target.seq IS stage.seq
            ))
        )`,
        `EXISTS (
            SELECT 1 FROM sqlite_sequence AS target
            WHERE target.name IN (${Object.keys(CORE_DEFINITIONS).map(literal).join(', ')})
              AND NOT EXISTS (
                  SELECT 1 FROM ${CORE_SEQUENCE_STAGE} AS stage
                  WHERE stage.name=target.name AND stage.seq IS NOT NULL
                    AND stage.seq IS target.seq
              )
        )`
    );
    return conditions.map((condition) => `(${condition})`).join(' OR ');
}

async function coreSequenceState(database) {
    const names = Object.keys(CORE_DEFINITIONS);
    const exists = await all(
        database,
        "SELECT 1 AS present FROM sqlite_master WHERE type='table' AND name='sqlite_sequence'"
    );
    if (!exists.length) {
        return { rows: names.map((name) => ({ name, seq: null })), rejects: [] };
    }
    const loaded = await typedRows(
        database,
        'sqlite_sequence',
        CORE_SEQUENCE_DEFINITION,
        'name',
        `name IN (${names.map(literal).join(', ')})`
    );
    const rejects = [...loaded.rejects];
    const byName = new Map();
    for (const row of loaded.rows) {
        if (byName.has(row.name)) {
            rejects.push({
                table: 'sqlite_sequence', sourceId: row.name,
                code: 'unique-key', fields: ['name'], value: [row.name]
            });
            continue;
        }
        byName.set(row.name, row);
        if (row.seq === null || row.seq === undefined) {
            rejects.push({
                table: 'sqlite_sequence', sourceId: row.name,
                code: 'critical-null', field: 'seq'
            });
        } else if (Number.isSafeInteger(row.seq) && row.seq < 0) {
            rejects.push({
                table: 'sqlite_sequence', sourceId: row.name,
                code: 'check-constraint', field: 'seq', value: row.seq
            });
        }
    }
    return {
        rows: names.map((name) => ({ name, seq: byName.get(name)?.seq ?? null })),
        rejects
    };
}

function validateCoreRows(rowsByTable) {
    const rejects = [];
    for (const [table, definition] of Object.entries(CORE_DEFINITIONS)) {
        for (const row of rowsByTable[table]) {
            for (const field of definition.critical) {
                if (row[field] === null || row[field] === undefined) {
                    rejects.push({ table, sourceId: row.id, code: 'critical-null', field });
                }
            }
        }
    }
    const usernames = new Map();
    for (const row of rowsByTable.users) {
        if (row.username === null || row.username === undefined) continue;
        const firstId = usernames.get(row.username);
        if (firstId !== undefined) {
            rejects.push({
                table: 'users', sourceId: row.id, code: 'unique-key',
                fields: ['username'], value: [row.username], conflictsWith: firstId
            });
        } else {
            usernames.set(row.username, row.id);
        }
    }
    const cardIds = new Set(rowsByTable.cards.map((row) => row.id));
    const emojiKeys = new Map();
    for (const row of rowsByTable.card_emojis) {
        if (row.card_id !== null && row.card_id !== undefined && !cardIds.has(row.card_id)) {
            rejects.push({
                table: 'card_emojis', sourceId: row.id, code: 'foreign-key',
                field: 'card_id', value: row.card_id, references: 'cards.id'
            });
        }
        const key = JSON.stringify([row.card_id, stable(row.emoji)]);
        const firstId = emojiKeys.get(key);
        if (firstId !== undefined) {
            rejects.push({
                table: 'card_emojis', sourceId: row.id, code: 'unique-key',
                fields: ['card_id', 'emoji'], value: [row.card_id, row.emoji], conflictsWith: firstId
            });
        } else {
            emojiKeys.set(key, row.id);
        }
    }
    for (const row of rowsByTable.cards) {
        if (row.status !== null && !['pending', 'approved', 'deleted'].includes(row.status)) {
            rejects.push({
                table: 'cards', sourceId: row.id, code: 'check-constraint',
                field: 'status', value: row.status
            });
        }
    }
    return rejects;
}

async function coreSql(database, runId = 'direct-core-snapshot', options = {}) {
    validateRunId(runId);
    const summary = {};
    const rowsByTable = {};
    const storageRejects = [];
    for (const [table, definition] of Object.entries(CORE_DEFINITIONS)) {
        const loaded = await typedRows(database, table, definition, 'id');
        const { rows } = loaded;
        rowsByTable[table] = rows;
        storageRejects.push(...loaded.rejects);
        summary[table] = {
            count: rows.length,
            normalizedHash: loaded.rejects.length ? null : hash(rows)
        };
    }
    const sequenceState = await coreSequenceState(database);
    storageRejects.push(...sequenceState.rejects);
    const sqliteSequence = Object.fromEntries(
        sequenceState.rows.map(({ name, seq }) => [name, seq])
    );
    summary.sqliteSequence = sqliteSequence;
    for (const table of Object.keys(CORE_DEFINITIONS)) {
        addUniqueRejects(rowsByTable[table], table, ['id'], storageRejects);
    }
    const rowCount = Object.values(rowsByTable).reduce((count, rows) => count + rows.length, 0);
    if (rowCount === 0) {
        const sourceSha256 = options.sourceSha256?.toLowerCase();
        const confirmation = options.confirmEmptyCoreSourceSha256?.toLowerCase();
        if (!SHA256_PATTERN.test(sourceSha256 || '') || confirmation !== sourceSha256) {
            throw new Error(
                'Empty Core snapshot requires --confirm-empty-core-source-sha256 matching the source SHA-256'
            );
        }
    }
    if (storageRejects.length) {
        return {
            statements: [], summary, rejects: storageRejects,
            legacy: { ...rowsByTable, sqliteSequence }
        };
    }
    const rejects = validateCoreRows(rowsByTable);
    const snapshotHash = hash({ tables: rowsByTable, sqliteSequence: sequenceState.rows });
    summary.snapshotHash = snapshotHash;
    const legacy = { ...rowsByTable, sqliteSequence };
    if (rejects.length) return { statements: [], summary, rejects, legacy };

    const run = literal(runId);
    const snapshot = literal(snapshotHash);
    const statements = [
        'PRAGMA defer_foreign_keys = TRUE;',
        ...coreControlStatements(),
        `DELETE FROM ${CORE_ASSERTION_TABLE};`,
        `INSERT INTO ${CORE_ASSERTION_TABLE} (ok)
         SELECT 0 WHERE EXISTS (
            SELECT 1 FROM ${CORE_RUN_TABLE}
            WHERE run_id=${run} AND snapshot_hash<>${snapshot}
         );`,
        `INSERT INTO ${CORE_GUARD_TABLE} (lock_id, run_id, snapshot_hash, phase)
         VALUES (1, ${run}, ${snapshot}, 'staging');`,
        `INSERT INTO ${CORE_RUN_TABLE} (run_id, snapshot_hash, status, started_at, completed_at)
         VALUES (${run}, ${snapshot}, 'active', CURRENT_TIMESTAMP, NULL)
         ON CONFLICT(run_id) DO UPDATE SET status='active',
             started_at=CURRENT_TIMESTAMP, completed_at=NULL
         WHERE ${CORE_RUN_TABLE}.snapshot_hash=excluded.snapshot_hash;`,
        ...coreStageStatements()
    ];
    for (const table of Object.keys(CORE_DEFINITIONS)) {
        const definition = CORE_DEFINITIONS[table];
        const stage = coreStageTable(table);
        statements.push(`DELETE FROM ${stage};`);
        statements.push(...rowsByTable[table].map((row) =>
            `INSERT INTO ${stage} (${definition.columns.join(', ')}) VALUES (${definition.columns.map((column) => literal(row[column])).join(', ')});`
        ));
    }
    statements.push(`DELETE FROM ${CORE_SEQUENCE_STAGE};`);
    statements.push(...sequenceState.rows.map(({ name, seq }) =>
        `INSERT INTO ${CORE_SEQUENCE_STAGE} (name, seq) VALUES (${literal(name)}, ${literal(seq)});`
    ));
    statements.push(
        `UPDATE ${CORE_GUARD_TABLE} SET phase='applying'
         WHERE lock_id=1 AND run_id=${run} AND snapshot_hash=${snapshot};`
    );
    for (const table of ['card_emojis', 'cards', 'events', 'logs', 'news', 'users']) {
        statements.push(`DELETE FROM ${table};`);
    }
    for (const table of ['users', 'news', 'logs', 'cards', 'events', 'card_emojis']) {
        const columns = CORE_DEFINITIONS[table].columns.join(', ');
        statements.push(
            `INSERT INTO ${table} (${columns})
             SELECT ${columns} FROM ${coreStageTable(table)} ORDER BY id;`
        );
    }
    const coreTables = Object.keys(CORE_DEFINITIONS).map(literal).join(', ');
    statements.push(
        `DELETE FROM sqlite_sequence WHERE name IN (${coreTables});`,
        `INSERT INTO sqlite_sequence (name, seq)
         SELECT name, seq FROM ${CORE_SEQUENCE_STAGE} WHERE seq IS NOT NULL;`
    );
    const mismatch = coreMismatchCondition();
    statements.push(
        `DELETE FROM ${CORE_ASSERTION_TABLE};`,
        `INSERT INTO ${CORE_ASSERTION_TABLE} (ok)
         SELECT 0 WHERE ${mismatch};`
    );
    for (const table of Object.keys(CORE_DEFINITIONS)) {
        statements.push(`DROP TABLE ${coreStageTable(table)};`);
    }
    statements.push(`DROP TABLE ${CORE_SEQUENCE_STAGE};`);
    statements.push(
        `DROP TABLE ${CORE_ASSERTION_TABLE};`,
        `UPDATE ${CORE_RUN_TABLE} SET status='completed', completed_at=CURRENT_TIMESTAMP
         WHERE run_id=${run} AND snapshot_hash=${snapshot};`,
        `DELETE FROM ${CORE_GUARD_TABLE}
         WHERE lock_id=1 AND run_id=${run} AND snapshot_hash=${snapshot}
           AND EXISTS (
               SELECT 1 FROM ${CORE_RUN_TABLE}
               WHERE run_id=${run} AND snapshot_hash=${snapshot} AND status='completed'
           );`
    );
    return { statements, summary, rejects, legacy };
}

function storyStageTable(table) {
    return `_ims_story_snapshot_stage_${table}`;
}

function storyControlStatements() {
    return [
        `CREATE TABLE IF NOT EXISTS ${STORY_GUARD_TABLE} (
            lock_id INTEGER PRIMARY KEY CHECK(lock_id=1),
            run_id TEXT NOT NULL,
            snapshot_hash TEXT NOT NULL,
            phase TEXT NOT NULL CHECK(phase IN ('staging', 'applying')),
            started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );`,
        `CREATE TABLE IF NOT EXISTS ${STORY_RUN_TABLE} (
            run_id TEXT PRIMARY KEY,
            snapshot_hash TEXT NOT NULL,
            status TEXT NOT NULL CHECK(status IN ('active', 'completed')),
            started_at TEXT NOT NULL,
            completed_at TEXT
        );`
    ];
}

function storyStageStatements() {
    return Object.entries(STORY_TARGET_DEFINITIONS).map(([table, definition]) => {
        const columns = definition.columns.map((column, index) =>
            `${column} ${definition.types[index]}`
        );
        columns.push(`PRIMARY KEY (${definition.primary.join(', ')})`);
        return `CREATE TABLE IF NOT EXISTS ${storyStageTable(table)} (${columns.join(', ')});`;
    });
}

function storyMismatchCondition() {
    const conditions = [];
    for (const table of ['agencies', 'idols', 'theme_colors']) {
        const definition = STORY_TARGET_DEFINITIONS[table];
        const stage = storyStageTable(table);
        const stageMatchesTarget = definition.columns
            .map((column) => `target.${column} IS stage.${column}`).join(' AND ');
        conditions.push(
            `EXISTS (
                SELECT 1 FROM ${stage} AS stage
                WHERE NOT EXISTS (SELECT 1 FROM ${table} AS target WHERE ${stageMatchesTarget})
            )`
        );
    }
    const migratedTables = STORY_TABLES.map(literal).join(', ');
    for (const [table, ownerColumn] of [
        ['story_legacy_rows', 'legacy_table'],
        ['story_cards', 'source_table']
    ]) {
        const definition = STORY_TARGET_DEFINITIONS[table];
        const stage = storyStageTable(table);
        const targetMatchesStage = definition.columns
            .map((column) => `stage.${column} IS target.${column}`).join(' AND ');
        const stageMatchesTarget = definition.columns
            .map((column) => `target.${column} IS stage.${column}`).join(' AND ');
        const owned = `target.${ownerColumn} IN (${migratedTables}) AND (` +
            `target.last_seen_run_id LIKE 'migration:%' OR ` +
            `target.last_seen_run_id IN ('legacy-untracked', ''))`;
        conditions.push(
            `EXISTS (
                SELECT 1 FROM ${table} AS target
                WHERE ${owned}
                  AND NOT EXISTS (SELECT 1 FROM ${stage} AS stage WHERE ${targetMatchesStage})
            )`,
            `EXISTS (
                SELECT 1 FROM ${stage} AS stage
                WHERE NOT EXISTS (SELECT 1 FROM ${table} AS target WHERE ${stageMatchesTarget})
            )`
        );
    }
    const linkStage = storyStageTable('story_links');
    const ownedLink = `target.source_table IN (${migratedTables}) AND (` +
        `target.last_seen_run_id LIKE 'migration:%' OR ` +
        `target.last_seen_run_id IN ('legacy-untracked', ''))`;
    const linkMatches = [
        'stage.card_source_table IS parent.source_table',
        'stage.card_source_id IS parent.source_id',
        'stage.up_name IS target.up_name',
        'stage.video_title IS target.video_title',
        'stage.url IS target.url',
        'stage.source_table IS target.source_table',
        'stage.source_id IS target.source_id',
        'stage.source_link_index IS target.source_link_index',
        'stage.last_seen_run_id IS target.last_seen_run_id'
    ].join(' AND ');
    conditions.push(
        `EXISTS (
            SELECT 1 FROM story_links AS target
            LEFT JOIN story_cards AS parent ON parent.id=target.card_id
            WHERE ${ownedLink}
              AND NOT EXISTS (SELECT 1 FROM ${linkStage} AS stage WHERE ${linkMatches})
        )`,
        `EXISTS (
            SELECT 1 FROM ${linkStage} AS stage
            WHERE NOT EXISTS (
                SELECT 1 FROM story_links AS target
                JOIN story_cards AS parent ON parent.id=target.card_id
                WHERE ${linkMatches}
            )
        )`
    );
    return conditions.map((condition) => `(${condition})`).join(' OR ');
}

function addUniqueRejects(rows, table, fields, rejects) {
    const values = new Map();
    for (const row of rows) {
        if (fields.some((field) => row[field] === null || row[field] === undefined)) continue;
        const key = JSON.stringify(fields.map((field) => row[field]));
        const first = values.get(key);
        if (first !== undefined) {
            rejects.push({
                table, sourceId: row.id ?? row.name, code: 'unique-key', fields,
                value: fields.map((field) => row[field]), conflictsWith: first
            });
        } else {
            values.set(key, row.id ?? row.name);
        }
    }
}

async function storySql(database, runId, options = {}) {
    validateRunId(runId);
    const agencyLoaded = await typedRows(database, 'agencies', STORY_BASE_DEFINITIONS.agencies, 'id');
    const idolLoaded = await typedRows(database, 'idols', STORY_BASE_DEFINITIONS.idols, 'id');
    const themeLoaded = await typedRows(database, 'theme_colors', STORY_BASE_DEFINITIONS.theme_colors, 'name');
    const storyRowsByTable = {};
    const storageRejects = [
        ...agencyLoaded.rejects,
        ...idolLoaded.rejects,
        ...themeLoaded.rejects
    ];
    addUniqueRejects(agencyLoaded.rows, 'agencies', ['id'], storageRejects);
    addUniqueRejects(idolLoaded.rows, 'idols', ['id'], storageRejects);
    addUniqueRejects(themeLoaded.rows, 'theme_colors', ['name'], storageRejects);
    for (const table of STORY_TABLES) {
        const loaded = await typedRows(database, table, STORY_ROW_DEFINITION, 'id');
        storyRowsByTable[table] = loaded.rows;
        storageRejects.push(...loaded.rejects);
        addUniqueRejects(loaded.rows, table, ['id'], storageRejects);
    }
    const agencyRows = agencyLoaded.rows;
    const idolRows = idolLoaded.rows;
    const themeRows = themeLoaded.rows;
    const storyRowCount = STORY_TABLES.reduce(
        (count, table) => count + storyRowsByTable[table].length,
        0
    );
    const legacy = {
        agencies: agencyRows,
        idols: idolRows,
        theme_colors: themeRows,
        ...storyRowsByTable
    };
    if (storageRejects.length) {
        return {
            statements: [],
            summary: { rows: storyRowCount },
            rejects: storageRejects,
            legacy
        };
    }

    const rejects = [];
    const agencyIds = new Set(agencyRows.map((row) => row.id));
    for (const row of agencyRows) {
        for (const field of ['id', 'code', 'name_cn', 'color']) {
            if (row[field] === null || row[field] === undefined || row[field] === '') {
                rejects.push({ table: 'agencies', sourceId: row.id, code: 'critical-null', field });
            }
        }
    }
    addUniqueRejects(agencyRows, 'agencies', ['code'], rejects);

    const idolIds = new Set(idolRows.map((row) => row.id));
    for (const row of idolRows) {
        for (const field of ['id', 'agency_id', 'name_cn', 'folder_name']) {
            if (row[field] === null || row[field] === undefined || row[field] === '') {
                rejects.push({ table: 'idols', sourceId: row.id, code: 'critical-null', field });
            }
        }
        if (!agencyIds.has(row.agency_id)) {
            rejects.push({
                table: 'idols', sourceId: row.id, code: 'foreign-key',
                field: 'agency_id', value: row.agency_id, references: 'agencies.id'
            });
        }
    }
    addUniqueRejects(idolRows, 'idols', ['agency_id', 'name_cn'], rejects);

    for (const row of themeRows) {
        for (const field of ['name', 'color']) {
            if (row[field] === null || row[field] === undefined || row[field] === '') {
                rejects.push({ table: 'theme_colors', sourceId: row.name, code: 'critical-null', field });
            }
        }
    }

    const importMarker = `migration:${runId}`;
    const legacyRows = [];
    const cardGroups = new Map();
    for (const table of STORY_TABLES) {
        for (const row of storyRowsByTable[table]) {
            for (const field of ['id', 'idol_id', 'category', 'card_name']) {
                if (row[field] === null || row[field] === undefined || row[field] === '') {
                    rejects.push({ table, sourceId: row.id, code: 'critical-null', field });
                }
            }
            if (!idolIds.has(row.idol_id)) {
                rejects.push({
                    table, sourceId: row.id, code: 'foreign-key',
                    field: 'idol_id', value: row.idol_id, references: 'idols.id'
                });
            }
            legacyRows.push({
                legacy_table: table,
                legacy_id: row.id,
                row_json: JSON.stringify(stable(row)),
                normalized_hash: hash(row),
                last_seen_run_id: importMarker
            });
            const groupKey = JSON.stringify([table, row.idol_id, row.category, row.card_name]);
            const group = cardGroups.get(groupKey) ?? { table, rows: [] };
            group.rows.push(row);
            cardGroups.set(groupKey, group);
        }
    }

    const cardRows = [];
    const linkRows = [];
    for (const { table, rows } of cardGroups.values()) {
        const sourceCard = rows[0];
        for (const row of rows.slice(1)) {
            if (row.subtitle !== sourceCard.subtitle || row.image_file !== sourceCard.image_file) {
                rejects.push({
                    table, sourceId: row.id, code: 'conflicting-card-metadata',
                    cardSourceId: sourceCard.id, fields: ['subtitle', 'image_file']
                });
            }
        }
        const card = {
            idol_id: sourceCard.idol_id,
            category: sourceCard.category,
            card_name: sourceCard.card_name,
            subtitle: sourceCard.subtitle,
            image_file: sourceCard.image_file,
            source_table: table,
            source_id: sourceCard.id,
            last_seen_run_id: importMarker
        };
        cardRows.push(card);
        for (const row of rows) {
            linkRows.push({
                card_source_table: card.source_table,
                card_source_id: card.source_id,
                up_name: row.up_name ?? '',
                video_title: row.video_title ?? '',
                url: row.url ?? '',
                source_table: table,
                source_id: row.id,
                source_link_index: 0,
                last_seen_run_id: importMarker
            });
        }
    }

    const snapshotRows = {
        agencies: agencyRows,
        idols: idolRows,
        theme_colors: themeRows,
        story_legacy_rows: legacyRows,
        story_cards: cardRows,
        story_links: linkRows
    };
    const snapshotHash = hash({
        agencies: agencyRows,
        idols: idolRows,
        theme_colors: themeRows,
        stories: storyRowsByTable
    });
    const summary = {
        rows: storyRowCount,
        cards: cardRows.length,
        links: linkRows.length,
        sourceHash: snapshotHash
    };
    if (rejects.length) return { statements: [], summary, rejects, legacy };

    if (storyRowCount === 0) {
        const sourceSha256 = options.sourceSha256?.toLowerCase();
        const confirmation = options.confirmEmptyStorySourceSha256?.toLowerCase();
        if (!SHA256_PATTERN.test(sourceSha256 || '') || confirmation !== sourceSha256) {
            throw new Error(
                'Empty Story snapshot requires --confirm-empty-story-source-sha256 matching the source SHA-256'
            );
        }
    }

    const run = literal(runId);
    const snapshot = literal(snapshotHash);
    const statements = [
        'PRAGMA defer_foreign_keys = TRUE;',
        ...storyControlStatements(),
        `INSERT INTO ${STORY_GUARD_TABLE} (lock_id, run_id, snapshot_hash, phase)
         SELECT CASE WHEN EXISTS (
             SELECT 1 FROM ${STORY_RUN_TABLE}
             WHERE run_id=${run} AND snapshot_hash<>${snapshot}
         ) OR EXISTS (
             SELECT 1 FROM story_import_runs
             WHERE run_id=${run} AND source_sha256<>${snapshot}
         ) THEN 0 ELSE 1 END, ${run}, ${snapshot}, 'staging';`,
        `INSERT INTO ${STORY_RUN_TABLE} (run_id, snapshot_hash, status, started_at, completed_at)
         VALUES (${run}, ${snapshot}, 'active', CURRENT_TIMESTAMP, NULL)
         ON CONFLICT(run_id) DO UPDATE SET status='active',
             started_at=CURRENT_TIMESTAMP, completed_at=NULL
         WHERE ${STORY_RUN_TABLE}.snapshot_hash=excluded.snapshot_hash;`,
        `CREATE TABLE IF NOT EXISTS ${STORY_ASSERTION_TABLE} (
            ok INTEGER NOT NULL CHECK(ok=1)
        );`,
        `DELETE FROM ${STORY_ASSERTION_TABLE};`,
        ...storyStageStatements()
    ];
    for (const [table, definition] of Object.entries(STORY_TARGET_DEFINITIONS)) {
        const stage = storyStageTable(table);
        statements.push(`DELETE FROM ${stage};`);
        statements.push(...snapshotRows[table].map((row) =>
            `INSERT INTO ${stage} (${definition.columns.join(', ')}) VALUES (` +
            `${definition.columns.map((column) => literal(row[column])).join(', ')});`
        ));
    }
    statements.push(
        `UPDATE ${STORY_GUARD_TABLE} SET phase='applying'
         WHERE lock_id=1 AND run_id=${run} AND snapshot_hash=${snapshot};`
    );
    for (const table of ['agencies', 'idols', 'theme_colors', 'story_legacy_rows', 'story_cards']) {
        const definition = STORY_TARGET_DEFINITIONS[table];
        const columns = STORY_TARGET_DEFINITIONS[table].columns.join(', ');
        const updates = definition.columns.filter((column) => !definition.primary.includes(column))
            .map((column) => `${column}=excluded.${column}`).join(', ');
        statements.push(
            `INSERT INTO ${table} (${columns})
             SELECT ${columns} FROM ${storyStageTable(table)} WHERE TRUE
             ON CONFLICT(${definition.primary.join(', ')}) DO UPDATE SET ${updates};`
        );
    }
    statements.push(
        `INSERT INTO story_links
            (card_id, up_name, video_title, url, source_table, source_id,
             source_link_index, last_seen_run_id)
         SELECT parent.id, stage.up_name, stage.video_title, stage.url,
                stage.source_table, stage.source_id, stage.source_link_index,
                stage.last_seen_run_id
         FROM ${storyStageTable('story_links')} AS stage
         JOIN story_cards AS parent
           ON parent.source_table=stage.card_source_table
          AND parent.source_id=stage.card_source_id
         WHERE TRUE
         ON CONFLICT(source_table, source_id, source_link_index) DO UPDATE SET
             card_id=excluded.card_id,
             up_name=excluded.up_name,
             video_title=excluded.video_title,
             url=excluded.url,
             last_seen_run_id=excluded.last_seen_run_id;`
    );
    const migratedTables = STORY_TABLES.map(literal).join(', ');
    const migrationOwned = `(last_seen_run_id LIKE 'migration:%' OR ` +
        `last_seen_run_id IN ('legacy-untracked', ''))`;
    statements.push(
        `DELETE FROM story_links
         WHERE source_table IN (${migratedTables}) AND ${migrationOwned}
           AND NOT EXISTS (
               SELECT 1 FROM ${storyStageTable('story_links')} AS stage
               WHERE stage.source_table=story_links.source_table
                 AND stage.source_id=story_links.source_id
                 AND stage.source_link_index=story_links.source_link_index
           );`,
        `DELETE FROM story_cards
         WHERE source_table IN (${migratedTables}) AND ${migrationOwned}
           AND NOT EXISTS (
               SELECT 1 FROM ${storyStageTable('story_cards')} AS stage
               WHERE stage.source_table=story_cards.source_table
                 AND stage.source_id=story_cards.source_id
           );`,
        `DELETE FROM story_legacy_rows
         WHERE legacy_table IN (${migratedTables}) AND ${migrationOwned}
           AND NOT EXISTS (
               SELECT 1 FROM ${storyStageTable('story_legacy_rows')} AS stage
               WHERE stage.legacy_table=story_legacy_rows.legacy_table
                 AND stage.legacy_id=story_legacy_rows.legacy_id
           );`
    );
    const mismatch = storyMismatchCondition();
    statements.push(
        `DELETE FROM ${STORY_ASSERTION_TABLE};`,
        `INSERT INTO ${STORY_ASSERTION_TABLE} (ok)
         SELECT 0 WHERE ${mismatch};`
    );
    for (const table of Object.keys(STORY_TARGET_DEFINITIONS)) {
        statements.push(`DROP TABLE ${storyStageTable(table)};`);
    }
    statements.push(
        `DROP TABLE ${STORY_ASSERTION_TABLE};`,
        `INSERT INTO story_import_runs
            (run_id, source_sha256, landing_rows, card_rows, link_rows, completed_at)
         VALUES (${run}, ${snapshot}, ${storyRowCount}, ${cardRows.length}, ${linkRows.length}, CURRENT_TIMESTAMP)
         ON CONFLICT(run_id) DO UPDATE SET
             landing_rows=excluded.landing_rows,
             card_rows=excluded.card_rows,
             link_rows=excluded.link_rows,
             completed_at=excluded.completed_at
         WHERE story_import_runs.source_sha256=excluded.source_sha256;`,
        `UPDATE ${STORY_RUN_TABLE} SET status='completed', completed_at=CURRENT_TIMESTAMP
         WHERE run_id=${run} AND snapshot_hash=${snapshot}
           AND EXISTS (
               SELECT 1 FROM story_import_runs
               WHERE run_id=${run} AND source_sha256=${snapshot}
           );`,
        `DELETE FROM ${STORY_GUARD_TABLE}
         WHERE lock_id=1 AND run_id=${run} AND snapshot_hash=${snapshot}
           AND EXISTS (
               SELECT 1 FROM ${STORY_RUN_TABLE}
               WHERE run_id=${run} AND snapshot_hash=${snapshot} AND status='completed'
           ) AND EXISTS (
               SELECT 1 FROM story_import_runs
               WHERE run_id=${run} AND source_sha256=${snapshot}
           );`
    );
    return { statements, summary, rejects, legacy };
}

function parseArguments(argv) {
    const [kind, databasePath, outputPath, runId, snapshotFlag, ...rest] = argv;
    if (!['core', 'story'].includes(kind) || !databasePath || !outputPath || !runId || snapshotFlag !== '--snapshot') {
        throw new Error(
            'Usage: sqlite-to-d1.js <core|story> <online-backup.db> <output.sql> <run-id> --snapshot ' +
            '[--rejects rejects.json] [--legacy-json legacy.json] ' +
            '[--confirm-empty-core-source-sha256 sha256] ' +
            '[--confirm-empty-story-source-sha256 sha256]'
        );
    }
    validateRunId(runId);
    let rejectsPath = `${outputPath}.rejects.json`;
    let legacyPath;
    let confirmEmptyCoreSourceSha256;
    let confirmEmptyStorySourceSha256;
    const seen = new Set();
    for (let index = 0; index < rest.length; index += 1) {
        const option = rest[index];
        const value = rest[index + 1];
        if (![
            '--rejects', '--legacy-json',
            '--confirm-empty-core-source-sha256', '--confirm-empty-story-source-sha256'
        ].includes(option)) {
            throw new Error(`Unknown export option: ${option}`);
        }
        if (!value || value.startsWith('--')) throw new Error(`${option} requires a value`);
        if (seen.has(option)) throw new Error(`Duplicate export option: ${option}`);
        seen.add(option);
        if (option === '--rejects') rejectsPath = value;
        if (option === '--legacy-json') legacyPath = value;
        if (option === '--confirm-empty-core-source-sha256') {
            if (kind !== 'core') throw new Error('--confirm-empty-core-source-sha256 is only valid for Core');
            if (!SHA256_PATTERN.test(value)) throw new Error('Empty Core source confirmation must be a SHA-256');
            confirmEmptyCoreSourceSha256 = value.toLowerCase();
        }
        if (option === '--confirm-empty-story-source-sha256') {
            if (kind !== 'story') throw new Error('--confirm-empty-story-source-sha256 is only valid for Story');
            if (!SHA256_PATTERN.test(value)) throw new Error('Empty Story source confirmation must be a SHA-256');
            confirmEmptyStorySourceSha256 = value.toLowerCase();
        }
        index += 1;
    }
    const artifacts = [outputPath, rejectsPath, legacyPath].filter(Boolean).map((file) => path.resolve(file));
    if (new Set(artifacts).size !== artifacts.length) {
        throw new Error('SQL, reject manifest, and legacy JSON paths must differ');
    }
    return {
        kind, databasePath, outputPath, runId, rejectsPath, legacyPath,
        confirmEmptyCoreSourceSha256, confirmEmptyStorySourceSha256
    };
}

function writeRejectManifest(file, metadata) {
    fs.writeFileSync(file, `${JSON.stringify({
        version: 1,
        kind: metadata.kind,
        runId: metadata.runId,
        source: metadata.source,
        sourceSha256: metadata.sourceSha256,
        generatedAt: new Date().toISOString(),
        rejects: metadata.rejects
    }, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
}

function writeJsonArtifact(file, value) {
    fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
}

async function main(argv) {
    const {
        kind, databasePath, outputPath, runId, rejectsPath, legacyPath,
        confirmEmptyCoreSourceSha256, confirmEmptyStorySourceSha256
    } = parseArguments(argv);
    const source = path.resolve(databasePath);
    const before = sourceProof(source);
    const database = new sqlite3.Database(
        immutableSqliteUri(source),
        sqlite3.OPEN_READONLY | sqlite3.OPEN_URI
    );
    let generated;
    let transactionOpen = false;
    try {
        await exec(database, 'PRAGMA query_only=ON; BEGIN DEFERRED;');
        transactionOpen = true;
        generated = kind === 'core'
            ? await coreSql(database, runId, {
                sourceSha256: before.sha256,
                confirmEmptyCoreSourceSha256
            })
            : await storySql(database, runId, {
                sourceSha256: before.sha256,
                confirmEmptyStorySourceSha256
            });
        await exec(database, 'COMMIT;');
        transactionOpen = false;
    } catch (error) {
        if (transactionOpen) await exec(database, 'ROLLBACK;').catch(() => undefined);
        throw error;
    } finally {
        await close(database);
    }

    const after = sourceProof(source);
    assertSameSourceProof(before, after);
    for (const file of [outputPath, rejectsPath, legacyPath].filter(Boolean)) {
        if (fs.existsSync(file)) throw new Error(`Output already exists: ${file}`);
    }
    const sourceSha256 = before.sha256;
    if (generated.rejects.length) {
        writeRejectManifest(rejectsPath, {
            kind, runId, source, sourceSha256, rejects: generated.rejects
        });
        process.stdout.write(`${JSON.stringify({
            kind, runId, rejects: generated.rejects.length,
            rejectManifest: path.resolve(rejectsPath)
        })}\n`);
        process.exitCode = 2;
        return;
    }
    const header = [
        '-- Generated from an explicitly declared SQLite online backup.',
        `-- kind=${kind} run_id=${runId} source_sha256=${sourceSha256}`,
        `-- reconciliation=${JSON.stringify(generated.summary)}`
    ];
    fs.writeFileSync(outputPath, `${[...header, ...generated.statements].join('\n')}\n`, {
        flag: 'wx',
        mode: 0o600
    });
    writeRejectManifest(rejectsPath, {
        kind, runId, source, sourceSha256, rejects: []
    });
    if (legacyPath) writeJsonArtifact(legacyPath, generated.legacy);
    process.stdout.write(`${JSON.stringify({
        kind, runId, output: path.resolve(outputPath),
        rejectManifest: path.resolve(rejectsPath),
        legacyJson: legacyPath ? path.resolve(legacyPath) : undefined,
        summary: generated.summary
    })}\n`);
}

if (require.main === module) {
    main(process.argv.slice(2)).catch(error => {
        console.error(error);
        process.exitCode = 1;
    });
}

module.exports = {
    assertSameSourceProof,
    coreSql,
    hash,
    literal,
    parseArguments,
    sourceProof,
    stable,
    storySql,
    validateRunId,
    writeRejectManifest
};
