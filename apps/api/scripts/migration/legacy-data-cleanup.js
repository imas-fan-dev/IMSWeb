'use strict';

// Delete only reconciled migration inputs. Canonical tables, compatibility views,
// object storage and legacy cards still referenced by FKs are not cleanup inputs.
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { Client } = require('pg');
const { readMigrations } = require('./postgres-migrations');
const { command } = require('./preview-data-sync');

const STORIES = [
    '765_stories',
    '876_stories',
    'cg_stories',
    'ml_stories',
    'sidem_stories',
    'sc_stories',
    'gk_stories'
];
const SCOPES = ['stories', 'favorites', 'emojis'];
const PROTECTED = [
    'catalog_characters',
    'catalog_character_project_profiles',
    'catalog_groups',
    'catalog_group_project_profiles',
    'catalog_group_members',
    'wiki_entries',
    'wiki_navigation_groups',
    'wiki_navigation_group_entries',
    'wiki_entry_categories',
    'wiki_story_cards',
    'wiki_story_links',
    'fudaba_cards',
    'fudaba_card_favorite_characters',
    'fudaba_card_claim_favorite_characters',
    'fudaba_card_claims',
    'fudaba_claim_envelopes',
    'cards',
    'card_emojis',
    'namecard_reactions'
];
const quote = (name) => '"' + name.replaceAll('"', '""') + '"';

async function canonicalSnapshot(client, emojiKeys = []) {
    const result = {};
    for (const table of PROTECTED)
        result[table] = (
            await client.query(
                `SELECT count(*)::text AS count,md5(COALESCE(string_agg(to_jsonb(t)::text,E'\n' ORDER BY to_jsonb(t)::text),'')) AS hash FROM public.${quote(table)} t${table === 'card_emojis' ? ' WHERE NOT(id=ANY($1::bigint[]))' : ''}`,
                table === 'card_emojis' ? [emojiKeys] : []
            )
        ).rows[0];
    return result;
}

async function cleanupPlan(client, scopes = SCOPES) {
    /** @type {{ stories: Record<string,{keys: string[],blocked: string[]}>, favorites: {keys: Array<{card_id: string,character_id: string}>,blocked: Array<{card_id: string,character_id: string}>},emojis: {keys: string[],blocked: Array<{id: string,cardId: string,emoji: string,reason: string,oldCount: number | null,currentCount: number | null}>},retainedCards: number }} */
    const plan = {
        stories: {},
        favorites: { keys: [], blocked: [] },
        emojis: { keys: [], blocked: [] },
        retainedCards: 0
    };
    for (const table of scopes.includes('stories') ? STORIES : []) {
        const rows = (
            await client.query(
                `SELECT s.id::text AS id,
            (l.id IS NOT NULL AND p.code=$2 AND c.idol_id=s.idol_id AND c.card_name=s.card_name AND category.name=s.category
                AND l.url IS NOT DISTINCT FROM s.url AND l.up_name IS NOT DISTINCT FROM s.up_name
                AND l.video_title IS NOT DISTINCT FROM s.video_title
                AND l.legacy_subtitle IS NOT DISTINCT FROM s.subtitle AND l.legacy_image_file IS NOT DISTINCT FROM s.image_file) AS reconciled
            FROM public.${quote(table)} s LEFT JOIN wiki_story_links l ON l.legacy_table=$1 AND l.legacy_id=s.id
            LEFT JOIN wiki_story_cards c ON c.id=l.card_id AND c.agency_id=l.agency_id
            LEFT JOIN projects p ON p.id=c.agency_id LEFT JOIN wiki_categories category ON category.id=c.category_id`,
                [table, table.slice(0, -'_stories'.length)]
            )
        ).rows;
        plan.stories[table] = {
            keys: rows.filter((row) => row.reconciled).map((row) => row.id),
            blocked: rows.filter((row) => !row.reconciled).map((row) => row.id)
        };
    }
    const favorites = scopes.includes('favorites')
        ? (
              await client.query(`SELECT old.card_id::text AS card_id,old.character_id::text AS character_id,
        EXISTS(SELECT 1 FROM fudaba_cards c JOIN fudaba_card_favorite_characters current ON current.card_id=c.id
            WHERE c.card_number=old.card_id AND current.character_id=old.character_id AND current.display_order=old.display_order) AS reconciled
        FROM namecard_favorite_characters old`)
          ).rows
        : [];
    for (const row of favorites)
        plan.favorites[row.reconciled ? 'keys' : 'blocked'].push({
            card_id: row.card_id,
            character_id: row.character_id
        });
    if (scopes.includes('emojis')) {
        const rows = (
            await client.query(`SELECT old.id::text AS id,old.card_id::text AS card_id,old.emoji,
            old.count AS old_count,archive.id IS NOT NULL AS archive_exists,card.id AS canonical_card_id,current.count AS current_count
            FROM card_emojis old LEFT JOIN cards archive ON archive.id=old.card_id
            LEFT JOIN fudaba_cards card ON card.card_number=old.card_id
            LEFT JOIN namecard_reactions current ON current.card_id=card.id AND current.emoji=old.emoji ORDER BY old.id`)
        ).rows;
        for (const row of rows) {
            const reason = !row.archive_exists
                ? 'orphan-legacy-card'
                : !row.canonical_card_id
                  ? 'missing-canonical-card'
                  : row.old_count === null || row.old_count <= 0
                    ? 'nonpositive-legacy-count'
                    : row.current_count === null
                      ? 'missing-current-counter'
                      : row.current_count !== row.old_count
                        ? 'counter-changed'
                        : null;
            if (reason)
                plan.emojis.blocked.push({
                    id: row.id,
                    cardId: row.card_id,
                    emoji: row.emoji,
                    reason,
                    oldCount: row.old_count,
                    currentCount: row.current_count
                });
            else plan.emojis.keys.push(row.id);
        }
    }
    plan.retainedCards = Number(
        (await client.query('SELECT count(*)::text AS count FROM cards'))
            .rows[0].count
    );
    return plan;
}

async function cleanupLegacyData({
    connectionString,
    confirmTargetDatabase,
    backupDirectory,
    apply = false,
    verifiedOnly = false,
    scopes = SCOPES,
    dumpBinary = 'pg_dump'
}) {
    if (
        !Array.isArray(scopes) ||
        !scopes.length ||
        new Set(scopes).size !== scopes.length ||
        scopes.some((scope) => !SCOPES.includes(scope))
    )
        throw new Error('Unsupported or duplicate cleanup scope');
    if (
        typeof connectionString !== 'string' ||
        !/^postgres(?:ql)?:\/\//.test(connectionString)
    )
        throw new Error('An explicit PostgreSQL connectionString is required');
    const client = new Client({
        connectionString,
        application_name: 'imsweb-legacy-data-cleanup',
        connectionTimeoutMillis: 10000
    });
    await client.connect();
    try {
        await client.query(apply ? 'BEGIN' : 'BEGIN READ ONLY');
        await client.query("SET LOCAL lock_timeout='5s'");
        await client.query(
            "SELECT pg_advisory_xact_lock(hashtext('imsweb-preview-data-sync'))"
        );
        await client.query(
            "SELECT pg_advisory_xact_lock(hashtext('imsweb-schema-migration'))"
        );
        const database = (
            await client.query('SELECT current_database() AS name')
        ).rows[0].name;
        if (apply && confirmTargetDatabase !== database)
            throw new Error(
                'confirmTargetDatabase must match the actual database'
            );
        const migrations = readMigrations();
        const ledger = (
            await client.query(
                'SELECT version,checksum FROM ims_schema_migrations'
            )
        ).rows;
        if (
            ledger.length !== migrations.length ||
            migrations.some(
                (migration) =>
                    !ledger.some(
                        (row) =>
                            row.version === migration.version &&
                            row.checksum === migration.checksum
                    )
            )
        ) {
            throw new Error(
                'Apply and verify the complete current migration catalog before cleanup'
            );
        }
        const sources = [
            ...(scopes.includes('stories') ? STORIES : []),
            ...(scopes.includes('favorites')
                ? ['namecard_favorite_characters']
                : []),
            ...(scopes.includes('emojis') ? ['card_emojis'] : [])
        ];
        const sourceTables = (
            await client.query(
                `SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
            WHERE n.nspname='public' AND c.relkind='r' AND c.relname=ANY($1::text[])`,
                [sources]
            )
        ).rows;
        if (sourceTables.length !== sources.length)
            throw new Error(
                'Cleanup requires the exact physical legacy tables, never compatibility views'
            );
        if (apply)
            await client.query(
                `LOCK TABLE ${Array.from(new Set([...sources, ...PROTECTED]))
                    .map((table) => `public.${quote(table)}`)
                    .join(',')} IN SHARE ROW EXCLUSIVE MODE`
            );
        if (scopes.includes('emojis')) {
            const references = (
                await client.query(
                    "SELECT conname FROM pg_constraint WHERE contype='f' AND confrelid='public.card_emojis'::regclass"
                )
            ).rows;
            if (references.length)
                throw new Error(
                    'Legacy emoji rows have incoming foreign keys; cleanup stopped'
                );
            const guard = (
                await client.query(
                    "SELECT tgenabled FROM pg_trigger WHERE tgrelid='public.card_emojis'::regclass AND tgname='card_emojis_read_only'"
                )
            ).rows[0];
            if (!guard || guard.tgenabled !== 'O')
                throw new Error(
                    'Legacy emoji archive guard must be enabled before cleanup'
                );
        }
        const plan = await cleanupPlan(client, scopes);
        const blocked = Object.values(plan.stories).reduce(
            (sum, table) => sum + table.blocked.length,
            plan.favorites.blocked.length + plan.emojis.blocked.length
        );
        /** @type {{ applied: boolean,blocked: number,deleted: Record<string,number>,retainedCards: number,retainedReason: string,plan: Awaited<ReturnType<typeof cleanupPlan>>,backup: string | null,canonicalDataUnchanged: boolean }} */
        const report = {
            applied: apply,
            blocked,
            deleted: {},
            retainedCards: plan.retainedCards,
            retainedReason:
                'Legacy cards remain protected; only exactly reconciled source rows in the requested scopes may be deleted',
            plan,
            backup: null,
            canonicalDataUnchanged: false
        };
        if (apply) {
            if (blocked && !verifiedOnly)
                throw new Error(
                    `Cleanup blocked: ${blocked} legacy rows are not exactly reconciled; no data was deleted`
                );
            if (!backupDirectory || !path.isAbsolute(backupDirectory))
                throw new Error(
                    'An absolute backupDirectory is required before cleanup'
                );
            fs.mkdirSync(backupDirectory, { recursive: true, mode: 0o700 });
            const backup = path.join(
                backupDirectory,
                `legacy-before-cleanup-${randomUUID()}.dump`
            );
            fs.closeSync(fs.openSync(backup, 'wx', 0o600));
            await command(
                dumpBinary,
                [
                    '--format=custom',
                    '--no-owner',
                    '--no-privileges',
                    '--file',
                    backup
                ],
                connectionString
            );
            if (!fs.statSync(backup).size)
                throw new Error('Backup is empty; cleanup stopped');
            const before = await canonicalSnapshot(client, plan.emojis.keys);
            for (const table of Object.keys(plan.stories)) {
                const keys = plan.stories[table].keys;
                const result = await client.query(
                    `DELETE FROM public.${quote(table)} WHERE id=ANY($1::bigint[])`,
                    [keys]
                );
                if (result.rowCount !== keys.length)
                    throw new Error('Legacy story rows changed during cleanup');
                report.deleted[table] = result.rowCount;
            }
            if (scopes.includes('favorites')) {
                const result = await client.query(
                    `DELETE FROM namecard_favorite_characters old USING
                jsonb_to_recordset($1::jsonb) keys(card_id bigint,character_id bigint)
                WHERE old.card_id=keys.card_id AND old.character_id=keys.character_id`,
                    [JSON.stringify(plan.favorites.keys)]
                );
                if (result.rowCount !== plan.favorites.keys.length)
                    throw new Error(
                        'Legacy favorite rows changed during cleanup'
                    );
                report.deleted.namecard_favorite_characters = result.rowCount;
            }
            if (scopes.includes('emojis')) {
                if (plan.emojis.keys.length) {
                    await client.query(`CREATE SCHEMA IF NOT EXISTS legacy_cleanup;
                        CREATE TABLE IF NOT EXISTS legacy_cleanup.emoji_receipts (
                            legacy_id bigint PRIMARY KEY,legacy_card_id bigint NOT NULL,emoji text NOT NULL,
                            legacy_count integer NOT NULL CHECK(legacy_count>0),canonical_card_id text NOT NULL,
                            canonical_count integer NOT NULL CHECK(canonical_count=legacy_count),
                            backup_file text NOT NULL,cleaned_at timestamptz NOT NULL DEFAULT now(),UNIQUE(legacy_card_id,emoji)
                        )`);
                    const receipts = await client.query(
                        `INSERT INTO legacy_cleanup.emoji_receipts
                        (legacy_id,legacy_card_id,emoji,legacy_count,canonical_card_id,canonical_count,backup_file)
                        SELECT old.id,old.card_id,old.emoji,old.count,card.id,current.count,$2
                        FROM card_emojis old JOIN fudaba_cards card ON card.card_number=old.card_id
                        JOIN namecard_reactions current ON current.card_id=card.id AND current.emoji=old.emoji
                        WHERE old.id=ANY($1::bigint[]) AND old.count>0 AND current.count=old.count`,
                        [plan.emojis.keys, backup]
                    );
                    if (receipts.rowCount !== plan.emojis.keys.length)
                        throw new Error(
                            'Legacy emoji counters changed before receipt creation'
                        );
                    await client.query(
                        'ALTER TABLE card_emojis DISABLE TRIGGER card_emojis_read_only'
                    );
                    const deleted = await client.query(
                        'DELETE FROM card_emojis WHERE id=ANY($1::bigint[])',
                        [plan.emojis.keys]
                    );
                    if (deleted.rowCount !== plan.emojis.keys.length)
                        throw new Error(
                            'Legacy emoji rows changed during cleanup'
                        );
                    await client.query(
                        'ALTER TABLE card_emojis ENABLE TRIGGER card_emojis_read_only'
                    );
                    report.deleted.card_emojis = deleted.rowCount;
                } else report.deleted.card_emojis = 0;
            }
            if (
                JSON.stringify(before) !==
                JSON.stringify(
                    await canonicalSnapshot(client, plan.emojis.keys)
                )
            )
                throw new Error('Canonical data changed; cleanup rolled back');
            report.backup = backup;
            report.canonicalDataUnchanged = true;
        }
        await client.query(apply ? 'COMMIT' : 'ROLLBACK');
        return report;
    } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw error;
    } finally {
        await client.end();
    }
}

if (require.main === module) {
    const args = process.argv.slice(2);
    Promise.resolve()
        .then(() => {
            if (
                !args[0] ||
                args
                    .slice(1)
                    .some(
                        (arg) =>
                            !['--apply', '--verified-only'].includes(arg) &&
                            !arg.startsWith('--scope=')
                    )
            )
                throw new Error(
                    'Usage: node legacy-data-cleanup.js /private/config.json [--apply] [--verified-only] [--scope=stories,favorites,emojis]'
                );
            const scopeArguments = args
                .slice(1)
                .filter((arg) => arg.startsWith('--scope='));
            if (scopeArguments.length > 1)
                throw new Error('Specify cleanup scope once');
            if ((fs.statSync(args[0]).mode & 0o077) !== 0)
                throw new Error('Config must have mode 0600');
            const config = JSON.parse(fs.readFileSync(args[0], 'utf8'));
            return cleanupLegacyData({
                connectionString: config.target,
                confirmTargetDatabase: config.confirmTargetDatabase,
                backupDirectory: config.backupDirectory,
                apply: args.includes('--apply'),
                verifiedOnly: args.includes('--verified-only'),
                scopes: scopeArguments.length
                    ? scopeArguments[0].slice('--scope='.length).split(',')
                    : SCOPES
            });
        })
        .then((report) => {
            console.log(JSON.stringify(report, null, 2));
            if (report.blocked) process.exitCode = 2;
        })
        .catch(() => {
            console.error(
                'Legacy cleanup failed; no cleanup transaction was committed. Review the plan, migration catalog, target confirmation and backup configuration.'
            );
            process.exitCode = 1;
        });
}
module.exports = { cleanupLegacyData, cleanupPlan };
