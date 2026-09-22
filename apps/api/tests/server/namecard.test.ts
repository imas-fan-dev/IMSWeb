// Merged from 5 sibling files that each keep their own describe block.
// The block around every contribution gives it its own scope, so identically
// named fixtures from different files cannot clash.

import { seedCanonicalFudabaAgencies } from '../integration/fudaba-agency-fixture';
import { createMigrationCatalogBefore } from '../integration/migration-catalog';
import { createPostgresTestHarness } from '../integration/postgres-harness';
import { createPostgresTestDatabase, postgresTest } from '../postgres-test-database';
import { ensureNamecardThumbnails } from '@/domains/community/fudaba/card-media-assets';
import { PostgresqlSchemaStrategy } from '@/infra/db/postgresql/schema-strategy';
import { SqlCoreRepository } from '@/infra/db/repositories/core-repository';
import { executeSql, queryOne } from '@/infra/db/sql/query';
import { namecardCardMediaObjectKey, namecardClaimMediaObjectKey, namecardMediaObjectKeys, namecardOriginalUrlFromObjectKey, namecardThumbnailObjectKey, namecardThumbnailPublicUrl, publicMediaObjectKey } from '@/utils/storage/business-object-keys';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { describe, onTestFinished, test } from 'vitest';

// namecard-media-keys.test.ts
{
    test.describe('namecard media keys', () => {
        test('namecard thumbnail keys share the original stem under a thumbnail role', () => {
            assert.equal(
                namecardThumbnailObjectKey('card-front.webp'),
                'community/namecards/assets/card-front/thumbnail.jpg'
            );
            assert.equal(
                namecardThumbnailObjectKey('card-front.png'),
                'community/namecards/assets/card-front/thumbnail.jpg'
            );
        });

        test('namecard thumbnail public URLs keep the original filename identity', () => {
            assert.equal(
                namecardThumbnailPublicUrl('/uploads/namecard/original/card-front.webp'),
                '/uploads/namecard/thumbnail/card-front.webp.jpg'
            );
            assert.throws(
                () => namecardThumbnailPublicUrl('/uploads/namecard/original/../escape.webp'),
                /Invalid business object key/
            );
            assert.throws(
                () => namecardThumbnailPublicUrl('/uploads/news/original/card-front.webp'),
                /Unsupported namecard media path/
            );
        });

        test('namecard media key pairs cover the original and its stored thumbnail', () => {
            assert.deepEqual(
                namecardMediaObjectKeys('/uploads/namecard/original/card-front.webp'),
                [
                    'community/namecards/assets/card-front/image.webp',
                    'community/namecards/assets/card-front/thumbnail.jpg'
                ]
            );
        });

        test('legacy thumbnail paths map back to the canonical thumbnail key', () => {
            assert.equal(
                publicMediaObjectKey('uploads/namecard/thumbnail/card-front.webp.jpg'),
                'community/namecards/assets/card-front/thumbnail.jpg'
            );
            assert.throws(
                () => publicMediaObjectKey('uploads/namecard/thumbnail/card-front.webp.png'),
                /Unsupported namecard thumbnail path/
            );
            assert.throws(
                () => publicMediaObjectKey('uploads/namecard/thumbnail/.jpg'),
                /Unsupported namecard thumbnail path/
            );
        });

        // A claim copies a legacy card's media onto a row that the public wall still
        // publishes (`origin` is immutable provenance, so it stays 'legacy'). Writing a
        // Fudaba-layout key there has no public form, so the wall's key reversal threw
        // and took the entire card list down with it. These tests pin the layout.
        test('claimed legacy media keeps the canonical namecards layout', () => {
            const sourceKey = 'community/namecards/assets/legacy-original/image.webp';
            const front = namecardClaimMediaObjectKey(sourceKey, 'legacy-12', 'front');
            const back = namecardClaimMediaObjectKey(sourceKey, 'legacy-12', 'back');
            assert.equal(front, 'community/namecards/assets/legacy-12-front/image.webp');
            assert.equal(back, 'community/namecards/assets/legacy-12-back/image.webp');
            assert.equal(
                namecardOriginalUrlFromObjectKey(front),
                '/uploads/namecard/original/legacy-12-front.webp'
            );
            assert.equal(
                namecardOriginalUrlFromObjectKey(back),
                '/uploads/namecard/original/legacy-12-back.webp'
            );
        });

        test('claimed media round-trips through the public media chain', () => {
            const key = namecardClaimMediaObjectKey(
                'community/namecards/assets/legacy-original/image.webp',
                'legacy-12',
                'front'
            );
            const publicUrl = namecardOriginalUrlFromObjectKey(key);
            assert.equal(publicMediaObjectKey(publicUrl), key);
            assert.deepEqual(namecardMediaObjectKeys(publicUrl), [
                key,
                'community/namecards/assets/legacy-12-front/thumbnail.jpg'
            ]);
        });

        test('claimed media keeps the source extension and never reuses the source', () => {
            const sourceKey = 'community/namecards/assets/legacy-original/image.png';
            assert.equal(
                namecardClaimMediaObjectKey(sourceKey, 'legacy-7', 'front'),
                'community/namecards/assets/legacy-7-front/image.png'
            );
            for (const side of ['front', 'back'] as const) {
                assert.notEqual(
                    namecardClaimMediaObjectKey(sourceKey, 'legacy-7', side),
                    sourceKey
                );
            }
        });

        // Every writer that targets a compatibility row goes through this one builder,
        // so pin its output against the readers that will reverse it back. A key the
        // reversal cannot read takes down the whole listing that contains it.
        test('card media keys stay readable by the namecard readers', () => {
            const key = namecardCardMediaObjectKey('legacy-42', 'front');
            assert.equal(key, 'community/namecards/assets/legacy-42-front/image.webp');
            assert.equal(
                namecardOriginalUrlFromObjectKey(key),
                '/uploads/namecard/original/legacy-42-front.webp'
            );
            assert.equal(publicMediaObjectKey(namecardOriginalUrlFromObjectKey(key)), key);
        });
    });

    function stubThumbnailRuntime(overrides: {
        exists: (key: string) => boolean | Promise<boolean>;
        get: (key: string) => { body: Uint8Array } | null | Promise<{ body: Uint8Array } | null>;
    }) {
        const written: Array<{ key: string; bytes: number }> = [];
        const storage = {
            async get(key: string) { return overrides.get(key); },
            async put(key: string, body: Uint8Array) {
                written.push({ key, bytes: body.byteLength });
            },
            async exists(key: string) { return overrides.exists(key); },
            async delete() {},
            async copy() {},
            async move() {},
            async list() { return []; },
            async deletePrefix() {}
        };
        const images = {
            async validate() { throw new Error('unexpected validate'); },
            async toWebp() { throw new Error('unexpected toWebp'); },
            async thumbnailPng() { throw new Error('unexpected thumbnailPng'); },
            async resizeJpeg(body: Uint8Array) { return new Uint8Array(body.byteLength + 8); }
        };
        return { storage, images, written };
    }

    test.describe('ensureNamecardThumbnails', () => {
        test('skips sides whose thumbnails already exist', async () => {
            const runtime = stubThumbnailRuntime({
                exists: () => true,
                get: () => { throw new Error('unexpected original read'); }
            });
            await ensureNamecardThumbnails(runtime as never, [
                '/uploads/namecard/original/front.webp',
                '/uploads/namecard/original/back.webp'
            ]);
            assert.equal(runtime.written.length, 0);
        });

        test('generates missing thumbnails from originals', async () => {
            const originals = new Map([
                ['community/namecards/assets/front/image.webp', new Uint8Array(12)],
                ['community/namecards/assets/back/image.webp', new Uint8Array(4)]
            ]);
            const runtime = stubThumbnailRuntime({
                exists: (key) => key.endsWith('/front/thumbnail.jpg'),
                get: (key) => originals.has(key) ? { body: originals.get(key)! } : null
            });
            await ensureNamecardThumbnails(runtime as never, [
                '/uploads/namecard/original/front.webp',
                '/uploads/namecard/original/back.webp'
            ]);
            assert.deepEqual(runtime.written, [
                { key: 'community/namecards/assets/back/thumbnail.jpg', bytes: 12 }
            ]);
        });

        test('rejects when the original object is missing', async () => {
            const runtime = stubThumbnailRuntime({
                exists: () => false,
                get: () => null
            });
            await assert.rejects(
                ensureNamecardThumbnails(runtime as never, [
                    '/uploads/namecard/original/front.webp'
                ]),
                /Namecard original object not found/
            );
            assert.equal(runtime.written.length, 0);
        });
    });
}

// namecard-metadata-repository.test.ts
{
    const WITHDRAWAL_TOKEN_HASH = 'a'.repeat(64);

    function guestInput(hashSuffix: string) {
        return {
            image1Url: `/uploads/namecard/original/${hashSuffix}-front.webp`,
            image2Url: `/uploads/namecard/original/${hashSuffix}-back.webp`,
            hash1: `front-${hashSuffix}`,
            hash2: `back-${hashSuffix}`,
            ip: '127.0.0.1',
            withdrawalTokenHash: WITHDRAWAL_TOKEN_HASH,
            seriesCode: 'cg',
            idolIds: [900_002, 900_001]
        };
    }

    describe('PostgreSQL guest namecards', () => {
        postgresTest('persist ordered cross-series idol metadata atomically', async () => {
            const database = await createPostgresTestDatabase('namecard-metadata');
            await seedCanonicalFudabaAgencies(database);
            const repository = new SqlCoreRepository(
                database,
                new PostgresqlSchemaStrategy()
            );
            await repository.initialize();

            const id = await repository.insertPendingCard(guestInput('valid'));
            const [pending] = await repository.listAdminCards(20, 0);
            assert.equal(pending.id, id);
            assert.equal(pending.seriesCode, 'cg');
            assert.equal(pending.submissionKind, 'guest');
            assert.ok(pending.favoriteIdols);
            assert.deepEqual(
                pending.favoriteIdols.map((idol) => ({
                    id: idol.idol_id,
                    agency: idol.agency_code,
                    order: idol.display_order
                })),
                [
                    { id: 900_002, agency: 'cg', order: 0 },
                    { id: 900_001, agency: '765', order: 1 }
                ]
            );

            await executeSql(database,
                "UPDATE fudaba_cards SET publication_status='published', media_rights_status='approved' WHERE card_number=?",
                [id]
            );
            const [publicCard] = await repository.listApprovedCards(20, 0);
            assert.equal(publicCard.id, id);
            assert.equal(publicCard.seriesCode, 'cg');
            assert.ok(publicCard.favoriteIdols);
            assert.deepEqual(
                publicCard.favoriteIdols.map((idol) => idol.idol_id),
                [900_002, 900_001]
            );
            const media = await repository.findApprovedCardMedia(id);
            assert.deepEqual(
                media?.favoriteIdols?.map((idol) => idol.idol_id),
                [900_002, 900_001]
            );

            await assert.rejects(
                repository.insertPendingCard({
                    ...guestInput('empty'),
                    idolIds: []
                }),
                /between 1 and 20 idols/
            );
            await assert.rejects(
                repository.insertPendingCard({
                    ...guestInput('duplicate'),
                    idolIds: [900_001, 900_001]
                }),
                /must be unique/
            );
            await assert.rejects(
                repository.insertPendingCard({
                    ...guestInput('missing'),
                    idolIds: [999_999]
                }),
                /do not exist/
            );
            await assert.rejects(
                repository.insertPendingCard({
                    ...guestInput('too-many'),
                    idolIds: Array.from({ length: 21 }, (_, index) => 910_000 + index)
                }),
                /between 1 and 20 idols/
            );
            await assert.rejects(
                repository.insertPendingCard({
                    ...guestInput('missing-series'),
                    seriesCode: 'missing'
                }),
                /series does not exist/
            );
            assert.equal(
                (await queryOne<{ count: number }>(
                    database,
                    "SELECT CAST(COUNT(*) AS INTEGER) AS count FROM fudaba_cards WHERE origin IN ('guest', 'legacy')"
                ))?.count,
                1
            );

            const legacyId = await repository.insertPendingCard({
                image1Url: '/uploads/namecard/original/legacy-front.webp',
                image2Url: '/uploads/namecard/original/legacy-back.webp',
                hash1: 'legacy-front',
                hash2: 'legacy-back',
                ip: '127.0.0.1',
                withdrawalTokenHash: 'b'.repeat(64),
                seriesCode: null,
                idolIds: [],
                submissionKind: 'legacy'
            });
            const legacy = (await repository.listAdminCards(20, 0))
                .find((card) => card.id === legacyId);
            assert.equal(legacy?.submissionKind, 'legacy');
            assert.equal(legacy?.seriesCode, null);
            assert.deepEqual(legacy?.favoriteIdols, []);
        });

        postgresTest('may carry optional profile text', async () => {
            const database = await createPostgresTestDatabase('namecard-metadata-profile');
            await seedCanonicalFudabaAgencies(database);
            const repository = new SqlCoreRepository(
                database,
                new PostgresqlSchemaStrategy()
            );
            await repository.initialize();

            const id = await repository.insertPendingCard({
                ...guestInput('profile'),
                producerName: 'Producer Name',
                displayName: 'Display Name',
                bio: 'A short bio',
                accent: '#ABCDEF'
            });
            const row = await queryOne<{
                producer_name: string | null;
                display_name: string | null;
                bio: string | null;
                accent: string | null;
                owner_account_id: string | null;
                trade_note: string | null;
                available: boolean;
            }>(database,
                `SELECT producer_name, display_name, bio, accent, owner_account_id,
                trade_note, available
         FROM fudaba_cards WHERE card_number=?`,
                [id]
            );
            assert.deepEqual(row, {
                producer_name: 'Producer Name',
                display_name: 'Display Name',
                bio: 'A short bio',
                accent: '#ABCDEF',
                owner_account_id: null,
                trade_note: null,
                available: false
            });
        });
    });
}

// namecard-ownership-migration.test.ts
{
    const require = createRequire(__filename);
    const { migratePostgres } = require('../../scripts/migration/postgres-migrations.js') as {
        migratePostgres(options: {
            connectionString: string;
            migrationsPath?: string;
        }): Promise<unknown>;
    };

    const OWNERSHIP_MIGRATION = '20260816193000_namecard_ownership_foundation.sql';

    describe('namecard ownership migration', () => {
        postgresTest('preserves historical rows as legacy', async () => {
            // Everything from the ownership migration onward is replayed by the second
            // migratePostgres call, so newer migrations must stay out of this catalog.
            const previousCatalog = await createMigrationCatalogBefore(onTestFinished, OWNERSHIP_MIGRATION);

            const harness = await createPostgresTestHarness({
                migrationsPath: previousCatalog,
                seedCanonicalAgencies: false
            });
            onTestFinished(() => harness.close());
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
            // This harness replays every migration from the ownership migration
            // through HEAD in one shot, including the later archive migration that
            // turns `cards` read-only. A fresh anonymous submission's
            // submission_kind='guest' default (introduced right here by the
            // ownership migration) is exercised directly by
            // namecard-unification-migration.test.ts, which stops its own replay
            // before the archive migration exists; this end of the chain instead
            // has to confirm that a raw insert is rejected once every migration up
            // to HEAD has applied.
            await assert.rejects(
                harness.connection.prepare(
                    `INSERT INTO cards
                (image1_url, image2_url, hash1, hash2, ip, status,
                 withdrawal_token_hash, revision)
             VALUES ('guest/front.webp', 'guest/back.webp', 'guest-front',
                     'guest-back', '127.0.0.1', 'pending', ?, 0)`
                ).bind('b'.repeat(64)).run(),
                /read-only archive/
            );
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
    });
}

// namecard-reaction-reconciliation-migration.test.ts
{
    const require = createRequire(__filename);
    const { migratePostgres } = require('../../scripts/migration/postgres-migrations.js') as {
        migratePostgres(options: {
            connectionString: string;
            migrationsPath?: string;
        }): Promise<unknown>;
    };

    const RECONCILIATION_MIGRATION =
        '20260821000000_namecard_reaction_reconciliation.sql';

    describe('namecard reaction reconciliation', () => {
        postgresTest('resyncs namecard_reactions from card_emojis drift', async () => {
            const previousCatalog = await createMigrationCatalogBefore(onTestFinished, RECONCILIATION_MIGRATION);

            const harness = await createPostgresTestHarness({
                migrationsPath: previousCatalog,
                seedCanonicalAgencies: false
            });
            onTestFinished(() => harness.close());
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
    });
}

// namecard-unification-migration.test.ts
{
    const require = createRequire(__filename);
    const { migratePostgres } = require('../../scripts/migration/postgres-migrations.js') as {
        migratePostgres(options: {
            connectionString: string;
            migrationsPath?: string;
        }): Promise<unknown>;
    };

    const UNIFICATION_MIGRATION = '20260819000000_namecard_unification_foundation.sql';

    describe('namecard unification migration', () => {
        postgresTest('folds legacy cards into one table', async () => {
            const previousCatalog = await createMigrationCatalogBefore(onTestFinished, UNIFICATION_MIGRATION);

            const harness = await createPostgresTestHarness({
                migrationsPath: previousCatalog,
                seedCanonicalAgencies: false
            });
            onTestFinished(() => harness.close());
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
    });
}
