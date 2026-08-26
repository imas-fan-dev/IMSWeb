import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { seedCanonicalFudabaAgencies } from '../integration/fudaba-agency-fixture';
import { createPostgresTestHarness } from '../integration/postgres-harness';

const require = createRequire(__filename);
const { migratePostgres } = require('../../scripts/migration/postgres-migrations.js') as {
    migratePostgres(options: {
        connectionString: string;
        migrationsPath?: string;
    }): Promise<unknown>;
};

const RECONCILIATION_MIGRATION =
    '20260821000000_namecard_reaction_reconciliation.sql';

test('namecard reaction reconciliation resyncs namecard_reactions from card_emojis drift', async (t) => {
    const migrationSource = path.resolve(__dirname, '../../migrations/postgresql');
    const previousCatalog = await fs.mkdtemp(
        path.join(os.tmpdir(), 'imsweb-namecard-reaction-reconciliation-')
    );
    t.after(() => fs.rm(previousCatalog, { recursive: true, force: true }));
    for (const filename of await fs.readdir(migrationSource)) {
        if (!filename.endsWith('.sql') || filename >= RECONCILIATION_MIGRATION) continue;
        await fs.copyFile(
            path.join(migrationSource, filename),
            path.join(previousCatalog, filename)
        );
    }

    const harness = await createPostgresTestHarness({
        migrationsPath: previousCatalog,
        seedCanonicalAgencies: false
    });
    t.after(() => harness.close());
    await seedCanonicalFudabaAgencies(harness.connection);

    // A legacy card whose unified row was already backfilled by the
    // unification foundation migration (this simulates the historical
    // state -- both catalogs already include that migration).
    const legacy = await harness.connection.prepare(
        `INSERT INTO cards
            (image1_url, image2_url, hash1, hash2, ip, status,
             withdrawal_token_hash, revision)
         VALUES ('/uploads/namecard/original/reconcile-front.webp',
                 '/uploads/namecard/original/reconcile-back.webp',
                 'reconcile-front', 'reconcile-back', '127.0.0.1', 'approved',
                 NULL, 0)
         RETURNING id`
    ).first<{ id: number }>();
    if (!legacy) throw new Error('Legacy fixture was not inserted');
    const unifiedId = `legacy-${legacy.id}`;
    await harness.connection.prepare(
        `INSERT INTO fudaba_cards
            (id, card_number, origin, front_object_key, back_object_key,
             trade_note, available, media_rights_status, publication_status,
             revision, created_at, updated_at)
         VALUES (?, ?, 'legacy',
                 'community/namecards/assets/reconcile-front/image.webp',
                 'community/namecards/assets/reconcile-back/image.webp',
                 NULL, FALSE, 'approved', 'published', 0,
                 CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
    ).bind(unifiedId, legacy.id).run();

    // namecard_reactions still holds the stage-1 backfill snapshot.
    await harness.connection.prepare(
        `INSERT INTO namecard_reactions (card_id, emoji, count)
         VALUES (?, '🌸', 3)`
    ).bind(unifiedId).run();

    // card_emojis kept receiving writes afterward: the shared emoji grew,
    // a new emoji appeared, and the stale reaction is gone from the source.
    await harness.connection.prepare(
        `INSERT INTO card_emojis (card_id, emoji, count)
         VALUES (?, '🌸', 9), (?, '🎤', 2)`
    ).bind(legacy.id, legacy.id).run();

    await migratePostgres({ connectionString: harness.databaseUrl });

    const reactions = await harness.connection.prepare(
        `SELECT emoji, count FROM namecard_reactions
         WHERE card_id=? ORDER BY emoji`
    ).bind(unifiedId).all<{ emoji: string; count: number }>();
    assert.deepEqual(reactions.results, [
        { emoji: '🌸', count: 9 },
        { emoji: '🎤', count: 2 }
    ]);

    const applied = await harness.connection.prepare(
        `SELECT version FROM ims_schema_migrations
         WHERE version=?`
    ).bind('20260821000000_namecard_reaction_reconciliation')
        .first<{ version: string }>();
    assert.ok(applied, 'the reconciliation migration recorded itself as applied');
});
