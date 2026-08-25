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

const UNIFICATION_MIGRATION = '20260819000000_namecard_unification_foundation.sql';

test('namecard unification migration folds legacy cards into one table', async (t) => {
    const migrationSource = path.resolve(__dirname, '../../migrations/postgresql');
    const previousCatalog = await fs.mkdtemp(
        path.join(os.tmpdir(), 'imsweb-namecard-unification-')
    );
    t.after(() => fs.rm(previousCatalog, { recursive: true, force: true }));
    for (const filename of await fs.readdir(migrationSource)) {
        if (!filename.endsWith('.sql') || filename >= UNIFICATION_MIGRATION) continue;
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
         VALUES ('unification-owner', 'active', 0, 1, 1, NULL)`
    ).run();

    const approved = await harness.connection.prepare(
        `INSERT INTO cards
            (image1_url, image2_url, hash1, hash2, ip, status,
             withdrawal_token_hash, revision, series_code, submission_kind)
         VALUES ('/uploads/namecard/original/card-7-front.PNG',
                 '/uploads/namecard/original/card-7-back.jpg',
                 'front-hash', 'back-hash', '203.0.113.7', 'approved',
                 NULL, 3, NULL, 'legacy')
         RETURNING id`
    ).first<{ id: number }>();
    const guest = await harness.connection.prepare(
        `INSERT INTO cards
            (image1_url, image2_url, hash1, hash2, ip, status,
             withdrawal_token_hash, revision, series_code, submission_kind)
         VALUES ('/uploads/namecard/original/card-8-front.webp',
                 '/uploads/namecard/original/card-8-back.webp',
                 'guest-front', 'guest-back', '203.0.113.8', 'pending',
                 ?, 0, '765', 'guest')
         RETURNING id`
    ).bind('c'.repeat(64)).first<{ id: number }>();
    if (!approved || !guest) throw new Error('Legacy fixtures were not inserted');

    for (const [cardId, emoji, count] of [
        [approved.id, '🌸', 4],
        [approved.id, '🎤', 1],
        [guest.id, '🌸', 2]
    ] as const) {
        await harness.connection
            .prepare('INSERT INTO card_emojis (card_id, emoji, count) VALUES (?, ?, ?)')
            .bind(cardId, emoji, count)
            .run();
    }

    await harness.connection.prepare(
        `INSERT INTO fudaba_cards
            (id, owner_account_id, producer_name, display_name, series_code,
             favorite_idol, front_object_key, back_object_key, accent, bio,
             trade_note, available, source_url, source_label, source_credit,
             media_rights_status, publication_status, revision, created_at,
             updated_at, deleted_at)
         VALUES ('unification-exchange', 'unification-owner', 'Producer', 'Card',
                 '765', '', 'exchange/front.webp', 'exchange/back.webp',
                 '#4f64dd', '', '', TRUE, NULL, NULL, NULL, 'approved',
                 'published', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL)`
    ).run();

    await migratePostgres({ connectionString: harness.databaseUrl });

    const migratedApproved = await harness.connection.prepare(
        `SELECT card_number, origin, series_code, publication_status,
                front_object_key, back_object_key, available, revision,
                owner_account_id, producer_name, media_rights_status
         FROM fudaba_cards WHERE id=?`
    ).bind(`legacy-${approved.id}`).first<Record<string, unknown>>();
    assert.deepEqual(migratedApproved, {
        card_number: approved.id,
        origin: 'legacy',
        series_code: null,
        publication_status: 'published',
        front_object_key: 'community/namecards/assets/card-7-front/image.png',
        back_object_key: 'community/namecards/assets/card-7-back/image.jpg',
        available: false,
        revision: 3,
        owner_account_id: null,
        producer_name: null,
        media_rights_status: 'approved'
    });

    const migratedGuest = await harness.connection.prepare(
        `SELECT origin, series_code, publication_status
         FROM fudaba_cards WHERE id=?`
    ).bind(`legacy-${guest.id}`).first<Record<string, unknown>>();
    assert.deepEqual(migratedGuest, {
        origin: 'guest',
        series_code: '765',
        publication_status: 'pending'
    });

    const guestAttributes = await harness.connection.prepare(
        `SELECT hash1, hash2, submitted_ip, withdrawal_token_hash
         FROM namecard_guest_attributes WHERE card_id=?`
    ).bind(`legacy-${guest.id}`).first<Record<string, unknown>>();
    assert.deepEqual(guestAttributes, {
        hash1: 'guest-front',
        hash2: 'guest-back',
        submitted_ip: '203.0.113.8',
        withdrawal_token_hash: 'c'.repeat(64)
    });

    const reactions = await harness.connection.prepare(
        `SELECT card_id, emoji, count FROM namecard_reactions
         ORDER BY card_id, emoji`
    ).all<{ card_id: string; emoji: string; count: number }>();
    assert.deepEqual(reactions.results, [
        { card_id: `legacy-${approved.id}`, emoji: '🌸', count: 4 },
        { card_id: `legacy-${approved.id}`, emoji: '🎤', count: 1 },
        { card_id: `legacy-${guest.id}`, emoji: '🌸', count: 2 }
    ]);

    const exchange = await harness.connection.prepare(
        `SELECT origin, card_number FROM fudaba_cards WHERE id='unification-exchange'`
    ).first<{ origin: string; card_number: string }>();
    assert.equal(exchange?.origin, 'exchange');
    assert.equal(Number(exchange?.card_number) > guest.id, true);

    await assert.rejects(
        harness.connection.prepare(
            `INSERT INTO fudaba_cards
                (id, origin, front_object_key, back_object_key, producer_name,
                 media_rights_status, publication_status, created_at, updated_at)
             VALUES ('half-filled', 'guest', 'half/front.webp', 'half/back.webp',
                     'Producer', 'unknown', 'pending', CURRENT_TIMESTAMP,
                     CURRENT_TIMESTAMP)`
        ).run(),
        /fudaba_cards_owner_layer_check/,
        'a card without an owner must not carry owner-only fields'
    );
});
