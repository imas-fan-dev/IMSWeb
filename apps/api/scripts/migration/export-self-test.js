'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const sqlite3 = require('sqlite3').verbose();
const { coreSql, storySql } = require('./sqlite-to-d1');

const projectRoot = path.resolve(__dirname, '../..');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ims-d1-export-'));

function database(name) {
    return new sqlite3.Database(path.join(root, name));
}
function exec(db, sql) {
    return new Promise((resolve, reject) => db.exec(sql, error => error ? reject(error) : resolve()));
}
function get(db, sql) {
    return new Promise((resolve, reject) => db.get(sql, (error, row) => error ? reject(error) : resolve(row)));
}
function close(db) {
    return new Promise((resolve, reject) => db.close(error => error ? reject(error) : resolve()));
}
function migrations(kind) {
    const directory = path.join(projectRoot, 'migrations', kind);
    return fs.readdirSync(directory).filter(file => file.endsWith('.sql')).sort()
        .map(file => fs.readFileSync(path.join(directory, file), 'utf8')).join('\n');
}

(async () => {
    const sourceCore = database('source-core.db');
    const targetCore = database('target-core.db');
    const sourceStory = database('source-story.db');
    const targetStory = database('target-story.db');
    try {
        await exec(sourceCore, `
            CREATE TABLE users(id INTEGER PRIMARY KEY, username TEXT, password TEXT, dept TEXT, producername TEXT);
            CREATE TABLE news(id INTEGER PRIMARY KEY, title TEXT, image TEXT, thumbnail TEXT, content TEXT, date TEXT, author TEXT);
            CREATE TABLE logs(id INTEGER PRIMARY KEY, username TEXT, producername TEXT, action TEXT, target TEXT, ip TEXT, time TEXT);
            CREATE TABLE cards(id INTEGER PRIMARY KEY, image1_url TEXT, image2_url TEXT, hash1 TEXT, hash2 TEXT, ip TEXT, status TEXT, created_at TEXT);
            CREATE TABLE events(id INTEGER PRIMARY KEY, title TEXT, name TEXT, contact TEXT, image_url TEXT, created_at TEXT);
            CREATE TABLE card_emojis(id INTEGER PRIMARY KEY, card_id INTEGER, emoji TEXT, count INTEGER);
            INSERT INTO users VALUES(1, 'fixture', 'hash', 'op', 'Fixture');
        `);
        const core = await coreSql(sourceCore);
        await exec(targetCore, migrations('core'));
        await exec(targetCore, core.statements.join('\n'));
        await exec(targetCore, core.statements.join('\n'));
        if ((await get(targetCore, 'SELECT COUNT(*) AS count FROM users')).count !== 1) {
            throw new Error('Core export is not idempotent');
        }

        const storyTables = ['765_stories', '876_stories', 'cg_stories', 'ml_stories', 'sidem_stories', 'sc_stories', 'gk_stories'];
        await exec(sourceStory, `
            CREATE TABLE agencies(id INTEGER PRIMARY KEY, code TEXT, name_cn TEXT, color TEXT);
            CREATE TABLE idols(id INTEGER PRIMARY KEY, agency_id INTEGER, name_cn TEXT, folder_name TEXT, color TEXT);
            CREATE TABLE theme_colors(name TEXT PRIMARY KEY, color TEXT);
            ${storyTables.map(table => `CREATE TABLE "${table}"(id INTEGER PRIMARY KEY, idol_id INTEGER, category TEXT, card_name TEXT, up_name TEXT, video_title TEXT, url TEXT, subtitle TEXT, image_file TEXT);`).join('\n')}
            INSERT INTO agencies VALUES(1, 'cg', '灰姑娘女孩', '#2681c8');
            INSERT INTO idols VALUES(1, 1, '测试偶像', 'fixture', '#ffffff');
            INSERT INTO cg_stories VALUES(1, 1, '卡剧情', '【卡】', 'UP', '标题', 'https://example.test', '', 'card/image.webp');
            INSERT INTO cg_stories VALUES(2, 1, '卡剧情', '【卡】', 'UP2', '标题2', 'https://example.test/2', '', 'card/image.webp');
        `);
        const story = await storySql(sourceStory, 'fixture-run');
        await exec(targetStory, migrations('story'));
        await exec(targetStory, story.statements.join('\n'));
        await exec(targetStory, story.statements.join('\n'));
        for (const [table, expected] of Object.entries({
            story_legacy_rows: 2,
            story_cards: 1,
            story_links: 2
        })) {
            if ((await get(targetStory, `SELECT COUNT(*) AS count FROM ${table}`)).count !== expected) {
                throw new Error(`Story export grouping/idempotency failed: ${table}`);
            }
        }
        process.stdout.write('SQLite-to-D1 export self-test passed: core and Story imports are idempotent\n');
    } finally {
        await Promise.all([sourceCore, targetCore, sourceStory, targetStory].map(close));
    }
})().finally(() => fs.rmSync(root, { recursive: true, force: true })).catch(error => {
    console.error(error);
    process.exitCode = 1;
});
