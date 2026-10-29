import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import { afterAll, test } from 'vitest';
import { Client } from 'pg';
import { decision, validateConfig, mergeTable, ensureState, run } from '../../scripts/migration/preview-data-sync';
import { applyMigrations, readMigrations } from '../../scripts/migration/postgres-migrations';
import { verifier } from '../../scripts/migration/preview-media-sync';
import { createPostgresTestHarness, postgresIntegrationEnabled } from '../integration/postgres-harness';
import { closeSharedPostgresTestAllocator } from '../postgres-test-lifecycle';

afterAll(() => closeSharedPostgresTestAllocator());

test('merge policy preserves divergent preview changes and never resurrects deleted rows', () => {
    assert.equal(decision(null, 'source', null), 'insert');
    assert.equal(decision(null, 'source', 'preview'), 'conflict');
    assert.equal(decision(null, 'same', 'same'), 'adopt');
    assert.equal(decision('base', 'source', 'base'), 'update');
    assert.equal(decision('base', 'base', 'preview'), 'unchanged');
    assert.equal(decision('base', 'source', 'preview'), 'conflict');
    assert.equal(decision('base', 'source', null), 'conflict');
});

test('configuration rejects source-target alias reuse and non-scratch database names', () => {
    const config = { sourceId: 'production', source: 'postgres://u@host/production',
        target: 'postgres://u@host/preview', stage: 'postgres://u@host/imsweb_sync_stage_preview',
        confirmTargetDatabase: 'preview' };
    assert.doesNotThrow(() => validateConfig(config));
    assert.throws(() => validateConfig({ ...config, target: config.source }));
    assert.throws(() => validateConfig({ ...config, stage: config.target }));
    assert.throws(() => validateConfig({ ...config, confirmTargetDatabase: 'production' }));
    assert.doesNotThrow(() => validateConfig({ ...config, preserveMediaKeys: ['editorial/about/config.json'] }));
    assert.throws(() => validateConfig({ ...config, preserveMediaKeys: ['community/namecards/assets/front/image.png'] }));
    assert.throws(() => validateConfig({ ...config, media: { strategy: 'unknown' } }));
    assert.throws(() => validateConfig({ ...config, media: { concurrency: 0 } }));
    assert.throws(() => validateConfig({ ...config, media: { concurrency: 17 } }));
    assert.throws(() => validateConfig({ ...config, media: { serverSideCopy: 'false' } }));
});

test.skipIf(!postgresIntegrationEnabled())('real PostgreSQL: baselines, conflicts, deletion, rollback and bigint identity', async () => {
    const sourceDb = await createPostgresTestHarness({ label: 'sync_source', seedCanonicalAgencies: false });
    const targetDb = await createPostgresTestHarness({ label: 'sync_target', seedCanonicalAgencies: false });
    const source = new Client({ connectionString: sourceDb.databaseUrl });
    const target = new Client({ connectionString: targetDb.databaseUrl });
    try {
        await source.connect(); await target.connect();
        for (const client of [source, target]) await client.query(`CREATE TABLE public.sync_records (
            id bigint PRIMARY KEY, name text UNIQUE NOT NULL, body text NOT NULL)`);
        await ensureState(target);
        const options = { apply: true, hasState: true, sourceId: 'production' };
        await source.query("INSERT INTO public.sync_records VALUES (9007199254740993,'old','base')");
        await target.query("INSERT INTO public.sync_records VALUES (2,'preview-only','keep')");
        await target.query('BEGIN');
        assert.equal((await mergeTable(source, target, 'sync_records', options)).insert, 1);
        await target.query('COMMIT');
        assert.equal((await target.query('SELECT id::text FROM public.sync_records WHERE name=$1', ['old'])).rows[0].id, '9007199254740993');
        await source.query("UPDATE public.sync_records SET body='source-v2'");
        await target.query('BEGIN');
        assert.equal((await mergeTable(source, target, 'sync_records', options)).update, 1);
        await target.query('COMMIT');
        await target.query("UPDATE public.sync_records SET body='preview-edit' WHERE name='old'");
        await source.query("UPDATE public.sync_records SET body='source-v3'");
        // A unique collision must roll back its baseline as well as the insert.
        await source.query("INSERT INTO public.sync_records VALUES (3,'preview-only','collision')");
        await target.query('BEGIN');
        assert.equal((await mergeTable(source, target, 'sync_records', options)).conflict, 2);
        await target.query('COMMIT');
        assert.equal((await target.query('SELECT count(*) FROM preview_sync.baselines')).rows[0].count, '1');
        assert.equal((await target.query("SELECT body FROM public.sync_records WHERE name='old'")).rows[0].body, 'preview-edit');
        await source.query('DELETE FROM public.sync_records');
        await target.query('BEGIN');
        assert.equal((await mergeTable(source, target, 'sync_records', options)).deleted, 1);
        await target.query('COMMIT');
        assert.equal((await target.query('SELECT count(*) FROM public.sync_records')).rows[0].count, '2');
        await source.query("INSERT INTO public.sync_records VALUES (4,'dry','test')");
        await target.query('BEGIN READ ONLY');
        assert.equal((await mergeTable(source, target, 'sync_records', { ...options, apply: false })).insert, 1);
        await target.query('ROLLBACK');
        assert.equal((await target.query('SELECT count(*) FROM public.sync_records WHERE id=4')).rows[0].count, '0');
        await target.query('BEGIN');
        await mergeTable(source, target, 'sync_records', options);
        await target.query('ROLLBACK');
        assert.equal((await target.query('SELECT count(*) FROM preview_sync.baselines')).rows[0].count, '1');
        // A conflicting parent blocks only its own children, not children of
        // independently accepted rows in the same parent table.
        for (const client of [source, target]) await client.query(`
            ALTER TABLE public.sync_records ADD UNIQUE(id,name);
            CREATE TABLE public.sync_children (id bigint PRIMARY KEY, parent_id bigint NOT NULL,
                parent_name text NOT NULL, FOREIGN KEY(parent_id,parent_name) REFERENCES public.sync_records(id,name))`);
        await source.query("INSERT INTO public.sync_records VALUES (9007199254740993,'old','source-v3')");
        await source.query("INSERT INTO public.sync_children VALUES (1,4,'dry'),(2,9007199254740993,'old')");
        await target.query('BEGIN');
        const parents = await mergeTable(source, target, 'sync_records', options);
        const children = await mergeTable(source, target, 'sync_children', {
            ...options, parentConflicts: new Map([['sync_records', parents.conflictKeys]])
        });
        await target.query('COMMIT');
        assert.equal(children.insert, 1);
        assert.equal(children.conflict, 1);
        assert.deepEqual((await target.query('SELECT id::text,parent_id::text FROM public.sync_children')).rows,
            [{ id: '1', parent_id: '4' }]);
        // Legacy rows need explicit timestamps and an unavailable ownerless
        // layer on insert; those fields remain preview-owned on later updates.
        await target.query(`INSERT INTO public.s3_object_versions
            (object_id,byte_size,content_type,sha256,etag,created_at,physical_key,storage_scope)
            VALUES ('front',1,'image/png',repeat('a',64),'front',1,'front','public'),
                   ('back',1,'image/png',repeat('b',64),'back',1,'back','public');
            INSERT INTO public.s3_object_index(logical_key,object_id,state,incarnation,updated_at)
            VALUES ('front','front','ready',1,1),('back','back','ready',1,1)`);
        await source.query(`INSERT INTO public.fudaba_cards
            (id,card_number,origin,front_object_key,back_object_key,available,trade_note,publication_status,revision,created_at,updated_at)
            VALUES ('legacy-import',9000,'legacy','front','back',false,NULL,'published',0,'2026-01-01','2026-01-02')`);
        await target.query('BEGIN');
        assert.equal((await mergeTable(source, target, 'fudaba_cards', options)).insert, 1);
        await target.query('COMMIT');
        const card = (await target.query("SELECT available,created_at,updated_at FROM public.fudaba_cards WHERE id='legacy-import'")).rows[0];
        assert.equal(card.available, false);
        assert.equal(card.created_at.toISOString(), '2026-01-01T00:00:00.000Z');
        assert.equal(card.updated_at.toISOString(), '2026-01-02T00:00:00.000Z');
        await target.query('BEGIN');
        assert.equal((await mergeTable(source, target, 'fudaba_cards', options)).unchanged, 1);
        await target.query('COMMIT');
    } finally {
        await source.end(); await target.end();
        await sourceDb.close(); await targetDb.close();
    }
});

test('media verifies bytes and uses create-only writes; collisions never overwrite', async () => {
    const bytes = Buffer.from('image');
    const payload = JSON.stringify({ physical_key: 'public/image', storage_scope: 'public',
        byte_size: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex'), content_type: 'image/png' });
    let stored: Buffer | null = null;
    let writes = 0;
    const missing = () => Object.assign(new Error('missing'), { $metadata: { httpStatusCode: 404 } });
    const clients = {
        source: { async send() { return { Body: Readable.from([bytes]) }; } },
        target: { async send(command: { input: { Body?: Buffer; IfNoneMatch?: string } }) {
            if (command.input.Body) {
                assert.equal(command.input.IfNoneMatch, '*');
                stored = command.input.Body; writes += 1; return {};
            }
            if (!stored) throw missing();
            return { Body: Readable.from([stored]) };
        } }
    };
    const verify = verifier({ source: { bucket: 'production' }, target: { bucket: 'preview-test' } }, clients);
    await verify('s3_object_versions', payload);
    await verify('s3_object_versions', payload);
    assert.equal(writes, 1);
    stored = Buffer.from('different');
    const nextRun = verifier({ source: { bucket: 'production' }, target: { bucket: 'preview-test' } }, clients);
    await assert.rejects(nextRun('s3_object_versions', payload));
    assert.equal(writes, 1);
});

// Four real pg_dump/pg_restore cycles replay the full migration catalog. The
// shared CI runner under coverage needs an integration-test budget, not 5s.
test.skipIf(!postgresIntegrationEnabled())('complete old-schema snapshot transforms into preview without replacing local edits', async () => {
    const sourceDb = await createPostgresTestHarness({ label: 'sync_legacy', seedCanonicalAgencies: false });
    const targetDb = await createPostgresTestHarness({ label: 'sync_preview', seedCanonicalAgencies: false });
    const source = new Client({ connectionString: sourceDb.databaseUrl });
    const target = new Client({ connectionString: targetDb.databaseUrl });
    const scratchName = `imsweb_sync_stage_test_${crypto.randomBytes(5).toString('hex')}`;
    try {
        await source.connect(); await target.connect();
        await source.query(`CREATE DATABASE ${scratchName}`);
        await source.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
        await applyMigrations(source, { migrations: readMigrations().filter((migration: { version: string }) =>
            /^00(0[1-9]|1[0-9])_/.test(migration.version) ||
            /^202608/.test(migration.version) && migration.version <= '20260814170000_object_deletion_jobs') });
        await source.query("INSERT INTO public.news (title) VALUES ('old-site')");
        await source.query("INSERT INTO public.events(title) VALUES ('legacy event')");
        await source.query(`INSERT INTO public.cards(image1_url,image2_url,hash1,hash2,status)
            VALUES ('/uploads/namecard/original/front.png','/uploads/namecard/original/back.png',
                'front-hash','back-hash','approved')`);
        await source.query('BEGIN');
        await source.query(`INSERT INTO public.site_packages
            (id,slug,title,published_revision_id,created_by,updated_by,created_at,updated_at)
            VALUES ('package','package','Source package','revision',1,1,1,1)`);
        await source.query(`INSERT INTO public.site_package_revisions
            (id,package_id,revision_number,entry_path,runtime_mode,state,file_count,total_bytes,
             source_key,source_sha256,manifest_key,manifest_json,preview_token_hash,created_by,created_at)
            VALUES ('revision','package',1,'index.html','safe','ready',1,1,
                'source.zip',repeat('a',64),'manifest.json','{}',repeat('b',64),1,1)`);
        await source.query('COMMIT');
        await target.query("INSERT INTO public.backoffice_accounts(id,username,password) VALUES (1,'preview-sync-actor','unused')");
        const preserveMediaKeys = ['editorial/information/index.json', 'community/producer-map/config.json', 'editorial/about/config.json'];
        for (const [index, logicalKey] of preserveMediaKeys.entries()) {
            for (const [client, prefix] of [[source, 'source'], [target, 'preview']] as const) {
                await client.query(`INSERT INTO public.s3_object_versions
                    (object_id,byte_size,content_type,sha256,etag,created_at,physical_key,storage_scope)
                    VALUES ($1,2,'application/json',repeat('a',64),$1,1,$1,'public')`, [`${prefix}-config-${index}`]);
                await client.query(`INSERT INTO public.s3_object_index(logical_key,object_id,state,incarnation,updated_at)
                    VALUES ($1,$2,'ready',1,1)`, [logicalKey, `${prefix}-config-${index}`]);
            }
        }
        const stageUrl = new URL(sourceDb.databaseUrl); stageUrl.pathname = `/${scratchName}`;
        const config = { sourceId: 'legacy', source: sourceDb.databaseUrl, target: targetDb.databaseUrl,
            stage: stageUrl.toString(), confirmTargetDatabase: targetDb.databaseName, previewActorAccountId: '1',
            preserveMediaKeys,
            media: { source: { endpoint: 'https://source.invalid', bucket: 'production' },
                target: { endpoint: 'https://target.invalid', bucket: 'preview-test' } } };
        const plan = await run(config);
        assert.equal(plan.tables.news.insert, 1);
        assert.equal((await target.query("SELECT to_regclass('preview_sync.baselines') AS name")).rows[0].name, null);
        const firstApply = await run(config, true);
        assert.equal(firstApply.tables.s3_object_index.preserved, 3);
        assert.equal(firstApply.tables.news.insert, 1);
        assert.equal((await target.query("SELECT count(*) FROM public.s3_object_index WHERE object_id LIKE 'preview-config-%'")).rows[0].count, '3');
        assert.equal((await target.query("SELECT count(*) FROM public.s3_object_versions WHERE object_id LIKE 'source-config-%'")).rows[0].count, '0');
        assert.equal(firstApply.tables.fudaba_cards.conflict, 1);
        assert.equal((await target.query('SELECT count(*) FROM public.fudaba_cards')).rows[0].count, '0');
        assert.equal((await target.query('SELECT title FROM public.news')).rows[0].title, 'old-site');
        assert.equal((await target.query('SELECT title FROM public.articles')).rows[0].title, 'legacy event');
        assert.equal((await target.query('SELECT published_revision_id FROM public.site_packages')).rows[0].published_revision_id, 'revision');
        await target.query("UPDATE public.news SET title='preview edit'");
        await source.query("UPDATE public.news SET title='source edit'");
        assert.equal((await run(config, true)).tables.news.conflict, 1);
        assert.equal((await target.query('SELECT title FROM public.news')).rows[0].title, 'preview edit');
        // A conflicting revision must never become the active publication.
        await target.query("UPDATE public.site_package_revisions SET manifest_json='preview manifest'");
        await source.query("UPDATE public.site_package_revisions SET manifest_json='source manifest'");
        const packageConflict = await run(config, true);
        assert.equal(packageConflict.tables.site_package_revisions.conflict, 1);
        assert.equal(packageConflict.tables.site_package_publications.skipped, 'parent-conflict');
        assert.equal((await target.query('SELECT manifest_json FROM public.site_package_revisions')).rows[0].manifest_json, 'preview manifest');
        assert.equal((await source.query('SELECT count(*) FROM public.ims_schema_migrations')).rows[0].count, '26');
    } finally {
        await source.query(`DROP DATABASE IF EXISTS ${scratchName} WITH (FORCE)`).catch(() => undefined);
        await source.end(); await target.end();
        await sourceDb.close(); await targetDb.close();
    }
}, 60_000);
