'use strict';

// Run with Node from any cwd. Credentials live in an external, mode-0600 JSON file.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const { Client } = require('pg');
const { migratePostgres, readMigrations } = require('./postgres-migrations');

// Dependency order. Identity, security, queues, config and immutable legacy archives
// deliberately have no entry. Never discover writable tables from source input.
const TABLES = [
    's3_object_versions', 's3_object_index', 'agencies', 'idols', 'theme_colors',
    'wiki_groups', 'wiki_group_members', 'wiki_categories', 'wiki_idol_categories',
    'wiki_story_content_types', 'wiki_story_source_platforms', 'wiki_story_cover_assets',
    'wiki_story_cards', 'wiki_story_links', 'news', 'articles', 'events',
    'homepage_links', 'site_packages', 'site_package_revisions',
    'fudaba_cards', 'namecard_guest_attributes', 'namecard_reactions'
];
const IGNORED = {
    articles: ['created_at', 'updated_at', 'revision', 'created_by', 'updated_by', 'published_by'],
    site_packages: ['published_revision_id', 'created_by', 'updated_by'],
    site_package_revisions: ['created_by', 'preview_token_hash'],
    fudaba_cards: ['legacy_card_id', 'owner_account_id', 'producer_name', 'display_name',
        'favorite_idol', 'accent', 'bio', 'trade_note', 'available', 'revision',
        'created_at', 'updated_at', 'pending_payload', 'pending_front_object_key',
        'pending_back_object_key'],
    namecard_guest_attributes: ['submitted_ip', 'withdrawal_token_hash'],
    s3_object_versions: ['owner_token'],
    s3_object_index: ['operation_id']
};
const quote = (value) => '"' + value.replaceAll('"', '""') + '"';
const relation = (table) => `public.${quote(table)}`;
// These documents are read independently of SQL content rows. Operators may
// explicitly retain preview's copies without blocking unrelated content.
const PRESERVABLE_MEDIA_KEYS = new Set([
    'editorial/information/index.json', 'community/producer-map/config.json',
    'editorial/about/config.json'
]);

function decision(baseline, incoming, current) {
    if (baseline !== null && incoming === baseline) return 'unchanged';
    if (incoming === current) return 'adopt';
    if (baseline !== null && current === baseline) return 'update';
    if (baseline === null && current === null) return 'insert';
    return 'conflict';
}

function validateConfig(config) {
    if (config.media?.strategy !== undefined && !['verified-bytes', 'r2-optimized'].includes(config.media.strategy)) {
        throw new Error('Unsupported media strategy');
    }
    if (config.media?.concurrency !== undefined && (!Number.isInteger(config.media.concurrency) ||
        config.media.concurrency < 1 || config.media.concurrency > 16)) {
        throw new Error('Media concurrency must be an integer from 1 to 16');
    }
    if (config.media?.serverSideCopy !== undefined && typeof config.media.serverSideCopy !== 'boolean') {
        throw new Error('serverSideCopy must be a boolean');
    }
    if (config.media?.requestTimeoutMs !== undefined && (!Number.isInteger(config.media.requestTimeoutMs) ||
        config.media.requestTimeoutMs < 1000 || config.media.requestTimeoutMs > 120000)) {
        throw new Error('R2 request timeout must be between 1000 and 120000ms');
    }
    if (config.preserveMediaKeys !== undefined && (!Array.isArray(config.preserveMediaKeys) ||
        config.preserveMediaKeys.some((key) => !PRESERVABLE_MEDIA_KEYS.has(key)))) {
        throw new Error('preserveMediaKeys supports only independent content configuration documents');
    }
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(config.sourceId || '')) {
        throw new Error('sourceId must be a stable identifier (1–64 letters/digits/_/-)');
    }
    const urls = ['source', 'stage', 'target'].map((key) => {
        const url = new URL(config[key]);
        if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.pathname === '/') {
            throw new Error(`Invalid ${key} PostgreSQL URL`);
        }
        return url;
    });
    if (!/^\/imsweb_sync_stage_[a-z0-9_]+$/.test(urls[1].pathname)) {
        throw new Error('Scratch database must be named imsweb_sync_stage_<name>');
    }
    const identities = urls.map((url) => `${url.hostname}:${url.port || 5432}${decodeURIComponent(url.pathname)}`);
    if (new Set(identities).size !== 3) throw new Error('Source, stage and target must be different databases');
    if (config.confirmTargetDatabase !== decodeURIComponent(urls[2].pathname.slice(1))) {
        throw new Error('confirmTargetDatabase must match the preview database name');
    }
    return config;
}

async function command(binary, args, database) {
    const url = new URL(database);
    if ([...url.searchParams.keys()].some((key) => !['sslmode', 'sslrootcert', 'sslcert', 'sslkey'].includes(key))) {
        throw new Error('Unsupported libpq URL parameter');
    }
    await new Promise((resolve, reject) => {
        const child = spawn(binary, ['--dbname', decodeURIComponent(url.pathname.slice(1)), ...args], {
            // Connection strings are never command-line arguments or printed.
            env: { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('PG'))),
                PGHOST: url.hostname, PGPORT: url.port || '5432',
                PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password),
                PGSSLMODE: url.searchParams.get('sslmode') || 'prefer',
                ...Object.fromEntries(['sslrootcert', 'sslcert', 'sslkey'].filter((key) => url.searchParams.has(key))
                    .map((key) => [`PG${key.toUpperCase()}`, url.searchParams.get(key)])),
                PGOPTIONS: '-c statement_timeout=0',
                PGPASSFILE: '/dev/null' },
            stdio: ['ignore', 'ignore', 'pipe']
        });
        let diagnostic = '';
        child.stderr.on('data', (chunk) => { diagnostic = (diagnostic + chunk.toString()).slice(-2000); });
        child.on('error', () => reject(new Error(`${binary} could not start`)));
        child.on('close', (code) => {
            const safe = diagnostic.replace(/postgres(?:ql)?:\/\/\S+/g, '[database]')
                .replaceAll(decodeURIComponent(url.password) || '\u0000', '[password]');
            code === 0 ? resolve() : reject(new Error(`${binary} failed (${code}): ${safe}`));
        });
    });
}

async function connect(connectionString) {
    const client = new Client({ connectionString, application_name: 'imsweb-preview-data-sync',
        connectionTimeoutMillis: 10000, statement_timeout: 120000 });
    await client.connect();
    return client;
}

async function verifyLegacySchema(client) {
    const versions = await client.query('SELECT version,checksum FROM public.ims_schema_migrations');
    const released = new Map(readMigrations().filter((migration) =>
        /^00(0[1-9]|1[0-9])_/.test(migration.version) ||
        /^202608/.test(migration.version) && migration.version <= '20260814170000_object_deletion_jobs'
    ).map((migration) => [migration.version, migration.checksum]));
    if (versions.rows.length !== released.size || versions.rows.some((migration) =>
        released.get(migration.version) !== migration.checksum)) {
        throw new Error('Source schema does not match the supported v1.0.16 baseline');
    }
}

async function metadata(client, table) {
    const result = await client.query(`SELECT a.attname AS name,
        a.attnum = ANY(i.indkey) AS primary_key,
        pg_get_serial_sequence($1, a.attname) AS sequence
        FROM pg_attribute a JOIN pg_index i ON i.indrelid=a.attrelid AND i.indisprimary
        WHERE a.attrelid=to_regclass($1) AND a.attnum>0 AND NOT a.attisdropped
        ORDER BY a.attnum`, [`public.${table}`]);
    if (!result.rows.length) throw new Error(`Missing primary key or table: ${table}`);
    return result.rows;
}

async function ensureState(client) {
    await client.query(`CREATE SCHEMA IF NOT EXISTS preview_sync;
        CREATE TABLE IF NOT EXISTS preview_sync.baselines (
            source_id text NOT NULL, table_name text NOT NULL, row_key jsonb NOT NULL,
            payload jsonb NOT NULL, PRIMARY KEY(source_id,table_name,row_key)
        );
        CREATE TABLE IF NOT EXISTS preview_sync.events (
            id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            source_id text NOT NULL, table_name text NOT NULL, row_key jsonb NOT NULL,
            kind text NOT NULL, recorded_at timestamptz NOT NULL DEFAULT now()
        )`);
}

// Compare JSON inside PostgreSQL: bigint IDs and numeric values never round-trip
// through JavaScript numbers. Baselines and business writes share one transaction.
async function mergeTable(source, target, table, options) {
    const columns = await metadata(source, table);
    const ignored = options.fields ? columns.map((column) => column.name).filter((name) => !options.fields.includes(name)) :
        [...(IGNORED[table] || []), 'revision'];
    const stateTable = options.stateTable || table;
    const managed = columns.map((column) => column.name).filter((name) => !ignored.includes(name));
    const keys = columns.filter((column) => column.primary_key).map((column) => column.name);
    const projection = `to_jsonb(t) - $1::text[]`;
    const keyExpression = `jsonb_build_object(${keys.map((key) => `'${key}',t.${quote(key)}`).join(',')})`;
    const predicate = keys.map((key) => `t.${quote(key)}=(jsonb_populate_record(NULL::${relation(table)},$2::jsonb)).${quote(key)}`).join(' AND ');
    const foreignKeys = await source.query(`SELECT c.confrelid::regclass::text AS parent,
        array_agg(child.attname::text ORDER BY k.position) AS child_columns,
        array_agg(parent.attname::text ORDER BY k.position) AS parent_columns
        FROM pg_constraint c
        CROSS JOIN LATERAL unnest(c.conkey,c.confkey) WITH ORDINALITY k(child_number,parent_number,position)
        JOIN pg_attribute child ON child.attrelid=c.conrelid AND child.attnum=k.child_number
        JOIN pg_attribute parent ON parent.attrelid=c.confrelid AND parent.attnum=k.parent_number
        WHERE c.contype='f' AND c.conrelid=to_regclass($1)
        GROUP BY c.oid,c.confrelid ORDER BY c.oid`, [`public.${table}`]);
    const dependencies = foreignKeys.rows.filter((fk) => options.parentConflicts?.has(fk.parent.replace(/^public\./, '')));
    for (const fk of dependencies) {
        fk.primary_columns = (await metadata(source, fk.parent.replace(/^public\./, '')))
            .filter((column) => column.primary_key).map((column) => column.name);
    }
    const references = dependencies.length ? `jsonb_build_object(${dependencies.map((fk, index) =>
        `'${index}',(SELECT jsonb_build_object(${fk.primary_columns.map((name) =>
            `'${name.replaceAll("'", "''")}',p.${quote(name)}`).join(',')})::text
            FROM ${relation(fk.parent.replace(/^public\./, ''))} p WHERE ${fk.parent_columns.map((name, position) =>
            `p.${quote(name)}=t.${quote(fk.child_columns[position])}`).join(' AND ')})`).join(',')})::text` : "'{}'::text";
    const mediaTable = table === 's3_object_versions' || table === 's3_object_index';
    const preservedKeys = options.preserveMediaKeys || [];
    const filter = table === 's3_object_versions' ? " WHERE t.storage_scope='public' AND EXISTS (SELECT 1 FROM public.s3_object_index i WHERE i.object_id=t.object_id AND i.state='ready' AND NOT(i.logical_key=ANY($2::text[])))" :
        table === 's3_object_index' ? " WHERE t.state='ready' AND NOT(t.logical_key=ANY($2::text[])) AND EXISTS (SELECT 1 FROM public.s3_object_versions v WHERE v.object_id=t.object_id AND v.storage_scope='public')" : '';
    const initialValues = table === 'fudaba_cards'
        ? "jsonb_build_object('created_at',t.created_at,'updated_at',t.updated_at,'available',false,'trade_note',NULL)::text" : "'{}'::text";
    const rows = await source.query(`SELECT (${projection})::text AS payload, ${references} AS parent_refs,
        ${initialValues} AS insert_values,
        (${keyExpression})::text AS key FROM ${relation(table)} t${filter}`, mediaTable ? [ignored, preservedKeys] : [ignored]);
    const summary = { insert: 0, update: 0, adopt: 0, unchanged: 0, conflict: 0, deleted: 0,
        insertedKeys: new Set(), conflictKeys: new Set() };
    if (table === 's3_object_index') {
        const retained = await source.query('SELECT count(*)::int AS count FROM public.s3_object_index WHERE logical_key=ANY($1::text[])', [preservedKeys]);
        summary.preserved = retained.rows[0].count;
    }
    Object.defineProperty(summary, 'insertedKeys', { enumerable: false });
    Object.defineProperty(summary, 'conflictKeys', { enumerable: false });
    const seen = new Set();
    for (const row of rows.rows) {
        seen.add(row.key);
        const ownershipGuard = table === 'fudaba_cards' ? ', (t.owner_account_id IS NOT NULL OR t.pending_payload IS NOT NULL) AS locally_owned' : '';
        const current = await target.query(`SELECT (${projection})::text AS payload${ownershipGuard}
            FROM ${relation(table)} t WHERE ${predicate}${options.apply ? ' FOR UPDATE' : ''}`, [ignored, row.key]);
        const baseline = options.hasState ? await target.query(`SELECT payload::text AS payload
            FROM preview_sync.baselines WHERE source_id=$1 AND table_name=$2 AND row_key=$3::jsonb`,
        [options.sourceId, stateTable, row.key]) : { rows: [] };
        let action = decision(baseline.rows[0]?.payload ?? null, row.payload, current.rows[0]?.payload ?? null);
        if (!baseline.rows.length && options.bootstrapKeys?.has(row.key) && action === 'conflict') action = 'update';
        const parentKeys = JSON.parse(row.parent_refs);
        if (dependencies.some((fk, index) => options.parentConflicts.get(fk.parent.replace(/^public\./, '')).has(parentKeys[index]))) action = 'conflict';
        if (action === 'update' && current.rows[0]?.locally_owned) action = 'conflict';
        // A removed preview record is a conflict, never resurrected automatically.
        if (action === 'update' && !current.rows.length) action = 'conflict';
        if (options.apply) {
            await target.query('SAVEPOINT sync_row');
            try {
                if (['insert', 'update', 'adopt'].includes(action) && options.verifyMedia) {
                    await options.verifyMedia(table, row.payload);
                }
                if (['insert', 'update'].includes(action)) {
                    if (table === 'fudaba_cards') {
                        const media = await target.query(`SELECT count(DISTINCT i.logical_key)::int AS count
                            FROM public.s3_object_index i JOIN public.s3_object_versions v ON v.object_id=i.object_id
                            WHERE i.state='ready' AND v.storage_scope='public' AND i.logical_key IN (
                                $1::jsonb->>'front_object_key',$1::jsonb->>'back_object_key')`, [row.payload]);
                        if (media.rows[0].count !== 2) {
                            throw Object.assign(new Error('Namecard media is not ready'), { code: '23503' });
                        }
                    }
                    if (action === 'insert') {
                        const extra = JSON.parse(row.insert_values);
                        if (['site_packages', 'site_package_revisions'].includes(table)) {
                            if (!/^\d+$/.test(options.actor || '') || !(await target.query(
                                'SELECT 1 FROM public.backoffice_accounts WHERE id=$1', [options.actor])).rows.length) {
                                throw Object.assign(new Error('Preview package actor is required'), { code: '23503' });
                            }
                            extra.created_by = options.actor;
                            if (table === 'site_packages') extra.updated_by = options.actor;
                            else extra.preview_token_hash = randomBytes(32).toString('hex');
                        }
                        const insertColumns = [...managed, ...Object.keys(extra)];
                        await target.query(`INSERT INTO ${relation(table)} (${insertColumns.map(quote).join(',')})
                            SELECT ${insertColumns.map(quote).join(',')} FROM jsonb_populate_record(NULL::${relation(table)},$1::jsonb || $2::jsonb)`,
                        [row.payload, JSON.stringify(extra)]);
                    } else {
                        const changes = managed.filter((name) => !keys.includes(name));
                        const assignments = changes.map((name) => `${quote(name)}=s.${quote(name)}`);
                        if (columns.some((column) => column.name === 'revision')) assignments.push('revision=t.revision+1');
                        if (['articles', 'fudaba_cards'].includes(table)) assignments.push('updated_at=CURRENT_TIMESTAMP');
                        await target.query(`UPDATE ${relation(table)} t SET
                            ${assignments.join(',')}
                            FROM jsonb_populate_record(NULL::${relation(table)},$1::jsonb) s
                            WHERE ${predicate}`, [row.payload, row.key]);
                    }
                }
                if (['insert', 'update', 'adopt'].includes(action)) {
                    await target.query(`INSERT INTO preview_sync.baselines VALUES ($1,$2,$3::jsonb,$4::jsonb)
                        ON CONFLICT(source_id,table_name,row_key) DO UPDATE SET payload=EXCLUDED.payload`,
                    [options.sourceId, stateTable, row.key, row.payload]);
                }
            } catch (error) {
                await target.query('ROLLBACK TO SAVEPOINT sync_row');
                if (!['23503', '23505', '23514', '23502'].includes(error.code)) throw error;
                action = 'conflict';
            }
            if (action === 'conflict') await target.query(`INSERT INTO preview_sync.events
                (source_id,table_name,row_key,kind) VALUES ($1,$2,$3::jsonb,'conflict')`, [options.sourceId, stateTable, row.key]);
            await target.query('RELEASE SAVEPOINT sync_row');
        }
        summary[action] += 1;
        if (action === 'insert') summary.insertedKeys.add(row.key);
        if (action === 'conflict') summary.conflictKeys.add(row.key);
    }
    if (options.hasState) {
        const prior = await target.query(`SELECT row_key::text AS key FROM preview_sync.baselines
            WHERE source_id=$1 AND table_name=$2`, [options.sourceId, stateTable]);
        for (const row of prior.rows) if (!seen.has(row.key)) {
            if (mediaTable && (await source.query(`SELECT 1 FROM ${relation(table)} t WHERE to_jsonb(t) @> $1::jsonb`, [row.key])).rows.length) continue;
            summary.deleted += 1;
            if (options.apply) await target.query(`INSERT INTO preview_sync.events
                (source_id,table_name,row_key,kind) VALUES ($1,$2,$3::jsonb,'source-deleted')`, [options.sourceId, stateTable, row.key]);
        }
    }
    return summary;
}

async function run(config, apply = false) {
    validateConfig(config);
    if (!config.media) throw new Error('Explicit source/preview media configuration is required');
    const clients = [];
    let verifyMedia;
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'imsweb-sync-'));
    fs.chmodSync(directory, 0o700);
    try {
        const target = await connect(config.target); clients.push(target);
        // Both the source and the target must have the expected generation of schema.
        if (!(await target.query("SELECT to_regclass('public.platform_accounts') AS name")).rows[0].name) {
            throw new Error('Target is not a migrated preview database');
        }
        const lock = await target.query("SELECT pg_try_advisory_lock(hashtext('imsweb-preview-data-sync')) AS locked");
        if (!lock.rows[0].locked) throw new Error('Another sync is running');
        const source = await connect(config.source); clients.push(source);
        await source.query('BEGIN READ ONLY');
        await verifyLegacySchema(source);
        const catalog = new Map(readMigrations().map((m) => [m.version, m.checksum]));
        await source.query('COMMIT');
        const dump = path.join(directory, 'source.dump');
        await command('pg_dump', ['--format=custom', '--no-owner', '--no-privileges', '--schema=public', '--file', dump], config.source);
        const stage = await connect(config.stage); clients.push(stage);
        // A dedicated, disposable staging database is mandatory, even for a plan.
        const stageName = (await stage.query('SELECT current_database() AS name')).rows[0].name;
        if (!/^imsweb_sync_stage_[a-z0-9_]+$/.test(stageName)) throw new Error('Invalid scratch database identity');
        // Actual names also catch URL encoding and DNS aliases. Reusing the
        // scratch name on another cluster is rejected conservatively as well.
        for (const client of [source, target]) {
            if ((await client.query('SELECT current_database() AS name')).rows[0].name === stageName) {
                throw new Error('Scratch database aliases source or target');
            }
        }
        const stageLock = await stage.query("SELECT pg_try_advisory_lock(hashtext('imsweb-preview-data-sync-stage')) AS locked");
        if (!stageLock.rows[0].locked) throw new Error('Scratch database is in use');
        await stage.query('DROP SCHEMA IF EXISTS public CASCADE');
        await command('pg_restore', ['--exit-on-error', '--no-owner', '--no-privileges', dump], config.stage);
        await verifyLegacySchema(stage);
        await migratePostgres({ connectionString: config.stage });
        await stage.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
        verifyMedia = require('./preview-media-sync').verifier(config.media);
        if (apply) {
            // Copy slow object bytes before holding application table locks.
            // Generic stores use the accepted SQL baseline. R2 can cheaply
            // recheck every object through its batched inventory each run.
            const stateExists = Boolean((await target.query("SELECT to_regclass('preview_sync.baselines') AS name")).rows[0].name);
            const media = await stage.query(`SELECT (to_jsonb(v)-ARRAY['owner_token','revision'])::text AS payload,
                v.object_id FROM public.s3_object_versions v WHERE v.storage_scope='public'
                AND EXISTS (SELECT 1 FROM public.s3_object_index i WHERE i.object_id=v.object_id AND i.state='ready'
                    AND NOT(i.logical_key=ANY($1::text[])))`, [config.preserveMediaKeys || []]);
            if (verifyMedia.prepare) await verifyMedia.prepare();
            let cursor = 0;
            let processed = 0;
            let failure;
            let lastProgress = 0;
            const concurrency = config.media.concurrency || (config.media.strategy === 'r2-optimized' ? 8 : 1);
            const workers = Array.from({ length: concurrency }, async () => {
                while (!failure && cursor < media.rows.length) {
                    const row = media.rows[cursor++];
                    try {
                        const accepted = stateExists && config.media.strategy !== 'r2-optimized' ? await target.query(`SELECT 1 FROM preview_sync.baselines b
                            JOIN public.s3_object_versions v ON v.object_id=$2
                            WHERE b.source_id=$1 AND b.table_name='s3_object_versions'
                            AND b.row_key=jsonb_build_object('object_id',$2::text)
                            AND b.payload=$3::jsonb AND (to_jsonb(v)-ARRAY['owner_token','revision'])=$3::jsonb`,
                        [config.sourceId, row.object_id, row.payload]) : { rows: [] };
                        if (!accepted.rows.length) await verifyMedia('s3_object_versions', row.payload);
                        processed += 1;
                        if (processed === media.rows.length || Date.now() - lastProgress >= 5000) {
                            const stats = verifyMedia.stats;
                            console.error(`Media preflight: ${processed}/${media.rows.length}` +
                                (stats ? ` reused=${stats.reused} copied=${stats.copied} relayedBytes=${stats.bytesRelayed}` : ''));
                            lastProgress = Date.now();
                        }
                    } catch (error) { failure ||= error; }
                }
            });
            // Drain in-flight operations before closing database connections.
            await Promise.allSettled(workers);
            if (failure) throw failure;
        }
        await target.query(apply ? 'BEGIN' : 'BEGIN READ ONLY');
        await target.query("SET LOCAL lock_timeout='5s'");
        // Serialize against schema deployment using its existing migration lock.
        await target.query("SELECT pg_advisory_xact_lock(hashtext('imsweb-schema-migration'))");
        const targetVersions = await target.query('SELECT version,checksum FROM public.ims_schema_migrations');
        if (targetVersions.rows.length !== catalog.size || targetVersions.rows.some((m) => catalog.get(m.version) !== m.checksum)) {
            throw new Error('Run the sync from the exact migration catalog deployed to preview');
        }
        if (apply) await ensureState(target);
        if (apply) {
            // Explicit-ID imports and sequence repair must exclude application
            // inserts for their entire transaction. Otherwise nextval can race
            // setval even when both values were read with GREATEST.
            await target.query(`LOCK TABLE ${TABLES.map(relation).join(',')} IN SHARE ROW EXCLUSIVE MODE`);
        }
        const hasState = Boolean((await target.query("SELECT to_regclass('preview_sync.baselines') AS name")).rows[0].name);
        /** @type {{sourceId: string, mode: string, media?: Record<string, number|string>, tables: Record<string, {
         * insert?: number, update?: number, adopt?: number, unchanged?: number,
         * conflict?: number, deleted?: number, preserved?: number, skipped?: string,
         * insertedKeys?: Set<string>, conflictKeys?: Set<string>
         * }>}} */
        const report = { sourceId: config.sourceId, mode: apply ? 'apply' : 'plan', tables: {} };
        const blocked = new Set();
        const parentConflicts = new Map();
        for (const table of TABLES) {
            if (table === 's3_object_index' && blocked.has('s3_object_versions') ||
                !table.startsWith('s3_') && (blocked.has('s3_object_versions') || blocked.has('s3_object_index'))) {
                report.tables[table] = { skipped: 'parent-conflict' }; blocked.add(table); continue;
            }
            // Media synchronization is explicit: no dangling index is imported by default.
            if (table.startsWith('s3_') && !config.media) {
                report.tables[table] = { skipped: 'media-not-configured' }; blocked.add(table); continue;
            }
            report.tables[table] = await mergeTable(stage, target, table, {
                apply, hasState, sourceId: config.sourceId, verifyMedia, actor: config.previewActorAccountId,
                preserveMediaKeys: config.preserveMediaKeys || [], parentConflicts
            });
            if (report.tables[table].conflict) {
                blocked.add(table);
                parentConflicts.set(table, report.tables[table].conflictKeys);
            }
            if (apply) for (const column of await metadata(target, table)) if (column.sequence) {
                // Never lower an allocator after explicit legacy-ID inserts.
                await target.query(`SELECT setval($1::regclass, GREATEST(
                    (SELECT COALESCE(max(${quote(column.name)}),1) FROM ${relation(table)}),
                    (SELECT last_value FROM ${column.sequence.split('.').map(quote).join('.')})),true)`, [column.sequence]);
            }
        }
        if (!blocked.has('site_packages') && !blocked.has('site_package_revisions')) {
            report.tables.site_package_publications = await mergeTable(stage, target, 'site_packages', {
                apply, hasState, sourceId: config.sourceId, stateTable: 'site_package_publications',
                fields: ['id', 'published_revision_id'], bootstrapKeys: report.tables.site_packages.insertedKeys
            });
        } else {
            report.tables.site_package_publications = { skipped: 'parent-conflict' };
        }
        if (apply) {
            await target.query(`SELECT setval('public.namecard_number_seq', GREATEST(
                (SELECT COALESCE(max(card_number),1) FROM public.fudaba_cards),
                (SELECT last_value FROM public.namecard_number_seq)),true)`);
        }
        await target.query('COMMIT');
        await stage.query('COMMIT');
        if (verifyMedia.stats) report.media = { ...verifyMedia.stats };
        return report;
    } finally {
        verifyMedia?.destroy?.();
        await Promise.all(clients.map((client) => client.end().catch(() => undefined)));
        fs.rmSync(directory, { recursive: true, force: true });
    }
}

if (require.main === module) {
    const args = process.argv.slice(2);
    const filename = args[0];
    if (!filename || args.slice(1).some((arg) => arg !== '--apply')) {
        console.error('Usage: node preview-data-sync.js /private/config.json [--apply]');
        process.exitCode = 1;
    } else {
        Promise.resolve().then(() => {
            if ((fs.statSync(filename).mode & 0o077) !== 0) throw new Error('Config must have mode 0600');
            return run(JSON.parse(fs.readFileSync(filename, 'utf8')), args.includes('--apply'));
        }).then((report) => {
            console.log(JSON.stringify(report, null, 2));
            if (Object.values(report.tables).some((table) => table.conflict || table.deleted || table.skipped === 'parent-conflict')) process.exitCode = 2;
        }).catch(() => {
            // PostgreSQL/AWS errors can contain credentials, submitted text or row data.
            console.error('Preview sync failed; transaction rolled back. Check configuration, schema compatibility and connectivity.');
            process.exitCode = 1;
        });
    }
}

module.exports = { TABLES, decision, validateConfig, mergeTable, ensureState, run };
