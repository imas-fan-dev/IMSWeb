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

const LATEST_MIGRATION = '20260816193000_namecard_ownership_foundation.sql';

test('namecard ownership migration preserves historical rows as legacy', async (t) => {
    const migrationSource = path.resolve(__dirname, '../../migrations/postgresql');
    const previousCatalog = await fs.mkdtemp(
        path.join(os.tmpdir(), 'imsweb-namecard-previous-')
    );
    t.after(() => fs.rm(previousCatalog, { recursive: true, force: true }));
    for (const filename of await fs.readdir(migrationSource)) {
        if (!filename.endsWith('.sql') || filename === LATEST_MIGRATION) continue;
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
    await harness.connection.prepare(
        `INSERT INTO platform_accounts
            (id, status, token_version, created_at, updated_at, deleted_at)
         VALUES ('migration-owner', 'active', 0, 1, 1, NULL)`
    ).run();
    const legacy = await harness.connection.prepare(
        `INSERT INTO cards
            (image1_url, image2_url, hash1, hash2, ip, status,
             withdrawal_token_hash, revision)
         VALUES ('legacy/front.webp', 'legacy/back.webp', 'legacy-front',
                 'legacy-back', '127.0.0.1', 'approved', ?, 0)
         RETURNING id`
    ).bind('a'.repeat(64)).first<{ id: number }>();
    if (!legacy) throw new Error('Legacy fixture was not inserted');
    await harness.connection.prepare(
        `INSERT INTO fudaba_cards
            (id, owner_account_id, producer_name, display_name, series_code,
             favorite_idol, front_object_key, back_object_key, accent, bio,
             trade_note, available, source_url, source_label, source_credit,
             media_rights_status, publication_status, revision, created_at,
             updated_at, deleted_at)
         VALUES ('migration-fudaba', 'migration-owner', 'Producer', 'Card',
                 '765', '', 'migration/front.webp', 'migration/back.webp',
                 '#4f64dd', '', '', TRUE, NULL, NULL, NULL, 'approved',
                 'published', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL)`
    ).run();

    await migratePostgres({ connectionString: harness.databaseUrl });

    const migrated = await harness.connection.prepare(
        `SELECT series_code, submission_kind
         FROM cards WHERE id=?`
    ).bind(legacy.id).first<{
        series_code: string | null;
        submission_kind: string;
    }>();
    assert.deepEqual(migrated, {
        series_code: null,
        submission_kind: 'legacy'
    });
    const guest = await harness.connection.prepare(
        `INSERT INTO cards
            (image1_url, image2_url, hash1, hash2, ip, status,
             withdrawal_token_hash, revision)
         VALUES ('guest/front.webp', 'guest/back.webp', 'guest-front',
                 'guest-back', '127.0.0.1', 'pending', ?, 0)
         RETURNING submission_kind`
    ).bind('b'.repeat(64)).first<{ submission_kind: string }>();
    assert.equal(guest?.submission_kind, 'guest');
    const fudaba = await harness.connection.prepare(
        `UPDATE fudaba_cards SET publication_status='approving'
         WHERE id='migration-fudaba'
         RETURNING publication_status, legacy_card_id`
    ).first<{ publication_status: string; legacy_card_id: number | null }>();
    assert.deepEqual(fudaba, {
        publication_status: 'approving',
        legacy_card_id: null
    });
    const relations = await harness.connection.prepare(
        `SELECT to_regclass('public.namecard_idols') AS namecard_idols,
                to_regclass('public.fudaba_card_idols') AS fudaba_card_idols,
                to_regclass('public.fudaba_card_claims') AS claims,
                to_regclass('public.fudaba_claim_envelopes') AS envelopes`
    ).first<Record<string, string | null>>();
    assert.deepEqual(relations, {
        namecard_idols: 'namecard_idols',
        fudaba_card_idols: 'fudaba_card_idols',
        claims: 'fudaba_card_claims',
        envelopes: 'fudaba_claim_envelopes'
    });
});
