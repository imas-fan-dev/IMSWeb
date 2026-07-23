'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');
const sqlite3 = require('sqlite3').verbose();
const { reconcile, rowHash } = require('../../scripts/migration/d1-reconcile');
const {
    assertSameSourceProof, coreSql, parseArguments, sourceProof, storySql
} = require('../../scripts/migration/sqlite-to-d1');

const PROJECT_ROOT = path.resolve(__dirname, '../..');
const FIXTURES = path.join(PROJECT_ROOT, 'migrations/fixtures');
const RECONCILE_SCRIPT = path.join(PROJECT_ROOT, 'scripts/migration/d1-reconcile.js');
const EXPORT_SCRIPT = path.join(PROJECT_ROOT, 'scripts/migration/sqlite-to-d1.js');
const STORY_TABLES = [
    '765_stories', '876_stories', 'cg_stories', 'ml_stories',
    'sidem_stories', 'sc_stories', 'gk_stories'
];

function fixture(name) {
    return JSON.parse(fs.readFileSync(path.join(FIXTURES, name), 'utf8'));
}

function exec(database, sql) {
    return new Promise((resolve, reject) => database.exec(sql, (error) => error ? reject(error) : resolve()));
}

function get(database, sql) {
    return new Promise((resolve, reject) => database.get(sql, (error, row) => error ? reject(error) : resolve(row)));
}

function all(database, sql) {
    return new Promise((resolve, reject) => database.all(sql, (error, rows) => error ? reject(error) : resolve(rows)));
}

function close(database) {
    return new Promise((resolve, reject) => database.close((error) => error ? reject(error) : resolve()));
}

function sha256(file) {
    return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function runExport(kind, source, output, runId, ...extra) {
    return spawnSync(process.execPath, [
        EXPORT_SCRIPT, kind, source, output, runId, '--snapshot', ...extra
    ], { encoding: 'utf8' });
}

function migrations(kind) {
    const directory = path.join(PROJECT_ROOT, 'migrations', kind);
    return fs.readdirSync(directory).filter((file) => file.endsWith('.sql')).sort()
        .map((file) => fs.readFileSync(path.join(directory, file), 'utf8')).join('\n');
}

async function sqliteSequenceSnapshot(database) {
    const names = ['users', 'news', 'logs', 'cards', 'events', 'card_emojis'];
    const rows = await all(database, `
        SELECT name, seq FROM sqlite_sequence
        WHERE name IN (${names.map((name) => `'${name}'`).join(', ')})
    `);
    const byName = new Map(rows.map((row) => [row.name, row.seq]));
    return Object.fromEntries(names.map((name) => [name, byName.get(name) ?? null]));
}

function storySourceSchema() {
    return `
        CREATE TABLE agencies(id INTEGER PRIMARY KEY, code TEXT, name_cn TEXT, color TEXT);
        CREATE TABLE idols(id INTEGER PRIMARY KEY, agency_id INTEGER, name_cn TEXT, folder_name TEXT, color TEXT);
        CREATE TABLE theme_colors(name TEXT PRIMARY KEY, color TEXT);
        ${STORY_TABLES.map((table) => `CREATE TABLE "${table}"(
            id INTEGER PRIMARY KEY, idol_id INTEGER, category TEXT, card_name TEXT,
            up_name TEXT, video_title TEXT, url TEXT, subtitle TEXT, image_file TEXT
        );`).join('\n')}
    `;
}

function emptyStoryArtifacts() {
    const legacy = {
        agencies: [{ id: 1, code: 'cg', name_cn: 'Agency', color: '#2681c8' }],
        idols: [{ id: 10, agency_id: 1, name_cn: 'Idol', folder_name: 'idol', color: '#ffffff' }],
        theme_colors: [{ name: 'Card', color: '#123456' }],
        ...Object.fromEntries(STORY_TABLES.map((table) => [table, []]))
    };
    const target = {
        agencies: structuredClone(legacy.agencies),
        idols: structuredClone(legacy.idols),
        theme_colors: structuredClone(legacy.theme_colors),
        story_legacy_rows: [],
        story_cards: [],
        story_links: []
    };
    return { legacy, target };
}

function coreSourceSchema() {
    return `
        CREATE TABLE users(id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT, password TEXT, dept TEXT, producername TEXT);
        CREATE TABLE news(id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, image TEXT, thumbnail TEXT, content TEXT, date TEXT, author TEXT);
        CREATE TABLE logs(id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT, producername TEXT, action TEXT, target TEXT, ip TEXT, time TEXT);
        CREATE TABLE cards(id INTEGER PRIMARY KEY AUTOINCREMENT, image1_url TEXT, image2_url TEXT, hash1 TEXT, hash2 TEXT, ip TEXT, status TEXT, created_at TEXT);
        CREATE TABLE events(id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, name TEXT, contact TEXT, image_url TEXT, created_at TEXT);
        CREATE TABLE card_emojis(id INTEGER PRIMARY KEY AUTOINCREMENT, card_id INTEGER, emoji TEXT, count INTEGER);
    `;
}

test('[MIG-01] fixture reconciliation is zero-difference and CLI-successful', () => {
    const legacy = fixture('reconciliation-legacy.json');
    const target = fixture('reconciliation-d1.json');
    const critical = fixture('critical-fields.json');
    assert.deepEqual(reconcile(legacy, target, critical).differences, []);

    const result = spawnSync(process.execPath, [
        RECONCILE_SCRIPT,
        path.join(FIXTURES, 'reconciliation-legacy.json'),
        path.join(FIXTURES, 'reconciliation-d1.json'),
        path.join(FIXTURES, 'critical-fields.json')
    ], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout).differences, []);
});

test('[MIG-01] one changed D1 row makes reconciliation fail', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ims-d1-reconcile-'));
    try {
        const changed = fixture('reconciliation-d1.json');
        changed.cards[0].status = 'pending';
        const changedPath = path.join(root, 'changed.json');
        fs.writeFileSync(changedPath, `${JSON.stringify(changed)}\n`);

        const result = spawnSync(process.execPath, [
            RECONCILE_SCRIPT,
            path.join(FIXTURES, 'reconciliation-legacy.json'),
            changedPath,
            path.join(FIXTURES, 'critical-fields.json')
        ], { encoding: 'utf8' });
        assert.equal(result.status, 4, result.stderr);
        assert.deepEqual(JSON.parse(result.stdout).differences, ['cards']);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('[D1-02] Core reconciliation requires an exact six-table sqliteSequence artifact', () => {
    const generic = { cards: [{ id: 1, status: 'approved', title: 'e\u0301' }] };
    assert.deepEqual(
        reconcile(generic, { cards: [{ title: '\u00e9', status: 'approved', id: 1 }] }).differences,
        []
    );

    const source = {
        users: [{ id: 1 }], news: [], logs: [], cards: [{ id: 5 }], events: [], card_emojis: [],
        sqliteSequence: {
            users: null,
            news: null,
            logs: 0,
            cards: 99,
            events: 17,
            card_emojis: null
        }
    };
    assert.deepEqual(reconcile(source, structuredClone(source)).differences, []);

    const explicitPartial = {
        cards: [],
        sqliteSequence: structuredClone(source.sqliteSequence)
    };
    const partialResult = reconcile(explicitPartial, structuredClone(explicitPartial));
    assert.ok(partialResult.differences.includes('__core_artifact__'));
    assert.ok(partialResult.rejects.some((reject) => reject.code === 'missing-core-table'));

    const changed = structuredClone(source);
    changed.sqliteSequence.cards = 98;
    const changedResult = reconcile(source, changed);
    assert.ok(changedResult.differences.includes('__sqlite_sequence__'));
    assert.ok(changedResult.rejects.some((reject) => reject.code === 'sqlite-sequence-mismatch'));

    const invalidCases = [
        ['missing Core table', (target) => { delete target.news; }, 'missing-core-table', '__core_artifact__'],
        ['invalid Core table', (target) => { target.news = {}; }, 'invalid-core-table-shape', '__core_artifact__'],
        ['missing map', (target) => { delete target.sqliteSequence; }, 'missing-sqlite-sequence', '__sqlite_sequence__'],
        ['missing key', (target) => { delete target.sqliteSequence.news; }, 'sqlite-sequence-key-set', '__sqlite_sequence__'],
        ['extra key', (target) => { target.sqliteSequence.other = 1; }, 'sqlite-sequence-key-set', '__sqlite_sequence__'],
        ['string', (target) => { target.sqliteSequence.events = '17'; }, 'invalid-sqlite-sequence-value', '__sqlite_sequence__'],
        ['negative', (target) => { target.sqliteSequence.events = -1; }, 'invalid-sqlite-sequence-value', '__sqlite_sequence__'],
        ['fraction', (target) => { target.sqliteSequence.events = 1.5; }, 'invalid-sqlite-sequence-value', '__sqlite_sequence__'],
        ['unsafe integer', (target) => {
            target.sqliteSequence.events = Number.MAX_SAFE_INTEGER + 1;
        }, 'invalid-sqlite-sequence-value', '__sqlite_sequence__']
    ];
    for (const [name, mutate, code, difference] of invalidCases) {
        const target = structuredClone(source);
        mutate(target);
        const result = reconcile(source, target);
        assert.ok(result.differences.includes(difference), name);
        assert.ok(result.rejects.some((reject) => reject.side === 'target' && reject.code === code), name);
    }
});

test('[D1-02] target non-NFC strings are rejected before normalized hashes can hide drift', () => {
    const legacy = { records: [{ id: 1, title: 'Caf\u00e9' }] };
    const nfcTarget = structuredClone(legacy);
    assert.deepEqual(reconcile(legacy, nfcTarget).differences, []);

    const target = { records: [{ id: 1, title: 'Cafe\u0301' }] };
    const result = reconcile(legacy, target);
    assert.deepEqual(
        result.summary.records.legacy.normalizedRowHashes,
        result.summary.records.target.normalizedRowHashes
    );
    assert.ok(result.differences.includes('records'));
    assert.ok(result.rejects.some((reject) =>
        reject.side === 'target' && reject.table === 'records' &&
        reject.code === 'non-nfc-text' && reject.field === 'title'
    ));

    const storyLegacy = fixture('reconciliation-story-legacy.json');
    const storyTarget = fixture('reconciliation-story-d1.json');
    storyLegacy.cg_stories[0].note = 'Caf\u00e9';
    const landing = JSON.parse(storyTarget.story_legacy_rows[0].row_json);
    landing.note = 'Cafe\u0301';
    storyTarget.story_legacy_rows[0].row_json = JSON.stringify(landing).replace(
        'Cafe\u0301', 'Cafe\\u0301'
    );
    storyTarget.story_legacy_rows[0].normalized_hash = rowHash(landing);
    const escaped = reconcile(storyLegacy, storyTarget, fixture('reconciliation-config.json'));
    assert.ok(escaped.rejects.some((reject) =>
        reject.side === 'target' && reject.table === 'story_legacy_rows' &&
        reject.code === 'non-nfc-text' && reject.field === 'row_json(parsed).note'
    ));
});

test('[D1-02] transformed Story fixtures reconcile source keys, FKs and business aggregates', () => {
    const legacy = fixture('reconciliation-story-legacy.json');
    const target = fixture('reconciliation-story-d1.json');
    const config = fixture('reconciliation-config.json');
    const result = reconcile(legacy, target, config);
    assert.deepEqual(result.differences, []);
    assert.deepEqual(result.rejects, []);
    assert.equal(result.summary.story_legacy_rows.target.sourceKeys.unique, 3);
    assert.deepEqual(result.invariants.foreignKeys.target, []);
    assert.deepEqual(
        result.invariants.storyAggregates.legacy,
        result.invariants.storyAggregates.target
    );
    assert.deepEqual(
        Object.values(result.invariants.storyAggregates.target)
            .sort((left, right) => left.links - right.links),
        [
            { cards: 1, links: 1, images: 0 },
            { cards: 1, links: 2, images: 1 }
        ]
    );
    assert.deepEqual(
        result.invariants.storyProjection.cards.expected.normalizedRowHashes,
        result.invariants.storyProjection.cards.target.normalizedRowHashes
    );
    assert.deepEqual(
        result.invariants.storyProjection.links.expected.normalizedRowHashes,
        result.invariants.storyProjection.links.target.normalizedRowHashes
    );
    assert.equal(result.rejects.some((reject) => reject.code.includes('story-table')), false);
    assert.equal(result.differences.includes('__story_artifact__'), false);
});

test('[D1-02] formal empty Story artifacts are exact, scoped and shape-complete', () => {
    const config = fixture('reconciliation-config.json');
    const { legacy, target } = emptyStoryArtifacts();
    const empty = reconcile(legacy, target, config);
    assert.deepEqual(empty.differences, []);
    assert.deepEqual(empty.rejects, []);
    assert.deepEqual(empty.invariants.storyAggregates, { legacy: {}, target: {} });

    const runtime = structuredClone(target);
    runtime.agencies.push({
        id: 99, code: 'runtime', name_cn: 'Runtime Cafe\u0301', color: '#999999'
    });
    runtime.idols.push({
        id: 99, agency_id: 99, name_cn: 'Runtime Cafe\u0301',
        folder_name: 'runtime', color: '#999999'
    });
    runtime.theme_colors.push({ name: 'Runtime Cafe\u0301', color: '#999999' });
    runtime.story_cards.push({
        id: 900,
        idol_id: 99,
        category: 'runtime',
        card_name: 'Runtime Cafe\u0301',
        subtitle: null,
        image_file: null,
        source_table: 'cg_stories',
        source_id: 900,
        last_seen_run_id: 'runtime'
    });
    runtime.story_links.push({
        id: 901,
        card_id: 900,
        up_name: '',
        video_title: 'Runtime Cafe\u0301',
        url: '',
        source_table: 'cg_stories',
        source_id: 900,
        source_link_index: 0,
        last_seen_run_id: 'runtime'
    });
    const runtimeResult = reconcile(legacy, runtime, config);
    assert.deepEqual(runtimeResult.differences, []);
    assert.deepEqual(runtimeResult.rejects, []);

    const staleMigration = structuredClone(runtime);
    staleMigration.story_cards[0].last_seen_run_id = 'migration:stale';
    staleMigration.story_links[0].last_seen_run_id = 'migration:stale';
    const staleResult = reconcile(legacy, staleMigration, config);
    assert.ok(staleResult.rejects.some((reject) => reject.code === 'extra-story-card'));
    assert.ok(staleResult.rejects.some((reject) => reject.code === 'extra-story-link'));

    for (const table of ['agencies', 'idols', 'theme_colors', 'story_legacy_rows', 'story_cards', 'story_links']) {
        const missing = structuredClone(target);
        delete missing[table];
        const result = reconcile(legacy, missing, config);
        assert.ok(result.differences.includes('__story_artifact__'), table);
        assert.ok(result.rejects.some((reject) =>
            reject.side === 'target' && reject.table === table &&
            reject.code === 'missing-story-target-table'
        ), table);
    }

    for (const table of ['agencies', 'idols', 'theme_colors', ...STORY_TABLES]) {
        const missing = structuredClone(legacy);
        delete missing[table];
        const result = reconcile(missing, target, config);
        assert.ok(result.differences.includes('__story_artifact__'), table);
        assert.ok(result.rejects.some((reject) =>
            reject.side === 'legacy' && reject.table === table &&
            reject.code === (STORY_TABLES.includes(table)
                ? 'missing-story-source-table'
                : 'missing-story-base-table')
        ), table);
    }

    for (const table of ['agencies', 'story_legacy_rows', 'story_cards', 'story_links']) {
        const invalid = structuredClone(target);
        invalid[table] = {};
        const result = reconcile(legacy, invalid, config);
        assert.ok(result.differences.includes('__story_artifact__'), table);
        assert.ok(result.rejects.some((reject) =>
            reject.side === 'target' && reject.table === table &&
            reject.code === 'invalid-story-table-shape'
        ), table);
    }
});

test('[D1-02] Story base tables compare source keys while retaining valid runtime rows', () => {
    const legacy = fixture('reconciliation-story-legacy.json');
    const target = fixture('reconciliation-story-d1.json');
    const config = fixture('reconciliation-config.json');
    legacy.theme_colors = [{ name: '卡剧情', color: '#123456' }];
    target.theme_colors = [{ name: '卡剧情', color: '#123456' }];

    const withRuntimeRows = structuredClone(target);
    withRuntimeRows.agencies.push({
        id: 99, code: 'runtime', name_cn: 'Runtime Cafe\u0301', color: '#999999'
    });
    withRuntimeRows.idols.push({
        id: 99, agency_id: 99, name_cn: 'Runtime Cafe\u0301',
        folder_name: 'runtime', color: '#999999'
    });
    withRuntimeRows.theme_colors.push({ name: 'Runtime Cafe\u0301', color: '#999999' });
    assert.deepEqual(reconcile(legacy, withRuntimeRows, config).differences, []);
    assert.deepEqual(reconcile(legacy, withRuntimeRows, config).rejects, []);

    const driftCases = [
        ['agencies', (value) => { value.agencies[0].name_cn = 'Changed agency'; }],
        ['idols', (value) => { value.idols[0].folder_name = 'changed'; }],
        ['theme_colors', (value) => { value.theme_colors[0].color = '#000000'; }]
    ];
    for (const [table, mutate] of driftCases) {
        const changed = structuredClone(target);
        mutate(changed);
        assert.ok(reconcile(legacy, changed, config).differences.includes(table), `${table} drift`);
    }

    for (const table of ['agencies', 'idols', 'theme_colors']) {
        const missing = structuredClone(target);
        missing[table] = [];
        assert.ok(reconcile(legacy, missing, config).differences.includes(table), `${table} missing`);
    }

    const duplicate = structuredClone(target);
    duplicate.agencies.push({ ...duplicate.agencies[0] });
    const duplicateResult = reconcile(legacy, duplicate, config);
    assert.ok(duplicateResult.differences.includes('agencies'));
    assert.ok(duplicateResult.rejects.some((reject) =>
        reject.side === 'target' && reject.table === 'agencies' &&
        reject.code === 'duplicate-source-key'
    ));

    const invalidForeignKey = structuredClone(target);
    invalidForeignKey.idols.push({
        id: 99, agency_id: 999, name_cn: 'Runtime idol', folder_name: 'runtime', color: '#999999'
    });
    const foreignKeyResult = reconcile(legacy, invalidForeignKey, config);
    assert.ok(foreignKeyResult.differences.includes('__foreign_keys__'));
    assert.ok(foreignKeyResult.rejects.some((reject) =>
        reject.side === 'target' && reject.table === 'idols' && reject.code === 'foreign-key'
    ));
});

test('[D1-02] Story landing legacy_id must exactly match the typed row_json id', () => {
    const legacy = fixture('reconciliation-story-legacy.json');
    const config = fixture('reconciliation-config.json');
    assert.equal(
        reconcile(legacy, fixture('reconciliation-story-d1.json'), config).rejects.some((reject) =>
            reject.code === 'legacy-id-row-id-mismatch'
        ),
        false
    );

    const cases = [
        ['different integer', (target) => { target.story_legacy_rows[0].legacy_id = 999; }],
        ['different type', (target) => { target.story_legacy_rows[0].legacy_id = '1'; }],
        ['both string typed', (target) => {
            target.story_legacy_rows[0].legacy_id = '1';
            const row = JSON.parse(target.story_legacy_rows[0].row_json);
            row.id = '1';
            target.story_legacy_rows[0].row_json = JSON.stringify(row);
            target.story_legacy_rows[0].normalized_hash = rowHash(row);
        }]
    ];
    for (const [name, mutate] of cases) {
        const target = fixture('reconciliation-story-d1.json');
        mutate(target);
        const result = reconcile(legacy, target, config);
        assert.ok(result.differences.includes('story_legacy_rows'), name);
        assert.ok(result.rejects.some((reject) =>
            reject.side === 'target' && reject.code === 'legacy-id-row-id-mismatch'
        ), name);
    }
});

test('[D1-02] Story ownership markers keep the migrated snapshot exact', () => {
    const legacy = fixture('reconciliation-story-legacy.json');
    const config = fixture('reconciliation-config.json');
    for (const [table, marker] of [
        ['story_legacy_rows', 'story_legacy_rows'],
        ['story_cards', '__story_cards_projection__'],
        ['story_links', '__story_links_projection__']
    ]) {
        const target = fixture('reconciliation-story-d1.json');
        target[table][0].last_seen_run_id = 'runtime';
        const result = reconcile(legacy, target, config);
        assert.ok(result.differences.includes(marker), table);
        assert.ok(result.rejects.some((reject) =>
            reject.side === 'target' && reject.table === table &&
            reject.code === 'story-ownership-mismatch'
        ), table);
    }

    const missingMarker = fixture('reconciliation-story-d1.json');
    delete missingMarker.story_cards[0].last_seen_run_id;
    const missingResult = reconcile(legacy, missingMarker, config);
    assert.ok(missingResult.rejects.some((reject) =>
        reject.side === 'target' && reject.table === 'story_cards' &&
        reject.code === 'invalid-story-ownership-marker'
    ));
});

test('[D1-02] target-only migration Story rows fail while runtime normalized rows remain allowed', () => {
    const legacy = fixture('reconciliation-story-legacy.json');
    const config = fixture('reconciliation-config.json');
    const runtime = fixture('reconciliation-story-d1.json');
    runtime.agencies.push({
        id: 99, code: 'runtime', name_cn: 'Runtime Cafe\u0301', color: '#999999'
    });
    runtime.idols.push({
        id: 99, agency_id: 99, name_cn: 'Runtime Cafe\u0301',
        folder_name: 'runtime', color: '#999999'
    });
    runtime.theme_colors = [{ name: 'Runtime Cafe\u0301', color: '#999999' }];
    runtime.story_cards.push({
        id: 900,
        idol_id: 99,
        category: 'runtime',
        card_name: 'Runtime Cafe\u0301',
        subtitle: '',
        image_file: '',
        source_table: 'cg_stories',
        source_id: 900,
        last_seen_run_id: 'runtime'
    });
    runtime.story_links.push({
        id: 901,
        card_id: 900,
        up_name: 'Runtime UP',
        video_title: 'Runtime Cafe\u0301',
        url: 'https://example.test/runtime',
        source_table: 'cg_stories',
        source_id: 900,
        source_link_index: 0,
        last_seen_run_id: 'runtime'
    });
    const runtimeResult = reconcile(legacy, runtime, config);
    assert.deepEqual(runtimeResult.differences, []);
    assert.deepEqual(runtimeResult.rejects, []);

    const migrationOwned = structuredClone(runtime);
    migrationOwned.story_cards.at(-1).last_seen_run_id = 'migration:stale';
    migrationOwned.story_links.at(-1).last_seen_run_id = 'migration:stale';
    const migrationResult = reconcile(legacy, migrationOwned, config);
    assert.ok(migrationResult.differences.includes('__story_cards_projection__'));
    assert.ok(migrationResult.differences.includes('__story_links_projection__'));
    assert.ok(migrationResult.rejects.some((reject) => reject.code === 'extra-story-card'));
    assert.ok(migrationResult.rejects.some((reject) => reject.code === 'extra-story-link'));

    const landingTarget = fixture('reconciliation-story-d1.json');
    const landingRow = {
        ...JSON.parse(landingTarget.story_legacy_rows[0].row_json),
        id: 900,
        card_name: 'Stale landing'
    };
    landingTarget.story_legacy_rows.push({
        legacy_table: 'cg_stories',
        legacy_id: 900,
        row_json: JSON.stringify(landingRow),
        normalized_hash: rowHash(landingRow),
        last_seen_run_id: 'runtime'
    });
    const landingResult = reconcile(legacy, landingTarget, config);
    assert.ok(landingResult.differences.includes('story_legacy_rows'));
    assert.ok(landingResult.rejects.some((reject) => reject.code === 'extra-story-landing'));
});

test('[D1-02] canonical Story projections reject every content and source-mapping drift', () => {
    const legacy = fixture('reconciliation-story-legacy.json');
    const config = fixture('reconciliation-config.json');
    const cases = [
        {
            name: 'card_name', marker: '__story_cards_projection__',
            mutate: (target) => { target.story_cards[0].card_name = 'Changed card'; }
        },
        {
            name: 'subtitle', marker: '__story_cards_projection__',
            mutate: (target) => { target.story_cards[0].subtitle = 'Changed subtitle'; }
        },
        {
            name: 'image_file', marker: '__story_cards_projection__',
            mutate: (target) => { target.story_cards[0].image_file = 'cards/changed.webp'; }
        },
        {
            name: 'card source mapping', marker: '__story_cards_projection__',
            mutate: (target) => { target.story_cards[0].source_id = 999; }
        },
        {
            name: 'up_name', marker: '__story_links_projection__',
            mutate: (target) => { target.story_links[0].up_name = 'Changed UP'; }
        },
        {
            name: 'video_title', marker: '__story_links_projection__',
            mutate: (target) => { target.story_links[0].video_title = 'Changed title'; }
        },
        {
            name: 'url', marker: '__story_links_projection__',
            mutate: (target) => { target.story_links[0].url = 'https://changed.test'; }
        },
        {
            name: 'link source mapping', marker: '__story_links_projection__',
            mutate: (target) => { target.story_links[0].source_id = 999; }
        },
        {
            name: 'link card mapping', marker: '__story_links_projection__',
            mutate: (target) => { target.story_links[0].card_id = 101; }
        }
    ];

    for (const candidate of cases) {
        const target = fixture('reconciliation-story-d1.json');
        candidate.mutate(target);
        const result = reconcile(legacy, target, config);
        assert.ok(result.differences.includes(candidate.marker), candidate.name);
        assert.ok(result.rejects.some((reject) =>
            reject.side === 'target' && /story-(?:card|link)/.test(reject.code)
        ), candidate.name);
        assert.notDeepEqual(
            candidate.marker === '__story_cards_projection__'
                ? result.invariants.storyProjection.cards.expected.normalizedRowHashes
                : result.invariants.storyProjection.links.expected.normalizedRowHashes,
            candidate.marker === '__story_cards_projection__'
                ? result.invariants.storyProjection.cards.target.normalizedRowHashes
                : result.invariants.storyProjection.links.target.normalizedRowHashes,
            candidate.name
        );
    }
});

test('[D1-02] target duplicate keys, FK failures, critical nulls and aggregate drift are rejected', () => {
    const legacy = fixture('reconciliation-story-legacy.json');
    const target = fixture('reconciliation-story-d1.json');
    const config = fixture('reconciliation-config.json');
    target.story_legacy_rows.push({ ...target.story_legacy_rows[0] });
    target.story_legacy_rows[1].normalized_hash = '0'.repeat(64);
    target.story_cards[0].category = null;
    target.story_links[0].card_id = 9999;
    target.story_links.pop();

    const result = reconcile(legacy, target, config);
    assert.ok(result.differences.includes('story_legacy_rows'));
    assert.ok(result.differences.includes('story_cards'));
    assert.ok(result.differences.includes('__foreign_keys__'));
    assert.ok(result.differences.includes('__story_aggregates__'));
    const codes = new Set(result.rejects.filter((reject) => reject.side === 'target').map((reject) => reject.code));
    assert.ok(codes.has('duplicate-source-key'));
    assert.ok(codes.has('critical-null'));
    assert.ok(codes.has('foreign-key'));
    assert.ok(codes.has('normalized-hash-mismatch'));
});

test('[D1-02] reconciliation CLI writes a structured reject manifest', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ims-d1-rejects-'));
    const target = fixture('reconciliation-story-d1.json');
    target.story_links[0].card_id = 9999;
    const targetPath = path.join(root, 'target.json');
    const rejectsPath = path.join(root, 'rejects.json');
    fs.writeFileSync(targetPath, `${JSON.stringify(target)}\n`);
    try {
        const result = spawnSync(process.execPath, [
            RECONCILE_SCRIPT,
            path.join(FIXTURES, 'reconciliation-story-legacy.json'),
            targetPath,
            path.join(FIXTURES, 'reconciliation-config.json'),
            '--rejects', rejectsPath
        ], { encoding: 'utf8' });
        assert.equal(result.status, 4, result.stderr);
        const manifest = JSON.parse(fs.readFileSync(rejectsPath, 'utf8'));
        assert.equal(manifest.version, 1);
        assert.ok(manifest.rejects.some((reject) =>
            reject.side === 'target' && reject.code === 'foreign-key'
        ));
        assert.ok(manifest.differences.includes('__foreign_keys__'));
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('[D1-02] changed Story snapshots remove stale landing, cards and links', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ims-d1-stale-'));
    const source = new sqlite3.Database(path.join(root, 'source.sqlite'));
    const target = new sqlite3.Database(path.join(root, 'target.sqlite'));
    try {
        await exec(source, `${storySourceSchema()}
            INSERT INTO agencies VALUES(1, 'cg', '灰姑娘女孩', '#2681c8');
            INSERT INTO idols VALUES(1, 1, '测试偶像', 'fixture', '#fff');
            INSERT INTO cg_stories VALUES(1, 1, '卡剧情', 'Card', 'UP1', 'One', 'https://example.test/1', '', 'card.webp');
            INSERT INTO cg_stories VALUES(2, 1, '卡剧情', 'Card', 'UP2', 'Two', 'https://example.test/2', '', 'card.webp');
        `);
        await exec(target, migrations('story'));

        const first = await storySql(source, 'snapshot-one');
        assert.deepEqual(first.rejects, []);
        await exec(target, first.statements.join('\n'));
        assert.equal((await get(target, 'SELECT COUNT(*) AS count FROM story_legacy_rows')).count, 2);
        assert.equal((await get(target, 'SELECT COUNT(*) AS count FROM story_cards')).count, 1);
        assert.equal((await get(target, 'SELECT COUNT(*) AS count FROM story_links')).count, 2);
        await exec(target, `
            INSERT INTO story_cards
                (idol_id, category, card_name, source_table, source_id)
            VALUES (1, 'runtime', 'Runtime card', 'cg_stories', 999);
            INSERT INTO story_links
                (card_id, source_table, source_id, source_link_index)
            SELECT id, 'cg_stories', 999, 0 FROM story_cards
            WHERE source_table='cg_stories' AND source_id=999;
        `);

        await exec(source, `
            UPDATE cg_stories SET card_name='Other', image_file='other.webp' WHERE id=2;
        `);
        const regrouped = await storySql(source, 'snapshot-regrouped');
        await exec(target, regrouped.statements.join('\n'));
        assert.equal((await get(target, 'SELECT COUNT(*) AS count FROM story_legacy_rows')).count, 2);
        assert.equal((await get(target, 'SELECT COUNT(*) AS count FROM story_cards')).count, 3);
        assert.equal((await get(target, 'SELECT COUNT(*) AS count FROM story_links')).count, 3);

        await exec(source, 'DELETE FROM cg_stories WHERE id=1;');
        const reduced = await storySql(source, 'snapshot-reduced');
        await exec(target, reduced.statements.join('\n'));
        assert.equal((await get(target, 'SELECT COUNT(*) AS count FROM story_legacy_rows')).count, 1);
        assert.equal((await get(target, 'SELECT COUNT(*) AS count FROM story_cards')).count, 2);
        assert.equal((await get(target, 'SELECT COUNT(*) AS count FROM story_links')).count, 2);
        assert.deepEqual(
            await all(target, `
                SELECT source_id AS sourceId, last_seen_run_id AS marker
                FROM story_cards WHERE source_table='cg_stories' ORDER BY source_id
            `),
            [
                { sourceId: 2, marker: 'migration:snapshot-reduced' },
                { sourceId: 999, marker: 'runtime' }
            ]
        );

        const repeated = await storySql(source, 'snapshot-reduced');
        await exec(target, repeated.statements.join('\n'));
        assert.equal((await get(target, 'SELECT COUNT(*) AS count FROM story_links')).count, 2);
    } finally {
        await Promise.all([close(source), close(target)]);
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('[D1-02] export CLI emits rejects and refuses SQL when source FK is invalid', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ims-d1-export-reject-'));
    const sourcePath = path.join(root, 'source.sqlite');
    const source = new sqlite3.Database(sourcePath);
    const output = path.join(root, 'story.sql');
    const rejects = path.join(root, 'rejects.json');
    try {
        await exec(source, `${storySourceSchema()}
            INSERT INTO idols VALUES(1, 999, '失效偶像', 'invalid', '#fff');
            INSERT INTO cg_stories VALUES(1, 1, '卡剧情', 'Card', 'UP', 'Title', 'https://example.test', '', 'card.webp');
        `);
        await close(source);
        const result = spawnSync(process.execPath, [
            path.join(PROJECT_ROOT, 'scripts/migration/sqlite-to-d1.js'),
            'story', sourcePath, output, 'reject-run', '--snapshot', '--rejects', rejects
        ], { encoding: 'utf8' });
        assert.equal(result.status, 2, result.stderr);
        assert.equal(fs.existsSync(output), false);
        const manifest = JSON.parse(fs.readFileSync(rejects, 'utf8'));
        assert.ok(manifest.rejects.some((reject) => reject.code === 'foreign-key'));
    } finally {
        if (source.open) await close(source).catch(() => undefined);
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('[D1-02] Core export rejects invalid target constraints before emitting SQL', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ims-core-d1-export-reject-'));
    const sourcePath = path.join(root, 'source.sqlite');
    const source = new sqlite3.Database(sourcePath);
    const output = path.join(root, 'core.sql');
    const rejects = path.join(root, 'rejects.json');
    try {
        await exec(source, `${coreSourceSchema()}
            INSERT INTO cards VALUES(1, '/one.webp', '/two.webp', 'one', 'two', '127.0.0.1', 'invalid-status', '2026-07-21');
            INSERT INTO card_emojis VALUES(1, 999, 'like', 1);
        `);
        const generated = await coreSql(source, 'invalid-core-run');
        assert.deepEqual(generated.statements, []);
        assert.ok(generated.rejects.some((reject) => reject.code === 'foreign-key'));
        assert.ok(generated.rejects.some((reject) => reject.code === 'check-constraint'));
        await close(source);

        const result = spawnSync(process.execPath, [
            path.join(PROJECT_ROOT, 'scripts/migration/sqlite-to-d1.js'),
            'core', sourcePath, output, 'invalid-core-run', '--snapshot', '--rejects', rejects
        ], { encoding: 'utf8' });
        assert.equal(result.status, 2, result.stderr);
        assert.equal(fs.existsSync(output), false);
        const manifest = JSON.parse(fs.readFileSync(rejects, 'utf8'));
        assert.ok(manifest.rejects.some((reject) => reject.code === 'foreign-key'));
        assert.ok(manifest.rejects.some((reject) => reject.code === 'check-constraint'));
    } finally {
        if (source.open) await close(source).catch(() => undefined);
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('[D1-02] Core snapshot restores AUTOINCREMENT high-water marks and absent sequences', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ims-core-sequence-'));
    const source = new sqlite3.Database(path.join(root, 'source.sqlite'));
    const target = new sqlite3.Database(path.join(root, 'target.sqlite'));
    try {
        await exec(source, `${coreSourceSchema()}
            INSERT INTO cards VALUES
                (1, '/one.webp', '/two.webp', 'one', 'two', '127.0.0.1', 'approved', '2026-07-21');
            INSERT INTO card_emojis VALUES(6535, 1, 'like', 2);
            UPDATE sqlite_sequence SET seq=6546 WHERE name='card_emojis';
        `);
        const snapshotA = await coreSql(source, 'sequence-a');
        assert.deepEqual(snapshotA.rejects, []);
        assert.equal(snapshotA.summary.sqliteSequence.card_emojis, 6546);
        assert.equal(snapshotA.summary.sqliteSequence.users, null);

        await exec(source, "UPDATE sqlite_sequence SET seq=7000 WHERE name='card_emojis'");
        const snapshotB = await coreSql(source, 'sequence-b');
        assert.notEqual(snapshotA.summary.snapshotHash, snapshotB.summary.snapshotHash);
        await exec(target, migrations('core'));
        await exec(target, snapshotA.statements.join('\n'));
        await exec(target, snapshotA.statements.join('\n'));
        assert.deepEqual(
            await all(target, `
                SELECT name,seq FROM sqlite_sequence
                WHERE name IN ('users','news','logs','cards','events','card_emojis')
                ORDER BY name
            `),
            [{ name: 'card_emojis', seq: 6546 }, { name: 'cards', seq: 1 }]
        );
        await exec(target, "INSERT INTO card_emojis(card_id,emoji,count) VALUES(1,'next',1)");
        assert.equal((await get(target, "SELECT id FROM card_emojis WHERE emoji='next'")).id, 6547);

        await exec(target, snapshotB.statements.join('\n'));
        await exec(target, snapshotB.statements.join('\n'));
        assert.deepEqual(
            await all(target, `
                SELECT name,seq FROM sqlite_sequence
                WHERE name IN ('users','news','logs','cards','events','card_emojis')
                ORDER BY name
            `),
            [{ name: 'card_emojis', seq: 7000 }, { name: 'cards', seq: 1 }]
        );
        await exec(target, "INSERT INTO card_emojis(card_id,emoji,count) VALUES(1,'next',1)");
        assert.equal((await get(target, "SELECT id FROM card_emojis WHERE emoji='next'")).id, 7001);
    } finally {
        await Promise.all([close(source), close(target)]);
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('[D1-02] export rejects unsafe run IDs before creating any artifact', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ims-d1-run-id-'));
    const sourcePath = path.join(root, 'source.sqlite');
    const source = new sqlite3.Database(sourcePath);
    try {
        await exec(source, `${coreSourceSchema()}
            INSERT INTO users VALUES(1, 'fixture', 'hash', 'op', 'Fixture');
        `);
        await close(source);
        const invalid = ['run\nDROP TABLE users;', `run${String.fromCharCode(1)}control`, 'a'.repeat(81)];
        for (let index = 0; index < invalid.length; index += 1) {
            const output = path.join(root, `invalid-${index}.sql`);
            const rejects = path.join(root, `invalid-${index}.rejects.json`);
            const legacy = path.join(root, `invalid-${index}.legacy.json`);
            const result = runExport(
                'core', sourcePath, output, invalid[index],
                '--rejects', rejects, '--legacy-json', legacy
            );
            assert.equal(result.status, 1);
            assert.match(result.stderr, /Run ID must match/);
            assert.equal(fs.existsSync(output), false);
            assert.equal(fs.existsSync(rejects), false);
            assert.equal(fs.existsSync(legacy), false);
        }
        assert.throws(() => parseArguments([
            'core', sourcePath, path.join(root, 'nul.sql'), 'run\0id', '--snapshot'
        ]), /Run ID must match/);
    } finally {
        if (source.open) await close(source).catch(() => undefined);
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('[D1-02] empty Core export requires the exact source SHA-256 confirmation', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ims-empty-core-export-'));
    const sourcePath = path.join(root, 'empty.sqlite');
    const source = new sqlite3.Database(sourcePath);
    try {
        await exec(source, coreSourceSchema());
        await close(source);
        const sourceSha256 = sha256(sourcePath);
        for (const [name, extra] of [
            ['missing', []],
            ['wrong', ['--confirm-empty-core-source-sha256', '0'.repeat(64)]]
        ]) {
            const output = path.join(root, `${name}.sql`);
            const rejects = path.join(root, `${name}.rejects.json`);
            const result = runExport('core', sourcePath, output, 'empty-run', '--rejects', rejects, ...extra);
            assert.equal(result.status, 1);
            assert.match(result.stderr, /confirm-empty-core-source-sha256/);
            assert.equal(fs.existsSync(output), false);
            assert.equal(fs.existsSync(rejects), false);
        }

        const output = path.join(root, 'confirmed.sql');
        const rejects = path.join(root, 'confirmed.rejects.json');
        const legacy = path.join(root, 'confirmed.legacy.json');
        const confirmed = runExport(
            'core', sourcePath, output, 'empty-run',
            '--rejects', rejects,
            '--legacy-json', legacy,
            '--confirm-empty-core-source-sha256', sourceSha256
        );
        assert.equal(confirmed.status, 0, confirmed.stderr);
        assert.deepEqual(JSON.parse(fs.readFileSync(legacy, 'utf8')).users, []);
        assert.deepEqual(JSON.parse(fs.readFileSync(rejects, 'utf8')).rejects, []);
        assert.match(fs.readFileSync(output, 'utf8'), /DELETE FROM users/);
    } finally {
        if (source.open) await close(source).catch(() => undefined);
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('[D1-02] empty Story export requires the exact source SHA-256 confirmation', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ims-empty-story-export-'));
    const sourcePath = path.join(root, 'empty-story.sqlite');
    const source = new sqlite3.Database(sourcePath);
    try {
        await exec(source, `${storySourceSchema()}
            INSERT INTO agencies VALUES(1, 'cg', 'Agency', '#2681c8');
            INSERT INTO idols VALUES(1, 1, 'Idol', 'idol', '#ffffff');
        `);
        await close(source);
        const sourceSha256 = sha256(sourcePath);
        for (const [name, extra] of [
            ['missing', []],
            ['wrong', ['--confirm-empty-story-source-sha256', '0'.repeat(64)]]
        ]) {
            const output = path.join(root, `${name}.sql`);
            const rejects = path.join(root, `${name}.rejects.json`);
            const result = runExport('story', sourcePath, output, 'empty-story-run', '--rejects', rejects, ...extra);
            assert.equal(result.status, 1);
            assert.match(result.stderr, /confirm-empty-story-source-sha256/);
            assert.equal(fs.existsSync(output), false);
            assert.equal(fs.existsSync(rejects), false);
        }

        const output = path.join(root, 'confirmed.sql');
        const rejects = path.join(root, 'confirmed.rejects.json');
        const legacy = path.join(root, 'confirmed.legacy.json');
        const confirmed = runExport(
            'story', sourcePath, output, 'empty-story-run',
            '--rejects', rejects,
            '--legacy-json', legacy,
            '--confirm-empty-story-source-sha256', sourceSha256
        );
        assert.equal(confirmed.status, 0, confirmed.stderr);
        assert.deepEqual(JSON.parse(fs.readFileSync(rejects, 'utf8')).rejects, []);
        const legacyArtifact = JSON.parse(fs.readFileSync(legacy, 'utf8'));
        assert.deepEqual(legacyArtifact.agencies, [
            { id: 1, code: 'cg', name_cn: 'Agency', color: '#2681c8' }
        ]);
        assert.deepEqual(
            Object.keys(legacyArtifact).sort(),
            ['agencies', 'idols', 'theme_colors', ...STORY_TABLES].sort()
        );
        for (const table of STORY_TABLES) assert.deepEqual(legacyArtifact[table], [], table);
        assert.match(fs.readFileSync(output, 'utf8'), /DELETE FROM story_links/);
    } finally {
        if (source.open) await close(source).catch(() => undefined);
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('[D1-02] export rejects symlinks, sidecars, unsafe storage and non-NFC text', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ims-core-storage-reject-'));
    const sourcePath = path.join(root, 'source.sqlite');
    const source = new sqlite3.Database(sourcePath);
    try {
        await exec(source, `${coreSourceSchema()}
            INSERT INTO users VALUES(1, X'ff00', 'hash', 'op', 'Blob');
            INSERT INTO users VALUES(9007199254740993, 'unsafe', 'hash', 'op', 'Unsafe');
            INSERT INTO news VALUES(1, CAST(X'610062' AS TEXT), NULL, NULL, NULL, NULL, NULL);
            INSERT INTO events VALUES(1, 'Cafe\u0301', NULL, NULL, NULL, '2026-07-21');
            INSERT INTO events VALUES(2, CAST(X'80' AS TEXT), NULL, NULL, NULL, '2026-07-21');
            UPDATE sqlite_sequence SET seq=CAST('2' AS TEXT) WHERE name='events';
        `);
        await close(source);

        const sidecarOutput = path.join(root, 'sidecar.sql');
        const sidecarRejects = path.join(root, 'sidecar.rejects.json');
        fs.writeFileSync(`${sourcePath}-wal`, 'not-a-static-backup');
        const sidecar = runExport(
            'core', sourcePath, sidecarOutput, 'sidecar-run', '--rejects', sidecarRejects
        );
        assert.equal(sidecar.status, 1);
        assert.match(sidecar.stderr, /sidecar files/);
        assert.equal(fs.existsSync(sidecarOutput), false);
        assert.equal(fs.existsSync(sidecarRejects), false);
        fs.unlinkSync(`${sourcePath}-wal`);

        const symlinkPath = path.join(root, 'source-link.sqlite');
        const symlinkOutput = path.join(root, 'symlink.sql');
        const symlinkRejects = path.join(root, 'symlink.rejects.json');
        fs.symlinkSync(sourcePath, symlinkPath);
        const symlink = runExport(
            'core', symlinkPath, symlinkOutput, 'symlink-run', '--rejects', symlinkRejects
        );
        assert.equal(symlink.status, 1);
        assert.match(symlink.stderr, /symbolic link/);
        assert.equal(fs.existsSync(symlinkOutput), false);
        assert.equal(fs.existsSync(symlinkRejects), false);

        const output = path.join(root, 'typed.sql');
        const rejectsPath = path.join(root, 'typed.rejects.json');
        const legacyPath = path.join(root, 'typed.legacy.json');
        const typed = runExport(
            'core', sourcePath, output, 'typed-run',
            '--rejects', rejectsPath, '--legacy-json', legacyPath
        );
        assert.equal(typed.status, 2, typed.stderr);
        assert.equal(fs.existsSync(output), false);
        assert.equal(fs.existsSync(legacyPath), false);
        const rejects = JSON.parse(fs.readFileSync(rejectsPath, 'utf8')).rejects;
        assert.ok(rejects.some((reject) => reject.code === 'storage-class' && reject.field === 'username'));
        assert.ok(rejects.some((reject) => reject.code === 'unsafe-integer' && reject.field === 'id'));
        assert.ok(rejects.some((reject) => reject.code === 'nul-text' && reject.field === 'title'));
        assert.ok(rejects.some((reject) => reject.code === 'non-nfc-text' && reject.field === 'title'));
        assert.ok(rejects.some((reject) =>
            reject.code === 'invalid-utf8' && reject.table === 'events' && reject.sourceId === 2
        ));
        assert.ok(rejects.some((reject) =>
            reject.code === 'storage-class' && reject.table === 'sqlite_sequence' &&
            reject.field === 'seq' && reject.expected === 'integer'
        ));
    } finally {
        if (source.open) await close(source).catch(() => undefined);
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('[D1-02] Story rejects invalid UTF-8 bytes without rejecting valid Unicode text', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ims-story-utf8-reject-'));
    const sourcePath = path.join(root, 'story.sqlite');
    const source = new sqlite3.Database(sourcePath);
    try {
        await exec(source, `${storySourceSchema()}
            INSERT INTO agencies VALUES(1, 'cg', '灰姑娘女孩', '#2681c8');
            INSERT INTO idols VALUES(1, 1, '测试偶像', 'fixture', '#ffffff');
            INSERT INTO cg_stories VALUES
                (1, 1, '卡剧情', '合法 Unicode', 'UP', '\uFEFF剧情 🎴 Café', 'https://example.test/1', '', 'card.webp');
            INSERT INTO cg_stories VALUES
                (2, 1, '卡剧情', '非法 UTF-8', 'UP', CAST(X'80' AS TEXT), 'https://example.test/2', '', 'bad.webp');
        `);
        await close(source);
        const output = path.join(root, 'story.sql');
        const rejectsPath = path.join(root, 'story.rejects.json');
        const legacyPath = path.join(root, 'story.legacy.json');
        const result = runExport(
            'story', sourcePath, output, 'story-utf8-run',
            '--rejects', rejectsPath, '--legacy-json', legacyPath
        );
        assert.equal(result.status, 2, result.stderr);
        assert.equal(fs.existsSync(output), false);
        assert.equal(fs.existsSync(legacyPath), false);
        assert.doesNotMatch(result.stdout, /sourceHash|snapshotHash/);
        const rejects = JSON.parse(fs.readFileSync(rejectsPath, 'utf8')).rejects;
        assert.ok(rejects.some((reject) =>
            reject.code === 'invalid-utf8' && reject.table === 'cg_stories' &&
            reject.sourceId === 2 && reject.field === 'video_title'
        ));
        assert.equal(rejects.some((reject) => reject.sourceId === 1), false);
    } finally {
        if (source.open) await close(source).catch(() => undefined);
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('[D1-02] immutable export leaves a WAL-mode snapshot directory unchanged', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ims-wal-mode-export-'));
    const sourceDir = path.join(root, 'source');
    const artifactDir = path.join(root, 'artifacts');
    fs.mkdirSync(sourceDir);
    fs.mkdirSync(artifactDir);
    const sourcePath = path.join(sourceDir, 'source.sqlite');
    const source = new sqlite3.Database(sourcePath);
    try {
        const journal = await get(source, 'PRAGMA journal_mode=WAL');
        assert.equal(journal.journal_mode, 'wal');
        await exec(source, `${coreSourceSchema()}
            INSERT INTO users VALUES(1, 'fixture', 'hash', 'op', 'Fixture');
        `);
        await get(source, 'PRAGMA wal_checkpoint(TRUNCATE)');
        await close(source);
        assert.deepEqual(fs.readdirSync(sourceDir).sort(), ['source.sqlite']);
        const beforeDirectory = fs.readdirSync(sourceDir).sort();
        const beforeProof = sourceProof(sourcePath);

        const output = path.join(artifactDir, 'core.sql');
        const rejects = path.join(artifactDir, 'core.rejects.json');
        const legacy = path.join(artifactDir, 'core.legacy.json');
        const result = runExport(
            'core', sourcePath, output, 'wal-mode-run',
            '--rejects', rejects, '--legacy-json', legacy
        );
        assert.equal(result.status, 0, result.stderr);
        assert.deepEqual(fs.readdirSync(sourceDir).sort(), beforeDirectory);
        assertSameSourceProof(beforeProof, sourceProof(sourcePath));
        assert.equal(fs.existsSync(`${sourcePath}-wal`), false);
        assert.equal(fs.existsSync(`${sourcePath}-shm`), false);
    } finally {
        if (source.open) await close(source).catch(() => undefined);
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('[D1-02] source proof detects metadata and SHA changes', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ims-source-proof-'));
    const sourcePath = path.join(root, 'source.sqlite');
    const source = new sqlite3.Database(sourcePath);
    try {
        await exec(source, `${coreSourceSchema()}
            INSERT INTO users VALUES(1, 'fixture', 'hash', 'op', 'Fixture');
        `);
        await close(source);
        const before = sourceProof(sourcePath);
        fs.appendFileSync(sourcePath, 'changed-after-read');
        const after = sourceProof(sourcePath);
        assert.throws(() => assertSameSourceProof(before, after), /changed during export/);
    } finally {
        if (source.open) await close(source).catch(() => undefined);
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('[D1-02] exported Core and Story legacy JSON complete the reconciliation chain', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ims-reconcile-chain-'));
    const coreSourcePath = path.join(root, 'core.sqlite');
    const storySourcePath = path.join(root, 'story.sqlite');
    const coreSource = new sqlite3.Database(coreSourcePath);
    const storySource = new sqlite3.Database(storySourcePath);
    const coreTarget = new sqlite3.Database(path.join(root, 'core-target.sqlite'));
    const storyTarget = new sqlite3.Database(path.join(root, 'story-target.sqlite'));
    try {
        await exec(coreSource, `${coreSourceSchema()}
            INSERT INTO users VALUES(1, 'fixture', 'hash', 'op', 'Fixture');
            INSERT INTO news VALUES(1, 'Quoted ''news''\nline', NULL, NULL, 'content', '2026-07-21', 'Fixture');
            INSERT INTO logs VALUES(1, 'fixture', 'Fixture', 'publish', 'News', '127.0.0.1', '2026-07-21');
            INSERT INTO cards VALUES(1, '/one.webp', '/two.webp', 'one', 'two', '127.0.0.1', 'approved', '2026-07-21');
            INSERT INTO events VALUES(1, 'Event', 'Fixture', 'fixture@example.test', '/event.png', '2026-07-21');
            INSERT INTO card_emojis VALUES(1, 1, 'like', 2);
        `);
        await exec(storySource, `${storySourceSchema()}
            INSERT INTO agencies VALUES(1, 'cg', '灰姑娘女孩', '#2681c8');
            INSERT INTO idols VALUES(10, 1, '测试偶像', 'fixture', '#ffffff');
            INSERT INTO theme_colors VALUES('卡剧情', '#123456');
            INSERT INTO cg_stories VALUES(1, 10, '卡剧情', 'Card', 'UP', 'Title', 'https://example.test', '', 'cards/a.webp');
        `);
        await Promise.all([close(coreSource), close(storySource)]);

        const exports = {};
        for (const [kind, sourcePath] of [['core', coreSourcePath], ['story', storySourcePath]]) {
            const output = path.join(root, `${kind}.sql`);
            const rejects = path.join(root, `${kind}.rejects.json`);
            const legacy = path.join(root, `${kind}-legacy.json`);
            const result = runExport(
                kind, sourcePath, output, 'fixture-chain',
                '--rejects', rejects, '--legacy-json', legacy
            );
            assert.equal(result.status, 0, result.stderr);
            exports[kind] = { output, legacy };
        }

        await exec(coreTarget, `${migrations('core')}\n${fs.readFileSync(exports.core.output, 'utf8')}`);
        await exec(storyTarget, `${migrations('story')}\n${fs.readFileSync(exports.story.output, 'utf8')}`);
        const coreTargetJson = {
            users: await all(coreTarget, 'SELECT id,username,password,dept,producername FROM users ORDER BY id'),
            news: await all(coreTarget, 'SELECT id,title,image,thumbnail,content,date,author FROM news ORDER BY id'),
            logs: await all(coreTarget, 'SELECT id,username,producername,action,target,ip,time FROM logs ORDER BY id'),
            cards: await all(coreTarget, 'SELECT id,image1_url,image2_url,hash1,hash2,ip,status,created_at FROM cards ORDER BY id'),
            events: await all(coreTarget, 'SELECT id,title,name,contact,image_url,created_at FROM events ORDER BY id'),
            card_emojis: await all(coreTarget, 'SELECT id,card_id,emoji,count FROM card_emojis ORDER BY id'),
            sqliteSequence: await sqliteSequenceSnapshot(coreTarget)
        };
        const storyTargetJson = {
            agencies: await all(storyTarget, 'SELECT id,code,name_cn,color FROM agencies ORDER BY id'),
            idols: await all(storyTarget, 'SELECT id,agency_id,name_cn,folder_name,color FROM idols ORDER BY id'),
            theme_colors: await all(storyTarget, 'SELECT name,color FROM theme_colors ORDER BY name'),
            story_legacy_rows: await all(storyTarget, 'SELECT legacy_table,legacy_id,row_json,normalized_hash,last_seen_run_id FROM story_legacy_rows ORDER BY legacy_table,legacy_id'),
            story_cards: await all(storyTarget, 'SELECT id,idol_id,category,card_name,subtitle,image_file,source_table,source_id,last_seen_run_id FROM story_cards ORDER BY id'),
            story_links: await all(storyTarget, 'SELECT id,card_id,up_name,video_title,url,source_table,source_id,source_link_index,last_seen_run_id FROM story_links ORDER BY id')
        };
        const cases = [
            ['core', coreTargetJson, 'critical-fields.json'],
            ['story', storyTargetJson, 'reconciliation-config.json']
        ];
        for (const [kind, targetJson, config] of cases) {
            const targetPath = path.join(root, `${kind}-d1.json`);
            const reconcileRejects = path.join(root, `${kind}-reconcile.rejects.json`);
            fs.writeFileSync(targetPath, `${JSON.stringify(targetJson)}\n`);
            const result = spawnSync(process.execPath, [
                RECONCILE_SCRIPT,
                exports[kind].legacy,
                targetPath,
                path.join(FIXTURES, config),
                '--rejects', reconcileRejects
            ], { encoding: 'utf8' });
            assert.equal(result.status, 0, result.stderr || result.stdout);
            assert.deepEqual(JSON.parse(fs.readFileSync(reconcileRejects, 'utf8')).differences, []);
        }
    } finally {
        await Promise.all([
            close(coreSource).catch(() => undefined), close(storySource).catch(() => undefined),
            close(coreTarget).catch(() => undefined), close(storyTarget).catch(() => undefined)
        ]);
        fs.rmSync(root, { recursive: true, force: true });
    }
});
