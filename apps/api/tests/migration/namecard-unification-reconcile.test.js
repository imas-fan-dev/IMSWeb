'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
    isClean,
    legacyMediaObjectKey,
    reconcile,
    summarize
} = require('../../scripts/migration/namecard-unification-reconcile.js');
const {
    createPostgresTestHarness,
    postgresIntegrationEnabled
} = require('../integration/postgres-harness.ts');

function poolClient(harness) {
    // The reconcile() function only ever issues plain read queries, so a
    // bare `pg` client through the harness connection string is enough --
    // no need to route through the application's own SqlDatabase port.
    const { Client } = require('pg');
    return new Client({ connectionString: harness.databaseUrl });
}

async function insertLegacyCard(client, id, overrides = {}) {
    const values = {
        image1_url: `/uploads/namecard/original/card-${id}-front.png`,
        image2_url: `/uploads/namecard/original/card-${id}-back.jpg`,
        hash1: `hash-${id}-1`,
        hash2: `hash-${id}-2`,
        ip: '127.0.0.1',
        status: 'approved',
        withdrawal_token_hash: null,
        series_code: null,
        submission_kind: 'legacy',
        revision: 0,
        ...overrides
    };
    await client.query(
        `INSERT INTO public.cards
            (id, image1_url, image2_url, hash1, hash2, ip, status,
             withdrawal_token_hash, series_code, submission_kind, revision)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
            id, values.image1_url, values.image2_url, values.hash1,
            values.hash2, values.ip, values.status,
            values.withdrawal_token_hash, values.series_code,
            values.submission_kind, values.revision
        ]
    );
    // Keep the id spaces disjoint the same way the real migration does, so a
    // later default-assigned fudaba_cards.card_number cannot collide with a
    // legacy id inserted directly by this fixture.
    await client.query(
        `SELECT setval(
            pg_get_serial_sequence('public.cards', 'id'),
            GREATEST($1::bigint, (SELECT last_value FROM public.cards_id_seq))
         )`,
        [id]
    );
}

// A soft-deleted row anchors created_at/updated_at to the caller's deleted_at
// instead of CURRENT_TIMESTAMP: the caller's clock necessarily reads earlier
// than the server's timestamp at INSERT time, which would trip
// fudaba_cards' CHECK (deleted_at IS NULL OR deleted_at >= created_at).
async function insertUnifiedCompatCard(client, id, cardNumber, overrides = {}) {
    const values = {
        origin: 'legacy',
        front_object_key: legacyMediaObjectKey(
            `/uploads/namecard/original/card-${cardNumber}-front.png`
        ),
        back_object_key: legacyMediaObjectKey(
            `/uploads/namecard/original/card-${cardNumber}-back.jpg`
        ),
        publication_status: 'published',
        legacy_card_id: null,
        deleted_at: null,
        ...overrides
    };
    await client.query(
        `INSERT INTO public.fudaba_cards
            (id, card_number, origin, producer_name, display_name,
             series_code, favorite_idol, accent, bio, trade_note,
             front_object_key, back_object_key, available,
             media_rights_status, publication_status, legacy_card_id,
             revision, created_at, updated_at, deleted_at)
         VALUES ($1, $2, $3, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
                 $4, $5, FALSE, 'approved', $6, $7, 0,
                 COALESCE($8::timestamptz, CURRENT_TIMESTAMP),
                 COALESCE($8::timestamptz, CURRENT_TIMESTAMP), $8)`,
        [
            id, cardNumber, values.origin, values.front_object_key,
            values.back_object_key, values.publication_status,
            values.legacy_card_id, values.deleted_at
        ]
    );
    await client.query(
        `SELECT setval(
            'public.namecard_number_seq',
            GREATEST($1::bigint, (SELECT last_value FROM public.namecard_number_seq))
         )`,
        [cardNumber]
    );
}

test('namecard unification reconciliation reports clean state for matching tables', {
    skip: !postgresIntegrationEnabled()
}, async (t) => {
    const harness = await createPostgresTestHarness();
    const client = poolClient(harness);
    await client.connect();
    t.after(async () => {
        await client.end();
        await harness.close();
    });
    // The namecard_legacy_tables_read_only migration locks cards/card_emojis
    // down for the application; fixtures simulating pre-existing legacy data
    // have to bypass that guard the same way real legacy data predates it.
    await client.query('ALTER TABLE public.cards DISABLE TRIGGER ALL');
    await client.query('ALTER TABLE public.card_emojis DISABLE TRIGGER ALL');

    await insertLegacyCard(client, 1);
    await insertUnifiedCompatCard(client, 'legacy-1', 1);
    await client.query(
        `INSERT INTO public.card_emojis (card_id, emoji, count) VALUES (1, '🌸', 4)`
    );
    await client.query(
        `INSERT INTO public.namecard_reactions (card_id, emoji, count)
         VALUES ('legacy-1', '🌸', 4)`
    );

    const result = await reconcile(client);
    const summary = summarize(
        {
            legacyCards: 1,
            unifiedCompatCards: 1,
            legacyReactionRows: 1,
            unifiedReactionRows: 1
        },
        result
    );
    assert.equal(isClean(summary), true);
    assert.deepEqual(result.missingFromUnified, []);
    assert.deepEqual(result.missingFromLegacy, []);
    assert.deepEqual(result.statusMismatches, []);
    assert.deepEqual(result.mediaMismatches, []);
    assert.deepEqual(result.reactionDrift, []);
    assert.deepEqual(result.reactionOnlyOnUnifiedSide, []);
    assert.deepEqual(result.orphanedLegacyReactionRows, []);
});

test('namecard unification reconciliation surfaces every drift category', {
    skip: !postgresIntegrationEnabled()
}, async (t) => {
    const harness = await createPostgresTestHarness();
    const client = poolClient(harness);
    await client.connect();
    t.after(async () => {
        await client.end();
        await harness.close();
    });
    // The namecard_legacy_tables_read_only migration locks cards/card_emojis
    // down for the application; fixtures simulating pre-existing legacy data
    // have to bypass that guard the same way real legacy data predates it.
    await client.query('ALTER TABLE public.cards DISABLE TRIGGER ALL');
    await client.query('ALTER TABLE public.card_emojis DISABLE TRIGGER ALL');

    // 1. A legacy row with no unified counterpart at all.
    await insertLegacyCard(client, 1);

    // 2. A unified compat row with no legacy counterpart.
    await insertUnifiedCompatCard(client, 'legacy-2', 2);

    // 3. A status mismatch: legacy says approved/published, unified was left
    // pending.
    await insertLegacyCard(client, 3);
    await insertUnifiedCompatCard(client, 'legacy-3', 3, {
        publication_status: 'pending'
    });

    // 4. A media mismatch: the object key does not match the migration's own
    // transform of the legacy URL.
    await insertLegacyCard(client, 4);
    await insertUnifiedCompatCard(client, 'legacy-4', 4, {
        front_object_key: 'community/namecards/assets/wrong/image.png'
    });

    // 5. Reaction count drift between card_emojis and namecard_reactions.
    await insertLegacyCard(client, 5);
    await insertUnifiedCompatCard(client, 'legacy-5', 5);
    await client.query(
        `INSERT INTO public.card_emojis (card_id, emoji, count) VALUES (5, '🌸', 4)`
    );
    await client.query(
        `INSERT INTO public.namecard_reactions (card_id, emoji, count)
         VALUES ('legacy-5', '🌸', 1)`
    );

    // 6. A reaction that exists on the unified side only.
    await insertLegacyCard(client, 6);
    await insertUnifiedCompatCard(client, 'legacy-6', 6);
    await client.query(
        `INSERT INTO public.namecard_reactions (card_id, emoji, count)
         VALUES ('legacy-6', '🎤', 2)`
    );

    // 7. An orphaned card_emojis row, informational only. Real orphans of
    // this kind predate card_emojis_card_id_fkey, which was added NOT
    // VALID; the FK (and now the read-only trigger) is already bypassed for
    // this whole test, reproducing that historical shape.
    await client.query(
        `INSERT INTO public.card_emojis (card_id, emoji, count) VALUES (999, '🌸', 9)`
    );

    // 8. A row a claim has bound "existing"-style: retired (soft deleted) in
    // place, its own legacy_card_id left NULL. Must not be reported as
    // missing, a status mismatch, or a media mismatch.
    await insertLegacyCard(client, 7);
    await insertUnifiedCompatCard(client, 'legacy-7', 7, {
        deleted_at: new Date().toISOString(),
        publication_status: 'published'
    });

    // 9. A row a claim has bound "create"-style: upgraded in place, its own
    // legacy_card_id now points at itself. Must not be reported as a media
    // mismatch even though its object keys no longer match the transform.
    await insertLegacyCard(client, 8);
    await insertUnifiedCompatCard(client, 'legacy-8', 8, {
        front_object_key: 'community/fudaba/cards/legacy-8/front.webp',
        back_object_key: 'community/fudaba/cards/legacy-8/back.webp',
        legacy_card_id: 8,
        publication_status: 'published'
    });

    const result = await reconcile(client);
    // node-postgres returns BIGINT columns as strings by default (raw
    // `pg.Client`, unlike the app's own SqlDatabase wrapper), so every id
    // pulled back here is coerced to a number before comparing.
    assert.deepEqual(result.missingFromUnified.map(Number), [1]);
    assert.deepEqual(
        result.missingFromLegacy.map((row) => Number(row.card_number)),
        [2]
    );
    assert.deepEqual(
        result.statusMismatches.map((row) => Number(row.legacy_id)),
        [3]
    );
    assert.deepEqual(
        result.mediaMismatches.map((row) => Number(row.legacyId)),
        [4]
    );
    assert.deepEqual(
        result.reactionDrift.map((row) => Number(row.legacy_id)),
        [5]
    );
    assert.deepEqual(
        result.reactionOnlyOnUnifiedSide.map((row) => Number(row.legacy_id)),
        [6]
    );
    assert.deepEqual(
        result.orphanedLegacyReactionRows.map((row) => Number(row.card_id)),
        [999]
    );

    const summary = summarize(
        {
            legacyCards: 7,
            unifiedCompatCards: 7,
            legacyReactionRows: 2,
            unifiedReactionRows: 2
        },
        result
    );
    assert.equal(isClean(summary), false);
    assert.equal(summary.missingFromUnified, 1);
    assert.equal(summary.missingFromLegacy, 1);
    assert.equal(summary.statusMismatches, 1);
    assert.equal(summary.mediaMismatches, 1);
    assert.equal(summary.reactionDrift, 1);
    assert.equal(summary.reactionOnlyOnUnifiedSide, 1);
    // Orphaned rows do not gate cleanliness -- they are a pre-existing,
    // independent anomaly the unification work did not create.
    assert.equal(summary.orphanedLegacyReactionRows, 1);
});
