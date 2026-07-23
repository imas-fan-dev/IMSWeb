'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');
const sqlite3 = require('sqlite3').verbose();
const { reconcile } = require('../../scripts/migration/d1-reconcile');
const { coreSql, storySql } = require('../../scripts/migration/sqlite-to-d1');

const PROJECT_ROOT = path.resolve(__dirname, '../..');
const EXPORT_SCRIPT = path.join(PROJECT_ROOT, 'scripts/migration/sqlite-to-d1.js');
const STORY_TABLES = [
    '765_stories', '876_stories', 'cg_stories', 'ml_stories',
    'sidem_stories', 'sc_stories', 'gk_stories'
];

function wranglerBinary() {
    const executable = process.platform === 'win32' ? 'wrangler.CMD' : 'wrangler';
    const candidates = [
        path.join(PROJECT_ROOT, 'node_modules', '.bin', executable),
        path.join(PROJECT_ROOT, '..', '..', 'node_modules', '.bin', executable)
    ];
    const result = candidates.find((candidate) => fs.existsSync(candidate));
    if (!result) throw new Error(`Wrangler binary not found: ${candidates.join(', ')}`);
    return result;
}

function database(file) {
    return new sqlite3.Database(file);
}

function exec(databaseHandle, sql) {
    return new Promise((resolve, reject) => databaseHandle.exec(sql, (error) => {
        if (error) reject(error);
        else resolve();
    }));
}

function close(databaseHandle) {
    return new Promise((resolve, reject) => databaseHandle.close((error) => {
        if (error) reject(error);
        else resolve();
    }));
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

function coreSourceSchemaWithoutPrimaryIds() {
    return coreSourceSchema().replaceAll('id INTEGER PRIMARY KEY AUTOINCREMENT', 'id INTEGER');
}

function storySourceSchemaWithoutPrimaryKeys() {
    return storySourceSchema()
        .replace('CREATE TABLE agencies(id INTEGER PRIMARY KEY,', 'CREATE TABLE agencies(id INTEGER,')
        .replace('CREATE TABLE idols(id INTEGER PRIMARY KEY,', 'CREATE TABLE idols(id INTEGER,')
        .replace('CREATE TABLE theme_colors(name TEXT PRIMARY KEY,', 'CREATE TABLE theme_colors(name TEXT,')
        .replaceAll('id INTEGER PRIMARY KEY, idol_id', 'id INTEGER, idol_id');
}

function runExport(kind, source, output, runId, ...options) {
    return spawnSync(process.execPath, [
        EXPORT_SCRIPT, kind, source, output, runId, '--snapshot', ...options
    ], {
        cwd: PROJECT_ROOT,
        encoding: 'utf8',
        timeout: 60_000
    });
}

function runWranglerResult(root, args) {
    const home = path.join(root, 'home');
    const xdg = path.join(root, 'xdg');
    fs.mkdirSync(home, { recursive: true });
    fs.mkdirSync(xdg, { recursive: true });
    return spawnSync(wranglerBinary(), args, {
        cwd: PROJECT_ROOT,
        encoding: 'utf8',
        timeout: 60_000,
        env: {
            ...process.env,
            CI: '1',
            HOME: home,
            XDG_CONFIG_HOME: xdg,
            NO_COLOR: '1'
        }
    });
}

function runWrangler(root, args) {
    const result = runWranglerResult(root, args);
    assert.equal(
        result.status,
        0,
        `wrangler ${args.join(' ')} failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
    );
    return result;
}

function query(root, persist, binding, sql) {
    const result = runWrangler(root, [
        'd1', 'execute', binding, '--local', '--persist-to', persist,
        '--command', sql, '--json'
    ]);
    const document = JSON.parse(result.stdout);
    assert.equal(document[0].success, true);
    return document[0].results;
}

function assertD1ImportSql(sql) {
    assert.match(sql, /PRAGMA defer_foreign_keys\s*=\s*TRUE/i);
    assert.doesNotMatch(sql, /PRAGMA\s+foreign_keys\s*=|\bBEGIN(?:\s+IMMEDIATE)?\b|\bCOMMIT\b/i);
}

function coreGate(root, persist, runId) {
    const escapedRunId = runId.replaceAll("'", "''");
    return query(root, persist, 'CORE_DB', `
        SELECT
            (SELECT COUNT(*) FROM _ims_core_snapshot_guard) AS active_guards,
            COALESCE((SELECT status FROM _ims_core_snapshot_runs
                      WHERE run_id='${escapedRunId}'), '') AS run_status,
            (SELECT COUNT(*) FROM sqlite_master
             WHERE type='table'
               AND (name='_ims_core_snapshot_assertion'
                    OR name GLOB '_ims_core_snapshot_stage_*')) AS transient_tables
    `);
}

function assertCoreGate(root, persist, runId) {
    assert.deepEqual(coreGate(root, persist, runId), [{
        active_guards: 0,
        run_status: 'completed',
        transient_tables: 0
    }]);
}

function storyGate(root, persist, runId) {
    const escapedRunId = runId.replaceAll("'", "''");
    return query(root, persist, 'STORY_DB', `
        SELECT
            (SELECT COUNT(*) FROM _ims_story_snapshot_guard) AS active_guards,
            COALESCE((SELECT status FROM _ims_story_snapshot_runs
                      WHERE run_id='${escapedRunId}'), '') AS run_status,
            (SELECT COUNT(*) FROM story_import_runs AS audit
             JOIN _ims_story_snapshot_runs AS run
               ON run.run_id=audit.run_id AND run.snapshot_hash=audit.source_sha256
             WHERE audit.run_id='${escapedRunId}' AND run.status='completed') AS audit_matches,
            (SELECT COUNT(*) FROM sqlite_master
             WHERE type='table'
               AND (name='_ims_story_snapshot_assertion'
                    OR name GLOB '_ims_story_snapshot_stage_*')) AS transient_tables
    `);
}

function assertStoryGate(root, persist, runId) {
    assert.deepEqual(storyGate(root, persist, runId), [{
        active_guards: 0,
        run_status: 'completed',
        audit_matches: 1,
        transient_tables: 0
    }]);
}

test('[D1-02] exporter rejects duplicate primary IDs before emitting staging SQL', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ims-export-duplicate-id-'));
    const coreSourcePath = path.join(root, 'core.sqlite');
    const storySourcePath = path.join(root, 'story.sqlite');
    const coreSource = database(coreSourcePath);
    const storySource = database(storySourcePath);
    try {
        await exec(coreSource, `${coreSourceSchemaWithoutPrimaryIds()}
            INSERT INTO users VALUES
                (1, 'user-a', 'hash', 'op', 'Producer A'),
                (1, 'user-b', 'hash', 'op', 'Producer B');
            INSERT INTO news VALUES
                (2, 'News A', NULL, NULL, 'A', '2026-07-21', 'A'),
                (2, 'News B', NULL, NULL, 'B', '2026-07-21', 'B');
            INSERT INTO logs VALUES
                (3, 'user-a', 'Producer A', 'publish', 'A', '127.0.0.1', '2026-07-21'),
                (3, 'user-b', 'Producer B', 'publish', 'B', '127.0.0.2', '2026-07-21');
            INSERT INTO cards VALUES
                (4, '/a.webp', '/b.webp', 'a', 'b', '127.0.0.1', 'approved', '2026-07-21'),
                (4, '/c.webp', '/d.webp', 'c', 'd', '127.0.0.2', 'pending', '2026-07-21');
            INSERT INTO events VALUES
                (5, 'Event A', 'A', 'a@example.test', '/a.png', '2026-07-21'),
                (5, 'Event B', 'B', 'b@example.test', '/b.png', '2026-07-21');
            INSERT INTO card_emojis VALUES
                (6, 4, 'like', 1),
                (6, 4, 'love', 2);
        `);
        await exec(storySource, `${storySourceSchemaWithoutPrimaryKeys()}
            INSERT INTO agencies VALUES
                (1, 'cg-a', 'Agency A', '#2681c8'),
                (1, 'cg-b', 'Agency B', '#2681c9');
            INSERT INTO idols VALUES
                (10, 1, 'Idol A', 'idol-a', '#ffffff'),
                (10, 1, 'Idol B', 'idol-b', '#eeeeee');
            INSERT INTO theme_colors VALUES
                ('card', '#123456'),
                ('card', '#654321');
            ${STORY_TABLES.map((table) => `
                INSERT INTO "${table}" VALUES
                    (1, 10, 'card', 'Card A', 'UP A', 'Part A', 'https://example.test/a', '', 'a.webp'),
                    (1, 10, 'card', 'Card B', 'UP B', 'Part B', 'https://example.test/b', '', 'b.webp');
            `).join('\n')}
        `);
        await Promise.all([close(coreSource), close(storySource)]);

        for (const [kind, sourcePath, expectedKeys] of [
            ['core', coreSourcePath, Object.fromEntries(
                ['users', 'news', 'logs', 'cards', 'events', 'card_emojis']
                    .map((table) => [table, ['id']])
            )],
            ['story', storySourcePath, {
                agencies: ['id'],
                idols: ['id'],
                theme_colors: ['name'],
                ...Object.fromEntries(STORY_TABLES.map((table) => [table, ['id']]))
            }]
        ]) {
            const output = path.join(root, `${kind}.sql`);
            const rejectsPath = path.join(root, `${kind}.rejects.json`);
            const legacyPath = path.join(root, `${kind}.legacy.json`);
            const result = runExport(
                kind, sourcePath, output, `duplicate-${kind}`,
                '--rejects', rejectsPath, '--legacy-json', legacyPath
            );
            assert.equal(result.status, 2, result.stderr || result.stdout);
            assert.equal(fs.existsSync(output), false);
            assert.equal(fs.existsSync(legacyPath), false);
            const rejects = JSON.parse(fs.readFileSync(rejectsPath, 'utf8')).rejects;
            for (const [table, fields] of Object.entries(expectedKeys)) {
                assert.ok(rejects.some((reject) =>
                    reject.code === 'unique-key' && reject.table === table &&
                    JSON.stringify(reject.fields) === JSON.stringify(fields)
                ), `${kind} must reject duplicate primary key ${table}(${fields.join(',')})`);
            }
        }
    } finally {
        await Promise.all([
            close(coreSource).catch(() => undefined),
            close(storySource).catch(() => undefined)
        ]);
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('[D1-03] Core legacy artifact and Wrangler target preserve exact sqlite_sequence state', {
    timeout: 120_000
}, async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ims-core-sequence-artifact-'));
    const persist = path.join(root, 'persist');
    const sourcePath = path.join(root, 'core.sqlite');
    const source = database(sourcePath);
    try {
        await exec(source, `${coreSourceSchema()}
            INSERT INTO users VALUES(1, 'fixture', 'hash', 'op', 'Fixture');
            INSERT INTO cards VALUES(5, '/one.webp', '/two.webp', 'one', 'two', '127.0.0.1', 'approved', '2026-07-21');
            INSERT INTO events VALUES(7, 'Removed', 'Fixture', 'fixture@example.test', '/event.png', '2026-07-21');
            DELETE FROM events;
            DELETE FROM sqlite_sequence WHERE name='users';
            UPDATE sqlite_sequence SET seq=99 WHERE name='cards';
            UPDATE sqlite_sequence SET seq=17 WHERE name='events';
        `);
        await close(source);

        const output = path.join(root, 'core.sql');
        const rejectsPath = path.join(root, 'core.rejects.json');
        const legacyPath = path.join(root, 'core.legacy.json');
        const exported = runExport(
            'core', sourcePath, output, 'sequence-artifact',
            '--rejects', rejectsPath, '--legacy-json', legacyPath
        );
        assert.equal(exported.status, 0, exported.stderr || exported.stdout);
        const expectedSequence = {
            users: null,
            news: null,
            logs: null,
            cards: 99,
            events: 17,
            card_emojis: null
        };
        const legacy = JSON.parse(fs.readFileSync(legacyPath, 'utf8'));
        assert.deepEqual(legacy.sqliteSequence, expectedSequence);
        assert.deepEqual(JSON.parse(exported.stdout).summary.sqliteSequence, expectedSequence);

        runWrangler(root, [
            'd1', 'migrations', 'apply', 'CORE_DB', '--local', '--persist-to', persist
        ]);
        runWrangler(root, [
            'd1', 'execute', 'CORE_DB', '--local', '--persist-to', persist,
            '--file', output, '--yes'
        ]);
        const targetRows = query(root, persist, 'CORE_DB', `
            SELECT name,seq FROM sqlite_sequence
            WHERE name IN ('users','news','logs','cards','events','card_emojis')
            ORDER BY name
        `);
        const targetByName = new Map(targetRows.map(({ name, seq }) => [name, seq]));
        const targetSequence = Object.fromEntries(
            Object.keys(expectedSequence).map((name) => [name, targetByName.get(name) ?? null])
        );
        assert.deepEqual(targetSequence, legacy.sqliteSequence);
        assert.deepEqual(targetRows, [
            { name: 'cards', seq: 99 },
            { name: 'events', seq: 17 }
        ]);
        assert.deepEqual(query(root, persist, 'CORE_DB', `
            SELECT
                (SELECT COUNT(*) FROM users) AS users,
                (SELECT COUNT(*) FROM events) AS events,
                (SELECT MAX(id) FROM cards) AS cards_max_id
        `), [{ users: 1, events: 0, cards_max_id: 5 }]);
        assertCoreGate(root, persist, 'sequence-artifact');
    } finally {
        if (source.open) await close(source).catch(() => undefined);
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('[D1-03] generated Core and Story imports execute twice through Wrangler local D1', {
    timeout: 120_000
}, async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ims-wrangler-d1-import-'));
    const persist = path.join(root, 'persist');
    const coreSourcePath = path.join(root, 'core-source.sqlite');
    const coreSource = database(coreSourcePath);
    const storySource = database(path.join(root, 'story-source.sqlite'));
    try {
        await exec(coreSource, `${coreSourceSchema()}
            INSERT INTO users VALUES
                (1, 'removed', 'old-hash', 'op', 'Removed P'),
                (2, 'fixture', 'hash', 'op', 'Fixture P');
            INSERT INTO news VALUES
                (1, 'Removed news', '/removed.png', '/removed-thumb.png', 'removed', '2026-07-20', 'Removed P'),
                (2, 'News A', '/uploads/news/original/news.png', '/uploads/news/thumb/news.png', 'https://example.test/news-a', '2026-07-21', 'Fixture P');
            INSERT INTO logs VALUES
                (1, 'removed', 'Removed P', 'publish', 'Removed', '127.0.0.2', '2026-07-20'),
                (2, 'fixture', 'Fixture P', 'publish', 'News A', '127.0.0.1', '2026-07-21');
            INSERT INTO cards VALUES
                (1, '/removed-one.webp', '/removed-two.webp', 'old1', 'old2', '127.0.0.2', 'pending', '2026-07-20'),
                (2, '/one.webp', '/two.webp', 'hash1', 'hash2', '127.0.0.1', 'pending', '2026-07-21');
            INSERT INTO events VALUES
                (1, 'Removed event', 'Removed', 'removed@example.test', '/removed-event.png', '2026-07-20'),
                (2, 'Event A', 'Fixture', 'fixture@example.test', '/event-a.png', '2026-07-21');
            INSERT INTO card_emojis VALUES
                (1, 1, 'like', 1),
                (2, 2, 'like', 2);
            UPDATE sqlite_sequence SET seq=CASE name
                WHEN 'users' THEN 101 WHEN 'news' THEN 102 WHEN 'logs' THEN 103
                WHEN 'cards' THEN 104 WHEN 'events' THEN 105
                WHEN 'card_emojis' THEN 6546 END
            WHERE name IN ('users','news','logs','cards','events','card_emojis');
        `);
        await exec(storySource, `${storySourceSchema()}
            INSERT INTO agencies VALUES(1, 'cg', '灰姑娘女孩', '#2681c8');
            INSERT INTO idols VALUES(10, 1, '测试偶像', 'fixture', '#ffffff');
            INSERT INTO theme_colors VALUES('卡剧情', '#123456');
            INSERT INTO cg_stories VALUES(1, 10, '卡剧情', 'Card A', 'UP1', 'Part 1', 'https://example.test/1', '', 'cards/a.webp');
            INSERT INTO cg_stories VALUES(2, 10, '卡剧情', 'Card A', 'UP2', 'Part 2', 'https://example.test/2', '', 'cards/a.webp');
        `);

        const coreA = await coreSql(coreSource, 'wrangler-core-a');
        await exec(coreSource, `
            DELETE FROM card_emojis WHERE id=1;
            DELETE FROM cards WHERE id=1;
            DELETE FROM users WHERE id=1;
            DELETE FROM news WHERE id=1;
            DELETE FROM logs WHERE id=1;
            DELETE FROM events WHERE id=1;
            UPDATE users SET id=20, producername='Fixture P B' WHERE id=2;
            UPDATE news SET title='News B', content='https://example.test/news-b' WHERE id=2;
            UPDATE logs SET target='News B' WHERE id=2;
            UPDATE cards SET status='approved' WHERE id=2;
            UPDATE events SET title='Event B', image_url='/event-b.png' WHERE id=2;
            UPDATE card_emojis SET id=20, count=3 WHERE id=2;
            UPDATE sqlite_sequence SET seq=CASE name
                WHEN 'users' THEN 201 WHEN 'news' THEN 202 WHEN 'logs' THEN 203
                WHEN 'cards' THEN 204 WHEN 'events' THEN 205
                WHEN 'card_emojis' THEN 7000 END
            WHERE name IN ('users','news','logs','cards','events','card_emojis');
        `);
        const coreB = await coreSql(coreSource, 'wrangler-core-b');
        const coreBWrongRun = await coreSql(coreSource, 'wrangler-core-a');
        await exec(coreSource, `
            DELETE FROM card_emojis;
            DELETE FROM cards;
            DELETE FROM users;
            DELETE FROM news;
            DELETE FROM logs;
            DELETE FROM events;
        `);
        const emptySourceSha256 = crypto.createHash('sha256')
            .update(fs.readFileSync(coreSourcePath)).digest('hex');
        await assert.rejects(
            coreSql(coreSource, 'wrangler-core-empty'),
            /confirm-empty-core-source-sha256/
        );
        const coreEmpty = await coreSql(coreSource, 'wrangler-core-empty', {
            sourceSha256: emptySourceSha256,
            confirmEmptyCoreSourceSha256: emptySourceSha256
        });
        const story = await storySql(storySource, 'wrangler-fixture-run');
        assert.deepEqual(coreA.rejects, []);
        assert.deepEqual(coreB.rejects, []);
        assert.deepEqual(coreEmpty.rejects, []);
        assert.deepEqual(story.rejects, []);
        const coreAFile = path.join(root, 'core-a.sql');
        const coreBFile = path.join(root, 'core-b.sql');
        const coreBWrongRunFile = path.join(root, 'core-b-wrong-run.sql');
        const coreEmptyFile = path.join(root, 'core-empty.sql');
        const storyFile = path.join(root, 'story-import.sql');
        const coreADocument = `${coreA.statements.join('\n')}\n`;
        const coreBDocument = `${coreB.statements.join('\n')}\n`;
        const coreBWrongRunDocument = `${coreBWrongRun.statements.join('\n')}\n`;
        const coreEmptyDocument = `${coreEmpty.statements.join('\n')}\n`;
        const storyDocument = `${story.statements.join('\n')}\n`;
        assertD1ImportSql(coreADocument);
        assertD1ImportSql(coreBDocument);
        assertD1ImportSql(coreBWrongRunDocument);
        assertD1ImportSql(coreEmptyDocument);
        assert.match(coreBDocument, /_ims_core_snapshot_guard/);
        assert.match(coreBDocument, /_ims_core_snapshot_stage_card_emojis/);
        assertD1ImportSql(storyDocument);
        fs.writeFileSync(coreAFile, coreADocument, { mode: 0o600 });
        fs.writeFileSync(coreBFile, coreBDocument, { mode: 0o600 });
        fs.writeFileSync(coreBWrongRunFile, coreBWrongRunDocument, { mode: 0o600 });
        fs.writeFileSync(coreEmptyFile, coreEmptyDocument, { mode: 0o600 });
        fs.writeFileSync(storyFile, storyDocument, { mode: 0o600 });

        for (let pass = 0; pass < 2; pass += 1) {
            runWrangler(root, [
                'd1', 'migrations', 'apply', 'CORE_DB', '--local', '--persist-to', persist
            ]);
            runWrangler(root, [
                'd1', 'migrations', 'apply', 'STORY_DB', '--local', '--persist-to', persist
            ]);
        }
        runWrangler(root, [
            'd1', 'execute', 'CORE_DB', '--local', '--persist-to', persist,
            '--file', coreAFile, '--yes'
        ]);
        const reusedRun = runWranglerResult(root, [
            'd1', 'execute', 'CORE_DB', '--local', '--persist-to', persist,
            '--file', coreBWrongRunFile, '--yes'
        ]);
        assert.notEqual(reusedRun.status, 0);
        assert.match(`${reusedRun.stdout}\n${reusedRun.stderr}`, /(?:check|constraint)/i);
        assert.deepEqual(query(root, persist, 'CORE_DB', `
            SELECT
                (SELECT COUNT(*) FROM users) AS users,
                (SELECT COUNT(*) FROM news) AS news,
                (SELECT COUNT(*) FROM logs) AS logs,
                (SELECT COUNT(*) FROM cards) AS cards,
                (SELECT COUNT(*) FROM events) AS events,
                (SELECT COUNT(*) FROM card_emojis) AS reactions,
                (SELECT producername FROM users WHERE id=2) AS producername,
                (SELECT status FROM cards WHERE id=2) AS status
        `), [{
            users: 2, news: 2, logs: 2, cards: 2, events: 2, reactions: 2,
            producername: 'Fixture P', status: 'pending'
        }]);
        assert.deepEqual(query(root, persist, 'CORE_DB', `
            SELECT name FROM sqlite_master
            WHERE name LIKE '_ims_core_snapshot_stage_%'
        `), []);
        assert.deepEqual(query(root, persist, 'CORE_DB', `
            SELECT name,seq FROM sqlite_sequence
            WHERE name IN ('users','news','logs','cards','events','card_emojis')
            ORDER BY name
        `), [
            { name: 'card_emojis', seq: 6546 }, { name: 'cards', seq: 104 },
            { name: 'events', seq: 105 }, { name: 'logs', seq: 103 },
            { name: 'news', seq: 102 }, { name: 'users', seq: 101 }
        ]);
        for (let pass = 0; pass < 2; pass += 1) {
            runWrangler(root, [
                'd1', 'execute', 'CORE_DB', '--local', '--persist-to', persist,
                '--file', coreBFile, '--yes'
            ]);
            runWrangler(root, [
                'd1', 'execute', 'STORY_DB', '--local', '--persist-to', persist,
                '--file', storyFile, '--yes'
            ]);
        }

        assert.deepEqual(query(root, persist, 'CORE_DB', `
            SELECT
                (SELECT COUNT(*) FROM users) AS users,
                (SELECT COUNT(*) FROM news) AS news,
                (SELECT COUNT(*) FROM logs) AS logs,
                (SELECT COUNT(*) FROM cards) AS cards,
                (SELECT COUNT(*) FROM events) AS events,
                (SELECT COUNT(*) FROM card_emojis) AS reactions
        `), [{ users: 1, news: 1, logs: 1, cards: 1, events: 1, reactions: 1 }]);
        assert.deepEqual(query(root, persist, 'CORE_DB', `
            SELECT u.id, u.producername, n.title, l.target, c.status, e.title AS event_title,
                   ce.count AS reaction_count
            FROM users u, news n, logs l, cards c, events e, card_emojis ce
        `), [{
            id: 20,
            producername: 'Fixture P B',
            title: 'News B',
            target: 'News B',
            status: 'approved',
            event_title: 'Event B',
            reaction_count: 3
        }]);
        assert.deepEqual(query(root, persist, 'CORE_DB', `
            SELECT name,seq FROM sqlite_sequence
            WHERE name IN ('users','news','logs','cards','events','card_emojis')
            ORDER BY name
        `), [
            { name: 'card_emojis', seq: 7000 }, { name: 'cards', seq: 204 },
            { name: 'events', seq: 205 }, { name: 'logs', seq: 203 },
            { name: 'news', seq: 202 }, { name: 'users', seq: 201 }
        ]);
        assert.deepEqual(query(root, persist, 'STORY_DB', `
            SELECT
                (SELECT COUNT(*) FROM story_legacy_rows) AS landing,
                (SELECT COUNT(*) FROM story_cards) AS cards,
                (SELECT COUNT(*) FROM story_links) AS links
        `), [{ landing: 2, cards: 1, links: 2 }]);
        assert.deepEqual(query(root, persist, 'STORY_DB', `
            SELECT c.card_name, c.subtitle, c.image_file,
                   GROUP_CONCAT(l.up_name, '|') AS uploaders,
                   GROUP_CONCAT(l.video_title, '|') AS titles,
                   GROUP_CONCAT(l.url, '|') AS urls
            FROM story_cards c JOIN story_links l ON l.card_id=c.id
            GROUP BY c.id
        `), [{
            card_name: 'Card A',
            subtitle: '',
            image_file: 'cards/a.webp',
            uploaders: 'UP1|UP2',
            titles: 'Part 1|Part 2',
            urls: 'https://example.test/1|https://example.test/2'
        }]);
        assert.deepEqual(query(root, persist, 'CORE_DB', 'PRAGMA foreign_key_check'), []);
        assert.deepEqual(query(root, persist, 'STORY_DB', 'PRAGMA foreign_key_check'), []);
        assertCoreGate(root, persist, 'wrangler-core-b');
        assertStoryGate(root, persist, 'wrangler-fixture-run');

        for (let pass = 0; pass < 2; pass += 1) {
            runWrangler(root, [
                'd1', 'execute', 'CORE_DB', '--local', '--persist-to', persist,
                '--file', coreEmptyFile, '--yes'
            ]);
        }
        assert.deepEqual(query(root, persist, 'CORE_DB', `
            SELECT
                (SELECT COUNT(*) FROM users) AS users,
                (SELECT COUNT(*) FROM news) AS news,
                (SELECT COUNT(*) FROM logs) AS logs,
                (SELECT COUNT(*) FROM cards) AS cards,
                (SELECT COUNT(*) FROM events) AS events,
                (SELECT COUNT(*) FROM card_emojis) AS reactions,
                (SELECT COUNT(*) FROM _ims_core_snapshot_guard) AS active_guards
        `), [{ users: 0, news: 0, logs: 0, cards: 0, events: 0, reactions: 0, active_guards: 0 }]);
        assert.deepEqual(query(root, persist, 'CORE_DB', `
            SELECT name,seq FROM sqlite_sequence
            WHERE name IN ('users','news','logs','cards','events','card_emojis')
            ORDER BY name
        `), [
            { name: 'card_emojis', seq: 7000 }, { name: 'cards', seq: 204 },
            { name: 'events', seq: 205 }, { name: 'logs', seq: 203 },
            { name: 'news', seq: 202 }, { name: 'users', seq: 201 }
        ]);
        assertCoreGate(root, persist, 'wrangler-core-empty');

        const assertionIndexes = coreB.statements
            .map((statement, index) => ({ statement, index }))
            .filter(({ statement }) =>
                statement.startsWith('INSERT INTO _ims_core_snapshot_assertion (ok)') &&
                statement.includes('SELECT 0 WHERE')
            )
            .map(({ index }) => index);
        const assertionIndex = assertionIndexes.at(-1);
        assert.ok(assertionIndex > 0);
        const interruptedPrefix = path.join(root, 'core-interrupted-prefix.sql');
        const interruptedSuffix = path.join(root, 'core-interrupted-suffix.sql');
        fs.writeFileSync(
            interruptedPrefix,
            `${coreB.statements.slice(0, assertionIndex).join('\n')}\n`,
            { mode: 0o600 }
        );
        fs.writeFileSync(
            interruptedSuffix,
            `${coreB.statements.slice(assertionIndex).join('\n')}\n`,
            { mode: 0o600 }
        );
        runWrangler(root, [
            'd1', 'execute', 'CORE_DB', '--local', '--persist-to', persist,
            '--file', interruptedPrefix, '--yes'
        ]);
        runWrangler(root, [
            'd1', 'execute', 'CORE_DB', '--local', '--persist-to', persist,
            '--command', "INSERT INTO users VALUES(99, 'mixed-runtime-write', 'hash', 'op', 'Runtime')"
        ]);
        const mixedSnapshot = runWranglerResult(root, [
            'd1', 'execute', 'CORE_DB', '--local', '--persist-to', persist,
            '--file', interruptedSuffix, '--yes'
        ]);
        assert.notEqual(mixedSnapshot.status, 0);
        assert.match(`${mixedSnapshot.stdout}\n${mixedSnapshot.stderr}`, /(?:check|constraint)/i);
        const resumedImport = runWranglerResult(root, [
            'd1', 'execute', 'CORE_DB', '--local', '--persist-to', persist,
            '--file', coreBFile, '--yes'
        ]);
        assert.notEqual(resumedImport.status, 0);
        assert.match(`${resumedImport.stdout}\n${resumedImport.stderr}`, /(?:unique|constraint)/i);
        assert.deepEqual(query(root, persist, 'CORE_DB', `
            SELECT run_id, phase FROM _ims_core_snapshot_guard
        `), [{ run_id: 'wrangler-core-b', phase: 'applying' }]);
        runWrangler(root, [
            'd1', 'execute', 'CORE_DB', '--local', '--persist-to', persist,
            '--command', "DELETE FROM _ims_core_snapshot_guard WHERE run_id='wrangler-core-b'"
        ]);
    } finally {
        await Promise.all([
            close(coreSource).catch(() => undefined),
            close(storySource).catch(() => undefined)
        ]);
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('[D1-03] a tail-truncated Core import cannot pass the final gate', {
    timeout: 120_000
}, async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ims-wrangler-d1-tail-cut-'));
    const persist = path.join(root, 'persist');
    const source = database(path.join(root, 'core-source.sqlite'));
    try {
        await exec(source, `${coreSourceSchema()}
            INSERT INTO users VALUES(1, 'fixture', 'hash', 'op', 'Fixture P');
        `);
        const generated = await coreSql(source, 'wrangler-tail-cut');
        assert.deepEqual(generated.rejects, []);

        const firstDropIndex = generated.statements.findIndex((statement) =>
            statement.startsWith('DROP TABLE _ims_core_snapshot_stage_')
        );
        const completedIndex = generated.statements.findIndex((statement) =>
            statement.startsWith('UPDATE _ims_core_snapshot_runs SET status=\'completed\'')
        );
        const guardReleaseIndex = generated.statements.findIndex((statement) =>
            statement.startsWith('DELETE FROM _ims_core_snapshot_guard')
        );
        assert.ok(firstDropIndex > 0);
        assert.ok(completedIndex > firstDropIndex);
        assert.ok(guardReleaseIndex > completedIndex);
        assert.ok(generated.statements.slice(firstDropIndex, completedIndex).every((statement) =>
            statement.startsWith('DROP TABLE _ims_core_snapshot_')
        ));

        const truncatedFile = path.join(root, 'core-tail-truncated.sql');
        fs.writeFileSync(
            truncatedFile,
            `${generated.statements.slice(0, firstDropIndex).join('\n')}\n`,
            { mode: 0o600 }
        );
        runWrangler(root, [
            'd1', 'migrations', 'apply', 'CORE_DB', '--local', '--persist-to', persist
        ]);
        runWrangler(root, [
            'd1', 'execute', 'CORE_DB', '--local', '--persist-to', persist,
            '--file', truncatedFile, '--yes'
        ]);

        const failedGate = coreGate(root, persist, 'wrangler-tail-cut');
        assert.deepEqual(failedGate, [{
            active_guards: 1,
            run_status: 'active',
            transient_tables: 8
        }]);
        assert.notDeepEqual(failedGate, [{
            active_guards: 0,
            run_status: 'completed',
            transient_tables: 0
        }]);
    } finally {
        await close(source).catch(() => undefined);
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('[D1-03] Story snapshot fencing, empty confirmation and tail gate work through Wrangler', {
    timeout: 120_000
}, async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ims-wrangler-story-snapshot-'));
    const persist = path.join(root, 'persist');
    const source = database(path.join(root, 'story-source.sqlite'));
    try {
        await exec(source, `${storySourceSchema()}
            INSERT INTO agencies VALUES(1, 'cg', 'Agency', '#2681c8');
            INSERT INTO idols VALUES(10, 1, 'Idol', 'idol', '#ffffff');
            INSERT INTO theme_colors VALUES('Card', '#123456');
            INSERT INTO cg_stories VALUES
                (1, 10, 'Card', 'Card A', 'UP1', 'Part 1', 'https://example.test/1', '', 'cards/a.webp'),
                (2, 10, 'Card', 'Card A', 'UP2', 'Part 2', 'https://example.test/2', '', 'cards/a.webp');
        `);
        const storyA = await storySql(source, 'wrangler-story-a');
        await exec(source, `
            UPDATE cg_stories
            SET card_name='Card B', subtitle='B', image_file='cards/b.webp'
            WHERE id=2;
        `);
        const storyB = await storySql(source, 'wrangler-story-b');
        const storyBWrongRun = await storySql(source, 'wrangler-story-a');
        const storyTail = await storySql(source, 'wrangler-story-tail');
        await exec(source, 'DELETE FROM cg_stories;');
        await assert.rejects(
            storySql(source, 'wrangler-story-empty'),
            /confirm-empty-story-source-sha256/
        );
        const emptyConfirmation = 'f'.repeat(64);
        const storyEmpty = await storySql(source, 'wrangler-story-empty', {
            sourceSha256: emptyConfirmation,
            confirmEmptyStorySourceSha256: emptyConfirmation
        });
        for (const generated of [storyA, storyB, storyBWrongRun, storyTail, storyEmpty]) {
            assert.deepEqual(generated.rejects, []);
        }

        const files = new Map();
        for (const [name, generated] of [
            ['a', storyA],
            ['b', storyB],
            ['wrong-run', storyBWrongRun],
            ['empty', storyEmpty]
        ]) {
            const file = path.join(root, `story-${name}.sql`);
            const document = `${generated.statements.join('\n')}\n`;
            assertD1ImportSql(document);
            fs.writeFileSync(file, document, { mode: 0o600 });
            files.set(name, file);
        }

        runWrangler(root, [
            'd1', 'migrations', 'apply', 'STORY_DB', '--local', '--persist-to', persist
        ]);
        for (let pass = 0; pass < 2; pass += 1) {
            runWrangler(root, [
                'd1', 'execute', 'STORY_DB', '--local', '--persist-to', persist,
                '--file', files.get('a'), '--yes'
            ]);
        }
        assertStoryGate(root, persist, 'wrangler-story-a');

        const reusedRun = runWranglerResult(root, [
            'd1', 'execute', 'STORY_DB', '--local', '--persist-to', persist,
            '--file', files.get('wrong-run'), '--yes'
        ]);
        assert.notEqual(reusedRun.status, 0);
        assert.match(`${reusedRun.stdout}\n${reusedRun.stderr}`, /(?:check|constraint)/i);
        assert.deepEqual(query(root, persist, 'STORY_DB', `
            SELECT card_name, subtitle, image_file FROM story_cards ORDER BY id
        `), [{ card_name: 'Card A', subtitle: '', image_file: 'cards/a.webp' }]);
        assert.deepEqual(query(root, persist, 'STORY_DB', `
            SELECT name FROM sqlite_master
            WHERE type='table' AND name GLOB '_ims_story_snapshot_stage_*'
        `), []);
        assertStoryGate(root, persist, 'wrangler-story-a');

        runWrangler(root, [
            'd1', 'execute', 'STORY_DB', '--local', '--persist-to', persist,
            '--command', `
                INSERT INTO agencies VALUES(99, 'runtime', 'Runtime agency', '#999999');
                INSERT INTO idols VALUES(99, 99, 'Runtime idol', 'runtime', '#999999');
                INSERT INTO theme_colors VALUES('Runtime', '#999999');
                INSERT INTO story_cards
                    (idol_id, category, card_name, source_table, source_id)
                VALUES(99, 'Runtime', 'Runtime card', 'cg_stories', 999);
                INSERT INTO story_links
                    (card_id, source_table, source_id, source_link_index)
                SELECT id, 'cg_stories', 999, 0 FROM story_cards
                WHERE source_table='cg_stories' AND source_id=999;
            `
        ]);

        for (let pass = 0; pass < 2; pass += 1) {
            runWrangler(root, [
                'd1', 'execute', 'STORY_DB', '--local', '--persist-to', persist,
                '--file', files.get('b'), '--yes'
            ]);
        }
        assertStoryGate(root, persist, 'wrangler-story-b');
        assert.deepEqual(query(root, persist, 'STORY_DB', `
            SELECT source_id, card_name, subtitle, image_file, last_seen_run_id
            FROM story_cards ORDER BY source_id
        `), [
            {
                source_id: 1, card_name: 'Card A', subtitle: '',
                image_file: 'cards/a.webp', last_seen_run_id: 'migration:wrangler-story-b'
            },
            {
                source_id: 2, card_name: 'Card B', subtitle: 'B',
                image_file: 'cards/b.webp', last_seen_run_id: 'migration:wrangler-story-b'
            },
            {
                source_id: 999, card_name: 'Runtime card', subtitle: null,
                image_file: null, last_seen_run_id: 'runtime'
            }
        ]);

        for (let pass = 0; pass < 2; pass += 1) {
            runWrangler(root, [
                'd1', 'execute', 'STORY_DB', '--local', '--persist-to', persist,
                '--file', files.get('empty'), '--yes'
            ]);
        }
        assertStoryGate(root, persist, 'wrangler-story-empty');
        assert.deepEqual(query(root, persist, 'STORY_DB', `
            SELECT
                (SELECT COUNT(*) FROM agencies) AS agencies,
                (SELECT COUNT(*) FROM idols) AS idols,
                (SELECT COUNT(*) FROM theme_colors) AS themes,
                (SELECT COUNT(*) FROM story_legacy_rows) AS landing,
                (SELECT COUNT(*) FROM story_cards) AS cards,
                (SELECT COUNT(*) FROM story_links) AS links
        `), [{ agencies: 2, idols: 2, themes: 2, landing: 0, cards: 1, links: 1 }]);

        const emptyTargetExport = {
            agencies: query(root, persist, 'STORY_DB',
                'SELECT id,code,name_cn,color FROM agencies ORDER BY id'),
            idols: query(root, persist, 'STORY_DB',
                'SELECT id,agency_id,name_cn,folder_name,color FROM idols ORDER BY id'),
            theme_colors: query(root, persist, 'STORY_DB',
                'SELECT name,color FROM theme_colors ORDER BY name'),
            story_legacy_rows: query(root, persist, 'STORY_DB', `
                SELECT legacy_table,legacy_id,row_json,normalized_hash,last_seen_run_id
                FROM story_legacy_rows ORDER BY legacy_table,legacy_id
            `),
            story_cards: query(root, persist, 'STORY_DB', `
                SELECT id,idol_id,category,card_name,subtitle,image_file,
                       source_table,source_id,last_seen_run_id
                FROM story_cards ORDER BY id
            `),
            story_links: query(root, persist, 'STORY_DB', `
                SELECT id,card_id,up_name,video_title,url,source_table,source_id,
                       source_link_index,last_seen_run_id
                FROM story_links ORDER BY id
            `)
        };
        const reconciliationConfig = JSON.parse(fs.readFileSync(
            path.join(PROJECT_ROOT, 'migrations/fixtures/reconciliation-config.json'),
            'utf8'
        ));
        const emptyRoundTrip = reconcile(storyEmpty.legacy, emptyTargetExport, reconciliationConfig);
        assert.deepEqual(emptyRoundTrip.differences, []);
        assert.deepEqual(emptyRoundTrip.rejects, []);
        assert.deepEqual(emptyRoundTrip.invariants.storyAggregates, { legacy: {}, target: {} });

        const firstDropIndex = storyTail.statements.findIndex((statement) =>
            statement.startsWith('DROP TABLE _ims_story_snapshot_stage_')
        );
        const completedIndex = storyTail.statements.findIndex((statement) =>
            statement.startsWith("UPDATE _ims_story_snapshot_runs SET status='completed'")
        );
        const guardReleaseIndex = storyTail.statements.findIndex((statement) =>
            statement.startsWith('DELETE FROM _ims_story_snapshot_guard')
        );
        assert.ok(firstDropIndex > 0);
        assert.ok(completedIndex > firstDropIndex);
        assert.ok(guardReleaseIndex > completedIndex);
        assert.ok(storyTail.statements.slice(firstDropIndex, completedIndex).every((statement) =>
            statement.startsWith('DROP TABLE _ims_story_snapshot_') ||
            statement.startsWith('INSERT INTO story_import_runs')
        ));
        const tailFile = path.join(root, 'story-tail-truncated.sql');
        fs.writeFileSync(
            tailFile,
            `${storyTail.statements.slice(0, firstDropIndex).join('\n')}\n`,
            { mode: 0o600 }
        );
        runWrangler(root, [
            'd1', 'execute', 'STORY_DB', '--local', '--persist-to', persist,
            '--file', tailFile, '--yes'
        ]);
        assert.deepEqual(storyGate(root, persist, 'wrangler-story-tail'), [{
            active_guards: 1,
            run_status: 'active',
            audit_matches: 0,
            transient_tables: 7
        }]);
        const blockedImport = runWranglerResult(root, [
            'd1', 'execute', 'STORY_DB', '--local', '--persist-to', persist,
            '--file', files.get('empty'), '--yes'
        ]);
        assert.notEqual(blockedImport.status, 0);
        assert.match(`${blockedImport.stdout}\n${blockedImport.stderr}`, /(?:unique|constraint)/i);
    } finally {
        await close(source).catch(() => undefined);
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('[D1-03] Core migrations preserve pre-fencing rows across the 0004-0006 upgrade', {
    timeout: 120_000
}, () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ims-wrangler-d1-upgrade-'));
    const persist = path.join(root, 'persist');
    const migrationSource = path.join(PROJECT_ROOT, 'migrations', 'core');
    const migrationFiles = fs.readdirSync(migrationSource)
        .filter((file) => /^000[1-6]_.*\.sql$/.test(file))
        .sort();
    try {
        assert.equal(migrationFiles.length, 6);
        for (const file of migrationFiles.slice(0, 3)) {
            runWrangler(root, [
                'd1', 'execute', 'CORE_DB', '--local', '--persist-to', persist,
                '--file', path.join(migrationSource, file), '--yes'
            ]);
        }
        assert.deepEqual(query(root, persist, 'CORE_DB', `
            SELECT
                (SELECT COUNT(*) FROM pragma_table_info('idempotency_keys')
                 WHERE name='generation') AS generation_columns,
                (SELECT COUNT(*) FROM sqlite_master
                 WHERE type='table' AND name='rate_limit_maintenance') AS maintenance_tables
        `), [{ generation_columns: 0, maintenance_tables: 0 }]);

        runWrangler(root, [
            'd1', 'execute', 'CORE_DB',
            '--local', '--persist-to', persist, '--command', `
                INSERT INTO idempotency_keys
                    (scope,idempotency_key,request_hash,response_status,response_json,state,created_at,updated_at)
                VALUES
                    ('legacy-scope','legacy-key','request-hash',202,'{"ok":true}','completed',
                     '2026-07-20T01:00:00Z','2026-07-20T01:01:00Z');
                INSERT INTO compensation_jobs
                    (id,kind,payload_json,state,attempts,last_error,created_at,updated_at)
                VALUES
                    ('job-pending','delete-object','{"key":"pending"}','pending',0,NULL,
                     '2026-07-20T02:00:00Z','2026-07-20T02:01:00Z'),
                    ('job-failed','delete-object','{"key":"failed"}','failed',3,'legacy failure',
                     '2026-07-20T03:00:00Z','2026-07-20T03:01:00Z');
                INSERT INTO object_index
                    (logical_key,object_id,state,byte_size,content_type,sha256,etag,created_at,updated_at)
                VALUES
                    ('uploads/legacy.webp','object-legacy','ready',321,'image/webp','object-sha','etag-old',
                     '2026-07-20T04:00:00Z','2026-07-20T04:01:00Z');
                INSERT INTO upload_operations
                    (id,scope,idempotency_key,state,logical_key,object_id,sha256,created_at,updated_at,
                     target_state,byte_size,content_type,etag,previous_object_id)
                VALUES
                    ('upload-legacy','cards','upload-key','pending','uploads/legacy.webp','object-legacy',
                     'object-sha','2026-07-20T05:00:00Z','2026-07-20T05:01:00Z','ready',321,
                     'image/webp','etag-old','object-previous');
                INSERT INTO chronicle_metadata (activity_id,document_json,updated_at)
                VALUES ('activity-legacy','{"title":"Legacy"}','2026-07-20T06:00:00Z');
                INSERT INTO rate_limit_events
                    (bucket,client_key,window_start,operation,event_identity,expires_at)
                VALUES ('upload','client-legacy',100,'create','event-legacy',200);
            `
        ]);

        for (const file of migrationFiles.slice(3, 6)) {
            runWrangler(root, [
                'd1', 'execute', 'CORE_DB', '--local', '--persist-to', persist,
                '--file', path.join(migrationSource, file), '--yes'
            ]);
        }

        assert.deepEqual(query(root, persist, 'CORE_DB', `
            SELECT
                (SELECT COUNT(*) FROM idempotency_keys
                 WHERE scope='legacy-scope' AND idempotency_key='legacy-key'
                   AND request_hash='request-hash' AND response_status=202
                   AND response_json='{"ok":true}' AND state='completed'
                   AND generation=1) AS idempotency_preserved,
                (SELECT COUNT(*) FROM compensation_jobs
                 WHERE lease_expires_at IS NULL AND quarantined_at IS NULL
                   AND ((id='job-pending' AND kind='delete-object'
                         AND payload_json='{"key":"pending"}' AND state='pending'
                         AND attempts=0 AND last_error IS NULL)
                        OR
                        (id='job-failed' AND kind='delete-object'
                         AND payload_json='{"key":"failed"}' AND state='failed'
                         AND attempts=3 AND last_error='legacy failure'))) AS jobs_preserved,
                (SELECT next_attempt_at=created_at FROM compensation_jobs
                 WHERE id='job-pending') AS pending_schedule_preserved,
                (SELECT next_attempt_at=created_at FROM compensation_jobs
                 WHERE id='job-failed') AS failed_schedule_preserved,
                (SELECT COUNT(*) FROM object_index
                 WHERE logical_key='uploads/legacy.webp' AND object_id='object-legacy'
                   AND state='ready' AND byte_size=321 AND content_type='image/webp'
                   AND sha256='object-sha' AND etag='etag-old' AND incarnation=1
                   AND owner_token IS NULL AND mutation_token IS NULL
                   AND recovery_source_key IS NULL) AS object_preserved,
                (SELECT COUNT(*) FROM upload_operations
                 WHERE id='upload-legacy' AND scope='cards' AND idempotency_key='upload-key'
                   AND state='pending' AND logical_key='uploads/legacy.webp'
                   AND object_id='object-legacy' AND sha256='object-sha'
                   AND target_state='ready' AND byte_size=321
                   AND content_type='image/webp' AND etag='etag-old'
                   AND previous_object_id='object-previous' AND incarnation=1
                   AND owner_token IS NULL AND mutation_token IS NULL
                   AND recovery_source_key IS NULL) AS upload_preserved,
                (SELECT COUNT(*) FROM chronicle_metadata
                 WHERE activity_id='activity-legacy' AND document_json='{"title":"Legacy"}'
                   AND commit_token IS NULL) AS chronicle_preserved,
                (SELECT COUNT(*) FROM rate_limit_events
                 WHERE bucket='upload' AND client_key='client-legacy' AND window_start=100
                   AND operation='create' AND event_identity='event-legacy'
                   AND expires_at=200) AS rate_event_preserved,
                (SELECT COUNT(*) FROM rate_limit_maintenance
                 WHERE id=1 AND next_sweep_at=0) AS maintenance_singleton
        `), [{
            idempotency_preserved: 1,
            jobs_preserved: 2,
            pending_schedule_preserved: 1,
            failed_schedule_preserved: 1,
            object_preserved: 1,
            upload_preserved: 1,
            chronicle_preserved: 1,
            rate_event_preserved: 1,
            maintenance_singleton: 1
        }]);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});
