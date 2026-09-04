'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
    cmsArticleTitleBackfillSummary,
    executeCmsArticleTitleBackfill,
    parseCmsArticleTitleBackfillArguments,
    prependTextToArticleBody,
    splitCmsArticleTitle,
    writeCmsArticleTitleBackfillReport
} = require('../../scripts/migration/cms-article-title-backfill.ts');
const {
    createPostgresTestHarness,
    postgresIntegrationEnabled
} = require('../integration/postgres-harness.ts');

const emptyBody = { type: 'doc', content: [] };

async function insertArticle(harness, values) {
    const result = await harness.connection.pool.query(
        `INSERT INTO articles
            (content_type, title, body_json, body_html, status, revision, updated_at)
         VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7)
         RETURNING id`,
        [
            values.contentType || 'event',
            values.title,
            JSON.stringify(values.bodyJson || emptyBody),
            values.bodyHtml || '',
            values.status || 'draft',
            values.revision || 0,
            values.updatedAt || '2000-01-01T00:00:00.000Z'
        ]
    );
    const id = Number(result.rows[0].id);
    if (values.event) {
        await harness.connection.pool.query(
            `INSERT INTO events (article_id, title, kind, publication_state)
             VALUES ($1, $2, 'event', 'ready')`,
            [id, values.eventTitle || values.title]
        );
    }
    return id;
}

async function readArticle(harness, id) {
    const result = await harness.connection.pool.query(
        `SELECT id, title, body_json, body_html, revision, updated_by, updated_at
         FROM articles WHERE id=$1`,
        [id]
    );
    return result.rows[0];
}

async function readEventTitle(harness, articleId) {
    const result = await harness.connection.pool.query(
        'SELECT title FROM events WHERE article_id=$1',
        [articleId]
    );
    return result.rows[0]?.title;
}

test('CMS article title split only accepts a non-empty leading bracket title', () => {
    assert.deepEqual(splitCmsArticleTitle('  【 标题 】  正文【保留】  '), {
        title: '标题',
        bodyText: '正文【保留】'
    });
    assert.deepEqual(splitCmsArticleTitle('【标题】'), {
        title: '标题',
        bodyText: ''
    });
    assert.deepEqual(splitCmsArticleTitle('【标题】第一段】第二段'), {
        title: '标题',
        bodyText: '第一段】第二段'
    });
    assert.deepEqual(splitCmsArticleTitle('【标题】  内  部  空白  '), {
        title: '标题',
        bodyText: '内  部  空白'
    });
    assert.equal(splitCmsArticleTitle('前缀【标题】正文'), null);
    assert.equal(splitCmsArticleTitle('【标题正文'), null);
    assert.equal(splitCmsArticleTitle('【   】正文'), null);
});

test('CMS article body prefix preserves internal line breaks and existing nodes', () => {
    const existingParagraph = {
        type: 'paragraph',
        content: [{ type: 'text', text: '原正文' }]
    };
    const result = prependTextToArticleBody(
        { type: 'doc', content: [existingParagraph] },
        '<p>原正文</p>',
        '第一行\r\n第二行\r\r第三行'
    );

    assert.equal(result.bodyChanged, true);
    assert.deepEqual(result.bodyJson, {
        type: 'doc',
        content: [
            {
                type: 'paragraph',
                content: [
                    { type: 'text', text: '第一行' },
                    { type: 'hardBreak' },
                    { type: 'text', text: '第二行' },
                    { type: 'hardBreak' },
                    { type: 'hardBreak' },
                    { type: 'text', text: '第三行' }
                ]
            },
            existingParagraph
        ]
    });
    assert.equal(result.bodyHtml, '<p>第一行<br />第二行<br /><br />第三行</p><p>原正文</p>');
});

test('CMS article body remains byte-for-byte unchanged when no text is moved', () => {
    const bodyJson = { type: 'doc', content: [] };
    const result = prependTextToArticleBody(bodyJson, '<p></p>', '');

    assert.equal(result.bodyChanged, false);
    assert.equal(result.bodyJson, bodyJson);
    assert.equal(result.bodyHtml, '<p></p>');
});

test('CMS article title backfill arguments are dry-run by default and validate input', () => {
    const dryRun = parseCmsArticleTitleBackfillArguments([]);
    assert.equal(dryRun.apply, false);
    assert.equal(dryRun.help, false);
    assert.match(dryRun.report, /cms-article-title-backfill-dry-run\.json$/);

    const apply = parseCmsArticleTitleBackfillArguments(['--apply']);
    assert.equal(apply.apply, true);
    assert.match(apply.report, /cms-article-title-backfill\.json$/);

    const explicitPath = path.resolve(
        __dirname,
        '../../../..',
        'data/migration/cms-article-title-test.json'
    );
    const explicit = parseCmsArticleTitleBackfillArguments([
        '--apply',
        '--report',
        'data/migration/cms-article-title-test.json'
    ]);
    assert.equal(explicit.report, explicitPath);
    assert.equal(
        parseCmsArticleTitleBackfillArguments([
            '--report',
            'data/migration/cms-article-title-test.json',
            '--apply'
        ]).report,
        explicitPath
    );
    assert.equal(parseCmsArticleTitleBackfillArguments(['--help']).help, true);
    assert.throws(
        () => parseCmsArticleTitleBackfillArguments(['--report']),
        /--report requires a path/
    );
    assert.throws(
        () => parseCmsArticleTitleBackfillArguments(['--unknown']),
        /Unknown argument/
    );
});

test('CMS article title backfill writes a restricted report and a content-free summary', async (t) => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'imsweb-cms-title-report-'));
    t.after(() => fs.rm(directory, { recursive: true, force: true }));
    const target = path.join(directory, 'nested', 'report.json');
    const report = {
        generatedAt: '2026-09-04T00:00:00.000Z',
        apply: false,
        mode: 'dry-run',
        status: 'completed',
        counts: {
            scanned: 1,
            unmatched: 0,
            candidates: 1,
            wouldUpdated: 1,
            updated: 0,
            conflicts: 0,
            errors: 0
        },
        conflicts: [],
        unmatchedIds: [],
        records: [{
            id: 1,
            eventLinked: false,
            prependedBody: 'private body',
            bodyChanged: true,
            before: {
                title: 'private old title',
                bodyJson: emptyBody,
                bodyHtml: '',
                revision: 0
            },
            after: {
                title: 'private new title',
                bodyJson: emptyBody,
                bodyHtml: '<p>private body</p>',
                revision: 1
            },
            status: 'would-update'
        }],
        errors: []
    };

    await writeCmsArticleTitleBackfillReport(target, report);
    const stat = await fs.stat(target);
    assert.equal(stat.mode & 0o777, 0o600);
    assert.deepEqual(JSON.parse(await fs.readFile(target, 'utf8')), report);

    const summary = cmsArticleTitleBackfillSummary(report, target);
    assert.doesNotMatch(summary, /private old title|private new title|private body/);
    assert.match(summary, /"candidates":1/);
    assert.match(summary, /"report":/);
});

test('PostgreSQL dry-run, apply, and repeat preserve the migration contract', {
    skip: !postgresIntegrationEnabled()
}, async (t) => {
    const harness = await createPostgresTestHarness();
    t.after(() => harness.close());

    const existingParagraph = {
        type: 'paragraph',
        content: [{ type: 'text', text: '原正文' }]
    };
    const matchedEventId = await insertArticle(harness, {
        title: '  【 新标题 】  第一行\r\n第二行  ',
        bodyJson: { type: 'doc', content: [existingParagraph] },
        bodyHtml: '<p>原正文</p>',
        revision: 4,
        status: 'published',
        event: true,
        eventTitle: '旧兼容标题'
    });
    const titleOnlyId = await insertArticle(harness, {
        contentType: 'chronicle',
        title: '【纪事标题】   ',
        status: 'archived'
    });
    const multipleBracketsId = await insertArticle(harness, {
        title: '【主标题】正文【仍是正文】',
        event: true
    });
    const middleBracketId = await insertArticle(harness, {
        title: '前缀【不迁移】正文',
        event: true
    });
    const missingCloseId = await insertArticle(harness, {
        title: '【不迁移正文'
    });
    const emptyTitleId = await insertArticle(harness, {
        title: '【   】不迁移正文'
    });

    const beforeDryRun = await readArticle(harness, matchedEventId);
    const dryRun = await executeCmsArticleTitleBackfill(harness.connection, false);
    assert.equal(dryRun.status, 'completed');
    assert.deepEqual(dryRun.counts, {
        scanned: 6,
        unmatched: 3,
        candidates: 3,
        wouldUpdated: 3,
        updated: 0,
        conflicts: 0,
        errors: 0
    });
    assert.deepEqual(
        dryRun.unmatchedIds,
        [middleBracketId, missingCloseId, emptyTitleId]
    );
    assert.equal(dryRun.records[0].after.title, '新标题');
    assert.equal(dryRun.records[0].prependedBody, '第一行\r\n第二行');
    assert.deepEqual(await readArticle(harness, matchedEventId), beforeDryRun);
    assert.equal(await readEventTitle(harness, matchedEventId), '旧兼容标题');

    const applied = await executeCmsArticleTitleBackfill(harness.connection, true);
    assert.equal(applied.status, 'completed');
    assert.equal(applied.counts.updated, 3);
    assert.equal(applied.records.every((record) => record.status === 'updated'), true);

    const migratedEvent = await readArticle(harness, matchedEventId);
    assert.equal(migratedEvent.title, '新标题');
    assert.equal(migratedEvent.revision, 5);
    assert.equal(migratedEvent.updated_by, null);
    assert.ok(new Date(migratedEvent.updated_at) > new Date(beforeDryRun.updated_at));
    assert.deepEqual(migratedEvent.body_json, {
        type: 'doc',
        content: [
            {
                type: 'paragraph',
                content: [
                    { type: 'text', text: '第一行' },
                    { type: 'hardBreak' },
                    { type: 'text', text: '第二行' }
                ]
            },
            existingParagraph
        ]
    });
    assert.equal(migratedEvent.body_html, '<p>第一行<br />第二行</p><p>原正文</p>');
    assert.equal(await readEventTitle(harness, matchedEventId), '新标题');

    const titleOnly = await readArticle(harness, titleOnlyId);
    assert.equal(titleOnly.title, '纪事标题');
    assert.deepEqual(titleOnly.body_json, emptyBody);
    assert.equal(titleOnly.body_html, '');
    assert.equal(titleOnly.revision, 1);

    const multipleBrackets = await readArticle(harness, multipleBracketsId);
    assert.equal(multipleBrackets.title, '主标题');
    assert.equal(multipleBrackets.body_html, '<p>正文【仍是正文】</p>');
    assert.equal(await readEventTitle(harness, multipleBracketsId), '主标题');

    assert.equal((await readArticle(harness, middleBracketId)).title, '前缀【不迁移】正文');
    assert.equal((await readArticle(harness, middleBracketId)).revision, 0);
    assert.equal(await readEventTitle(harness, middleBracketId), '前缀【不迁移】正文');
    assert.equal((await readArticle(harness, missingCloseId)).title, '【不迁移正文');
    assert.equal((await readArticle(harness, emptyTitleId)).title, '【   】不迁移正文');

    const repeated = await executeCmsArticleTitleBackfill(harness.connection, true);
    assert.equal(repeated.status, 'completed');
    assert.equal(repeated.counts.candidates, 0);
    assert.equal(repeated.counts.updated, 0);
    assert.equal((await readArticle(harness, matchedEventId)).revision, 5);
});

test('PostgreSQL apply rejects an invalid candidate before writing any article', {
    skip: !postgresIntegrationEnabled()
}, async (t) => {
    const harness = await createPostgresTestHarness();
    t.after(() => harness.close());
    const validId = await insertArticle(harness, {
        title: '【有效标题】有效正文',
        event: true
    });
    const invalidId = await insertArticle(harness, {
        title: '【无效正文】需要迁移',
        bodyJson: {
            type: 'doc',
            content: [{ type: 'unsupportedNode' }]
        },
        bodyHtml: '<p>历史正文</p>'
    });

    const report = await executeCmsArticleTitleBackfill(harness.connection, true);
    assert.equal(report.status, 'aborted');
    assert.equal(report.counts.candidates, 2);
    assert.equal(report.counts.updated, 0);
    assert.equal(report.counts.errors, 1);
    assert.deepEqual(report.errors.map((error) => error.id), [invalidId]);
    assert.equal(report.records[0].status, 'rolled-back');
    assert.equal((await readArticle(harness, validId)).title, '【有效标题】有效正文');
    assert.equal(await readEventTitle(harness, validId), '【有效标题】有效正文');
});

test('PostgreSQL apply reports an update conflict and rolls back earlier rows', {
    skip: !postgresIntegrationEnabled()
}, async (t) => {
    const harness = await createPostgresTestHarness();
    t.after(() => harness.close());
    const firstId = await insertArticle(harness, {
        title: '【第一条】正文一',
        event: true
    });
    const conflictingId = await insertArticle(harness, {
        title: '【冲突】正文二',
        event: true
    });
    await harness.connection.pool.query(`
        CREATE FUNCTION skip_conflicting_article_update()
        RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
            IF OLD.title = '【冲突】正文二' THEN
                RETURN NULL;
            END IF;
            RETURN NEW;
        END;
        $$;
        CREATE TRIGGER skip_conflicting_article_update
        BEFORE UPDATE ON articles
        FOR EACH ROW EXECUTE FUNCTION skip_conflicting_article_update();
    `);

    const report = await executeCmsArticleTitleBackfill(harness.connection, true);
    assert.equal(report.status, 'aborted');
    assert.equal(report.counts.conflicts, 1);
    assert.equal(report.counts.updated, 0);
    assert.deepEqual(report.conflicts, [{
        id: conflictingId,
        reason: `Article ${conflictingId} changed while the backfill was running`
    }]);
    assert.equal(
        report.records.find((record) => record.id === conflictingId).status,
        'conflict'
    );
    assert.equal((await readArticle(harness, firstId)).title, '【第一条】正文一');
    assert.equal((await readArticle(harness, firstId)).revision, 0);
    assert.equal(await readEventTitle(harness, firstId), '【第一条】正文一');
});

test('PostgreSQL apply rolls back the batch after a late event write failure', {
    skip: !postgresIntegrationEnabled()
}, async (t) => {
    const harness = await createPostgresTestHarness();
    t.after(() => harness.close());
    const firstId = await insertArticle(harness, {
        title: '【成功】正文一',
        event: true
    });
    const failingId = await insertArticle(harness, {
        title: '【失败】正文二',
        event: true
    });
    await harness.connection.pool.query(`
        CREATE FUNCTION reject_failed_event_title()
        RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
            IF NEW.title = '失败' THEN
                RAISE EXCEPTION 'intentional migration test failure';
            END IF;
            RETURN NEW;
        END;
        $$;
        CREATE TRIGGER reject_failed_event_title
        BEFORE UPDATE ON events
        FOR EACH ROW EXECUTE FUNCTION reject_failed_event_title();
    `);

    const report = await executeCmsArticleTitleBackfill(harness.connection, true);
    assert.equal(report.status, 'aborted');
    assert.equal(report.counts.errors, 1);
    assert.equal(report.counts.updated, 0);
    assert.deepEqual(report.errors, [{
        id: failingId,
        reason: 'Database operation failed'
    }]);
    assert.equal((await readArticle(harness, firstId)).title, '【成功】正文一');
    assert.equal((await readArticle(harness, firstId)).revision, 0);
    assert.equal(await readEventTitle(harness, firstId), '【成功】正文一');
    assert.equal((await readArticle(harness, failingId)).title, '【失败】正文二');
});
