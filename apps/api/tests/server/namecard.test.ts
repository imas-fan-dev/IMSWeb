// Merged from 5 sibling files that each keep their own describe block.
// The block around every contribution gives it its own scope, so identically
// named fixtures from different files cannot clash.

import { seedCanonicalFudabaAgencies } from '../integration/fudaba-agency-fixture';
import { createMigrationCatalogBefore } from '../integration/migration-catalog';
import { createPostgresTestHarness } from '../integration/postgres-harness';
import { createPostgresTestDatabase, postgresTest } from '../postgres-test-database';
import { PostgresqlSchemaStrategy } from '@/infra/db/postgresql/schema-strategy';
import { SqlCoreRepository } from '@/infra/db/repositories/core-repository';
import { executeSql, queryAll, queryOne } from '@/infra/db/sql/query';
import { cardPageObjectKey, publicMediaObjectKey } from '@/utils/storage/business-object-keys';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { describe, onTestFinished, test } from 'vitest';

// namecard-media-keys.test.ts
{
    test.describe('namecard media keys', () => {
        test('legacy namecard upload paths are no longer media keys', () => {
            assert.throws(
                () => publicMediaObjectKey('uploads/namecard/original/card-front.webp'),
                /Unsupported public media object path/
            );
            assert.throws(
                () => publicMediaObjectKey('uploads/namecard/thumbnail/card-front.webp.jpg'),
                /Unsupported public media object path/
            );
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
            characterIds: [900_002, 900_001]
        };
    }

    describe('PostgreSQL guest namecards', () => {
        postgresTest('serves editor artwork through the card media route', async () => {
            const database = await createPostgresTestDatabase('namecard-editor-media');
            await seedCanonicalFudabaAgencies(database);
            const repository = new SqlCoreRepository(
                database,
                new PostgresqlSchemaStrategy()
            );
            await repository.initialize();

            const id = await repository.insertPendingCard(guestInput('editor'));
            // 页面行是唯一来源：还没有页面行时队列与媒体路由都给不出地址，也不会
            // 退回旧 key 列去反推（旧编辑器 key 列已随迁移删除）。
            const [row] = await repository.listAdminCards(20, 0);
            assert.equal(row?.id, id);
            assert.equal(await repository.findCardMediaKey(id, 'front', false), null);
            assert.equal(await repository.findCardMediaKey(id, 'middle-1', false), null);

            // 页面行是唯一来源：正反面 + 两张中间页。
            await executeSql(
                database,
                `INSERT INTO public.fudaba_card_pages
                     (card_id, queue, page_id, display_order, object_version,
                      width, height, created_at, updated_at)
                 SELECT id, 'live', 'front', 1,
                        '11111111-1111-4111-8111-111111111111'::uuid, 100, 50, TIMESTAMPTZ '2026-01-01T00:00:00Z', TIMESTAMPTZ '2026-01-01T00:00:00Z'
                   FROM public.fudaba_cards WHERE card_number=?
                 UNION ALL
                 SELECT id, 'live', 'page-aaaaaaaa', 2,
                        '22222222-2222-4222-8222-222222222222'::uuid, 100, 50, TIMESTAMPTZ '2026-01-01T00:00:00Z', TIMESTAMPTZ '2026-01-01T00:00:00Z'
                   FROM public.fudaba_cards WHERE card_number=?
                 UNION ALL
                 SELECT id, 'live', 'page-bbbbbbbb', 3,
                        '33333333-3333-4333-8333-333333333333', 100, 50, TIMESTAMPTZ '2026-01-01T00:00:00Z', TIMESTAMPTZ '2026-01-01T00:00:00Z'
                   FROM public.fudaba_cards WHERE card_number=?
                 UNION ALL
                 SELECT id, 'live', 'back', 4,
                        '44444444-4444-4444-8444-444444444444'::uuid, 100, 50, TIMESTAMPTZ '2026-01-01T00:00:00Z', TIMESTAMPTZ '2026-01-01T00:00:00Z'
                   FROM public.fudaba_cards WHERE card_number=?`,
                [id, id, id, id]
            );
            const [withPages] = await repository.listAdminCards(20, 0);
            assert.equal(withPages?.id, id);
            const internalId = (await queryOne<{ id: string }>(
                database,
                'SELECT id FROM public.fudaba_cards WHERE card_number=?',
                [id]
            ))!.id;
            assert.equal(
                await repository.findCardMediaKey(id, 'middle-2', false),
                cardPageObjectKey(
                    internalId,
                    'live',
                    'page-bbbbbbbb',
                    '33333333-3333-4333-8333-333333333333'
                )
            );
            assert.equal(await repository.findPublishedCardPageKey(id, 'front'), null);

            await executeSql(
                database,
                `UPDATE public.fudaba_cards SET publication_status='published' WHERE card_number=?`,
                [id]
            );
            assert.equal(
                await repository.findPublishedCardPageKey(id, 'front'),
                cardPageObjectKey(
                    internalId,
                    'live',
                    'front',
                    '11111111-1111-4111-8111-111111111111'
                )
            );
            assert.equal(
                await repository.findPublishedCardPageKey(id, 'back'),
                cardPageObjectKey(
                    internalId,
                    'live',
                    'back',
                    '44444444-4444-4444-8444-444444444444'
                )
            );
            assert.equal(
                await repository.findPublishedCardPageKey(id, 'page-aaaaaaaa'),
                cardPageObjectKey(
                    internalId,
                    'live',
                    'page-aaaaaaaa',
                    '22222222-2222-4222-8222-222222222222'
                )
            );
            // 统一页面布局没有 front/back 同名行，管理入口仍要按页序取首/末页。
            await executeSql(database,
                `DELETE FROM public.fudaba_card_pages WHERE card_id=?`,
                [internalId]
            );
            await executeSql(database,
                `INSERT INTO public.fudaba_card_pages
                     (card_id, queue, page_id, display_order, object_version,
                      width, height, created_at, updated_at)
                 VALUES (?, 'live', 'page-aaaaaaaa', 1,
                         '11111111-1111-4111-8111-111111111111'::uuid, 100, 50, TIMESTAMPTZ '2026-01-01T00:00:00Z', TIMESTAMPTZ '2026-01-01T00:00:00Z'),
                        (?, 'live', 'page-bbbbbbbb', 2,
                         '22222222-2222-4222-8222-222222222222'::uuid, 100, 50, TIMESTAMPTZ '2026-01-01T00:00:00Z', TIMESTAMPTZ '2026-01-01T00:00:00Z'),
                        (?, 'live', 'page-cccccccc', 3,
                         '33333333-3333-4333-8333-333333333333'::uuid, 100, 50, TIMESTAMPTZ '2026-01-01T00:00:00Z', TIMESTAMPTZ '2026-01-01T00:00:00Z')`,
                [internalId, internalId, internalId]
            );
            assert.equal(
                await repository.findCardMediaKey(id, 'front', false),
                cardPageObjectKey(internalId, 'live', 'page-aaaaaaaa',
                    '11111111-1111-4111-8111-111111111111')
            );
            assert.equal(
                await repository.findCardMediaKey(id, 'back', false),
                cardPageObjectKey(internalId, 'live', 'page-cccccccc',
                    '33333333-3333-4333-8333-333333333333')
            );

            // A complete pending snapshot can use page-* rows for front/back.
            // Admin draft front/back must resolve first/last page and respect
            // object_queue instead of looking only for page_id='front'/'back'.
            await executeSql(database,
                `INSERT INTO public.fudaba_card_pages
                     (card_id, queue, page_id, display_order, object_version,
                      object_queue, width, height, created_at, updated_at)
                 VALUES
                   (?, 'pending', 'page-aaaaaaaa', 1,
                    '11111111-1111-4111-8111-111111111111'::uuid, 'live',
                    100, 50, TIMESTAMPTZ '2026-01-01T00:00:00Z', TIMESTAMPTZ '2026-01-01T00:00:00Z'),
                   (?, 'pending', 'page-bbbbbbbb', 2,
                    '22222222-2222-4222-8222-222222222222'::uuid, 'pending',
                    100, 50, TIMESTAMPTZ '2026-01-01T00:00:00Z', TIMESTAMPTZ '2026-01-01T00:00:00Z'),
                   (?, 'pending', 'page-cccccccc', 3,
                    '33333333-3333-4333-8333-333333333333'::uuid, 'pending',
                    100, 50, TIMESTAMPTZ '2026-01-01T00:00:00Z', TIMESTAMPTZ '2026-01-01T00:00:00Z'),
                   (?, 'pending', 'page-dddddddd', 4,
                    '44444444-4444-4444-8444-444444444444'::uuid, 'live',
                    100, 50, TIMESTAMPTZ '2026-01-01T00:00:00Z', TIMESTAMPTZ '2026-01-01T00:00:00Z')`,
                [internalId, internalId, internalId, internalId]
            );
            assert.equal(
                await repository.findCardMediaKey(id, 'front', true),
                cardPageObjectKey(internalId, 'live', 'page-aaaaaaaa',
                    '11111111-1111-4111-8111-111111111111')
            );
            assert.equal(
                await repository.findCardMediaKey(id, 'back', true),
                cardPageObjectKey(internalId, 'live', 'page-dddddddd',
                    '44444444-4444-4444-8444-444444444444')
            );
        });

        postgresTest('persist ordered cross-series character metadata atomically', async () => {
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
            assert.ok(pending.favoriteCharacters);
            assert.deepEqual(
                pending.favoriteCharacters.map((character) => ({
                    id: character.character_id,
                    agency: character.agency_code,
                    order: character.display_order
                })),
                [
                    { id: 900_002, agency: 'cg', order: 0 },
                    { id: 900_001, agency: '765', order: 1 }
                ]
            );

            await executeSql(database,
                "UPDATE fudaba_cards SET publication_status='published' WHERE card_number=?",
                [id]
            );
            const [publicCard] = await repository.listApprovedCards(20, 0);
            assert.equal(publicCard.id, id);
            assert.equal(publicCard.seriesCode, 'cg');
            assert.ok(publicCard.favoriteCharacters);
            assert.deepEqual(
                publicCard.favoriteCharacters.map((character) => character.character_id),
                [900_002, 900_001]
            );
            const single = await repository.findApprovedCard(id);
            assert.equal(single?.id, id);
            assert.equal(single?.seriesCode, 'cg');
            assert.equal(await repository.findApprovedCard(987_654), null);

            // 属主改图后线上图是 fudaba 版本对象：墙的公开集合必须同样认这套布局，
            // 否则这张卡会从墙上整张消失（注册卡只会被复制进 canonical 布局一次）。
            await executeSql(database,
                `UPDATE fudaba_cards
                 SET origin='exchange'
                 WHERE card_number=?`,
                [id]
            );
            await executeSql(database,
                `INSERT INTO public.fudaba_card_pages
                     (card_id, queue, page_id, display_order, object_version,
                      width, height, created_at, updated_at)
                 SELECT id, 'live', 'page-aaaaaaaa', 1,
                        '11111111-1111-4111-8111-111111111111'::uuid,
                        100, 50, TIMESTAMPTZ '2026-01-01T00:00:00Z',
                        TIMESTAMPTZ '2026-01-01T00:00:00Z'
                   FROM public.fudaba_cards WHERE card_number=?`,
                [id]
            );
            const wallCards = await repository.listApprovedCards(20, 0);
            assert.ok(
                wallCards.some((card) => card.id === id),
                'published card with a version artwork key must stay on the wall'
            );
            await executeSql(database,
                `UPDATE fudaba_cards
                 SET origin='guest'
                 WHERE card_number=?`,
                [id]
            );

            await assert.rejects(
                repository.insertPendingCard({
                    ...guestInput('empty'),
                    characterIds: []
                }),
                /between 1 and 200 characters/
            );
            await assert.rejects(
                repository.insertPendingCard({
                    ...guestInput('duplicate'),
                    characterIds: [900_001, 900_001]
                }),
                /must be unique/
            );
            await assert.rejects(
                repository.insertPendingCard({
                    ...guestInput('missing'),
                    characterIds: [999_999]
                }),
                /do not exist/
            );
            await assert.rejects(
                repository.insertPendingCard({
                    ...guestInput('too-many'),
                    characterIds: Array.from({ length: 201 }, (_, index) => 910_000 + index)
                }),
                /between 1 and 200 characters/
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
                characterIds: [],
                submissionKind: 'legacy'
            });
            const legacy = (await repository.listAdminCards(20, 0))
                .find((card) => card.id === legacyId);
            assert.equal(legacy?.submissionKind, 'legacy');
            assert.equal(legacy?.seriesCode, null);
            assert.deepEqual(legacy?.favoriteCharacters, []);
        });

        postgresTest('moderation approval publishes the editor text and credits', async () => {
            const database = await createPostgresTestDatabase('namecard-approve');
            await seedCanonicalFudabaAgencies(database);
            const repository = new SqlCoreRepository(
                database,
                new PostgresqlSchemaStrategy()
            );
            await repository.initialize();

            const ownerId = 'approve-owner';
            await executeSql(database,
                `INSERT INTO platform_accounts (id, status, created_at, updated_at)
                 VALUES (?, 'active', 1, 1)`,
                [ownerId]
            );
            await executeSql(database,
                `INSERT INTO platform_profiles (account_id, display_name, updated_at)
                 VALUES (?, '调试用户', 1)`,
                [ownerId]
            );
            const id = await repository.insertPendingCard(guestInput('approve'));
            // An ownerless card may not carry a trade note, so publish as an
            // owned card; the moderation queue treats both the same way.
            // Owned cards must always carry a trade note, so seed it empty
            // here and let the approval write the submitted text over it.
            await executeSql(database,
                `UPDATE fudaba_cards
                 SET owner_account_id=?, producer_name=?, trade_note=''
                 WHERE card_number=?`,
                [ownerId, '待审名称', id]
            );
            const payload = {
                producer_name: '调试用户',
                producer_reading: 'かとう-せんぱい',
                bio: '审核页通过验证简介',
                trade_note: '审核页通过验证说明',
                credits: [
                    {
                        accountId: null,
                        displayName: '验证创作人员',
                        url: null,
                        roles: ['design']
                    }
                ],
                series_codes: ['cg'],
                favorite_character_ids: [900_002, 900_001],
                exchange_mode: 'manual',
                made_on: null,
                group_name: null,
                is_original: true,
                made_with_ai: false,
                visible: true
            };
            await executeSql(database,
                `UPDATE fudaba_cards
                 SET publication_status='published', review_status='pending',
                     pending_payload=CAST(? AS jsonb)
                 WHERE card_number=?`,
                [JSON.stringify(payload), id]
            );
            const current = await database
                .prepare('SELECT revision, review_status, publication_status, producer_name, trade_note, pending_payload FROM fudaba_cards WHERE card_number=?')
                .bind(id)
                .first<Record<string, unknown>>();
            assert.ok(current);

            const claim = await repository.beginCardApproval(id, Number(current.revision));
            assert.equal(claim.status, 'claimed');
            const completed = await repository.completeCardApproval(
                id,
                claim.status === 'claimed' ? claim.card.revision : 0
            );
            assert.equal(completed.status, 'updated');

            // The moderation queue must promote every editable field, not just
            // the ones the legacy submission form used to carry.
            const [publicCard] = await repository.listApprovedCards(20, 0);
            assert.ok(publicCard);
            assert.equal(publicCard.producer_reading, 'かとう-せんぱい');
            assert.equal(publicCard.bio, '审核页通过验证简介');
            assert.equal(publicCard.trade_note, '审核页通过验证说明');
            assert.deepEqual(
                publicCard.credits?.map((credit) => ({
                    name: credit.displayName,
                    roles: credit.roles
                })),
                [{ name: '验证创作人员', roles: ['design'] }]
            );
        });

        postgresTest('a group card derives its producer name and only ever auto-exchanges', async () => {
            const database = await createPostgresTestDatabase('namecard-group-card');
            await seedCanonicalFudabaAgencies(database);
            const repository = new SqlCoreRepository(
                database,
                new PostgresqlSchemaStrategy()
            );
            await repository.initialize();

            const ownerId = 'group-card-owner';
            await executeSql(database,
                `INSERT INTO platform_accounts (id, status, created_at, updated_at)
                 VALUES (?, 'active', 1, 1)`,
                [ownerId]
            );
            await executeSql(database,
                `INSERT INTO platform_profiles (account_id, display_name, updated_at)
                 VALUES (?, '调试用户', 1)`,
                [ownerId]
            );
            const id = await repository.insertPendingCard(guestInput('group-card'));
            // 制作人名称留空：团体名片会回落到团体名称。
            await executeSql(database,
                `UPDATE fudaba_cards
                 SET owner_account_id=?, producer_name='', trade_note='',
                     publication_status='published',
                     is_group_card=true, group_name='765PRO', exchange_mode='manual'
                 WHERE card_number=?`,
                [ownerId, id]
            );

            const row = (await queryOne<{
                producer_name: string;
                exchange_mode: string;
                is_group_card: boolean;
            }>(database,
                `SELECT producer_name, exchange_mode, is_group_card
                 FROM fudaba_cards WHERE card_number=?`,
                [id]
            ))!;
            // 触发器把团体名称写进制作人名称，并把交换模式固定为自动。
            assert.equal(row.is_group_card, true);
            assert.equal(row.producer_name, '765PRO');
            assert.equal(row.exchange_mode, 'auto');

            // 改名时回落值跟着走；直接写别的交换模式也会被改回自动。
            await executeSql(database,
                `UPDATE fudaba_cards SET group_name='765PRO ALLSTARS', exchange_mode='none'
                 WHERE card_number=?`,
                [id]
            );
            const renamed = (await queryOne<{
                producer_name: string;
                exchange_mode: string;
            }>(database,
                `SELECT producer_name, exchange_mode FROM fudaba_cards
                 WHERE card_number=?`,
                [id]
            ))!;
            assert.equal(renamed.producer_name, '765PRO ALLSTARS');
            assert.equal(renamed.exchange_mode, 'auto');

            // 团体可能有自己的吉祥物：填了制作人名称就保留，不再被团体名覆盖。
            await executeSql(database,
                `UPDATE fudaba_cards SET producer_name='765 吉祥物' WHERE card_number=?`,
                [id]
            );
            const mascot = (await queryOne<{ producer_name: string }>(database,
                `SELECT producer_name FROM fudaba_cards WHERE card_number=?`,
                [id]
            ))!;
            assert.equal(mascot.producer_name, '765 吉祥物');

            // 此后改团体名称不会覆盖使用者填写的制作人名称。
            await executeSql(database,
                `UPDATE fudaba_cards SET group_name='765PRO' WHERE card_number=?`,
                [id]
            );
            const kept = (await queryOne<{ producer_name: string }>(database,
                `SELECT producer_name FROM fudaba_cards WHERE card_number=?`,
                [id]
            ))!;
            assert.equal(kept.producer_name, '765 吉祥物');
        });

        postgresTest('moderation approval publishes the staged middle pages', async () => {
            const database = await createPostgresTestDatabase('namecard-approve-pages');
            await seedCanonicalFudabaAgencies(database);
            const repository = new SqlCoreRepository(
                database,
                new PostgresqlSchemaStrategy()
            );
            await repository.initialize();

            const ownerId = 'approve-pages-owner';
            await executeSql(database,
                `INSERT INTO platform_accounts (id, status, created_at, updated_at)
                 VALUES (?, 'active', 1, 1)`,
                [ownerId]
            );
            await executeSql(database,
                `INSERT INTO platform_profiles (account_id, display_name, updated_at)
                 VALUES (?, '调试用户', 1)`,
                [ownerId]
            );
            const id = await repository.insertPendingCard(guestInput('approve-pages'));
            await executeSql(database,
                `UPDATE fudaba_cards
                 SET owner_account_id=?, producer_name=?, trade_note='',
                     publication_status='published'
                 WHERE card_number=?`,
                [ownerId, '待审名称', id]
            );
            const cardId = (await queryOne<{ id: string }>(database,
                'SELECT id FROM fudaba_cards WHERE card_number=?',
                [id]
            ))!.id;
            await executeSql(database,
                `INSERT INTO public.fudaba_card_pages
                     (card_id, queue, page_id, display_order, object_version,
                      width, height, created_at, updated_at)
                 VALUES (?, 'live', 'front', 1,
                         '11111111-1111-4111-8111-111111111111'::uuid, 100, 50, TIMESTAMPTZ '2026-01-01T00:00:00Z', TIMESTAMPTZ '2026-01-01T00:00:00Z'),
                        (?, 'live', 'page-cccccccc', 2,
                         '55555555-5555-4555-8555-555555555555'::uuid, 100, 50, TIMESTAMPTZ '2026-01-01T00:00:00Z', TIMESTAMPTZ '2026-01-01T00:00:00Z'),
                        (?, 'live', 'back', 3,
                         '66666666-6666-4666-8666-666666666666'::uuid, 100, 50, TIMESTAMPTZ '2026-01-01T00:00:00Z', TIMESTAMPTZ '2026-01-01T00:00:00Z')`,
                [cardId, cardId, cardId]
            );
            // The author replaces the single middle page with two new ones and
            // resubmits: the whole revised page set waits in the pending queue
            // until a reviewer approves that revision.
            await executeSql(database,
                `UPDATE fudaba_cards
                 SET review_status='pending',
                     pending_payload=CAST(? AS jsonb)
                 WHERE card_number=?`,
                [
                    JSON.stringify({
                        producer_name: '待审名称',
                        trade_note: '',
                        exchange_mode: 'none',
                        series_codes: ['cg'],
                        favorite_character_ids: [],
                        visible: true,
                        is_original: false,
                        made_with_ai: false
                    }),
                    id
                ]
            );
            await executeSql(database,
                `INSERT INTO public.fudaba_card_pages
                     (card_id, queue, page_id, display_order, object_version,
                      object_queue, width, height, created_at, updated_at)
                 VALUES (?, 'pending', 'front', 1,
                         '11111111-1111-4111-8111-111111111111'::uuid, 'live', 100, 50, TIMESTAMPTZ '2026-01-01T00:00:00Z', TIMESTAMPTZ '2026-01-01T00:00:00Z'),
                        (?, 'pending', 'page-aaaaaaaa', 2,
                         'aaaaaaaa-0000-4000-8000-000000000001'::uuid, 'pending', 100, 50, TIMESTAMPTZ '2026-01-01T00:00:00Z', TIMESTAMPTZ '2026-01-01T00:00:00Z'),
                        (?, 'pending', 'page-bbbbbbbb', 3,
                         'bbbbbbbb-0000-4000-8000-000000000002'::uuid, 'pending', 100, 50, TIMESTAMPTZ '2026-01-01T00:00:00Z', TIMESTAMPTZ '2026-01-01T00:00:00Z'),
                        (?, 'pending', 'back', 4,
                         '66666666-6666-4666-8666-666666666666'::uuid, 'live', 100, 50, TIMESTAMPTZ '2026-01-01T00:00:00Z', TIMESTAMPTZ '2026-01-01T00:00:00Z')`,
                [cardId, cardId, cardId, cardId]
            );
            const revision = Number((await queryOne<{ revision: number }>(database,
                'SELECT revision FROM fudaba_cards WHERE card_number=?',
                [id]
            ))!.revision);
            const claim = await repository.beginCardApproval(id, revision);
            assert.equal(claim.status, 'claimed');
            const completed = await repository.completeCardApproval(
                id,
                claim.status === 'claimed' ? claim.card.revision : 0
            );
            assert.equal(completed.status, 'updated');

            assert.equal(
                (
                    await queryOne<{ review_status: string | null }>(database,
                        'SELECT review_status FROM fudaba_cards WHERE card_number=?',
                        [id]
                    )
                )?.review_status,
                null
            );
            // 页面行整批换血：待审的两张新中间页成为线上页。
            assert.deepEqual(
                (
                    await queryAll<{ page_id: string }>(database,
                        `SELECT page_id FROM public.fudaba_card_pages
                          WHERE card_id=? AND queue='live' ORDER BY display_order`,
                        [cardId]
                    )
                ).map((row) => row.page_id),
                ['front', 'page-aaaaaaaa', 'page-bbbbbbbb', 'back']
            );
            assert.equal(
                await queryOne(database,
                    `SELECT 1 FROM public.fudaba_card_pages
                      WHERE card_id=? AND queue='pending'`,
                    [cardId]
                ),
                null
            );
        });

        postgresTest('approval promotes staged pages without dropping untouched live ones', async () => {
            const database = await createPostgresTestDatabase('namecard-approve-preserve-pages');
            await seedCanonicalFudabaAgencies(database);
            const repository = new SqlCoreRepository(
                database,
                new PostgresqlSchemaStrategy()
            );
            await repository.initialize();
            const ownerId = 'approve-preserve-owner';
            await executeSql(database,
                `INSERT INTO platform_accounts (id, status, created_at, updated_at)
                 VALUES (?, 'active', 1, 1)`,
                [ownerId]
            );
            await executeSql(database,
                `INSERT INTO platform_profiles (account_id, display_name, updated_at)
                 VALUES (?, '保留页测试', 1)`,
                [ownerId]
            );
            const id = await repository.insertPendingCard(guestInput('approve-preserve'));
            const cardId = (await queryOne<{ id: string }>(database,
                'SELECT id FROM fudaba_cards WHERE card_number=?',
                [id]
            ))!.id;
            await executeSql(database,
                `UPDATE fudaba_cards
                 SET owner_account_id=?, producer_name=?, trade_note='',
                     publication_status='published'
                 WHERE card_number=?`,
                [ownerId, '保留页测试', id]
            );
            await executeSql(database,
                `INSERT INTO public.fudaba_card_pages
                     (card_id, queue, page_id, display_order, object_version,
                      width, height, created_at, updated_at)
                 VALUES (?, 'live', 'front', 1,
                         '11111111-1111-4111-8111-111111111111'::uuid, 100, 50, TIMESTAMPTZ '2026-01-01T00:00:00Z', TIMESTAMPTZ '2026-01-01T00:00:00Z'),
                        (?, 'live', 'page-dddddddd', 2,
                         '77777777-7777-4777-8777-777777777777'::uuid, 100, 50, TIMESTAMPTZ '2026-01-01T00:00:00Z', TIMESTAMPTZ '2026-01-01T00:00:00Z'),
                        (?, 'live', 'back', 3,
                         '66666666-6666-4666-8666-666666666666'::uuid, 100, 50, TIMESTAMPTZ '2026-01-01T00:00:00Z', TIMESTAMPTZ '2026-01-01T00:00:00Z')`,
                [cardId, cardId, cardId]
            );
            // 待审页集是完整快照：未改动的正反面仍指向线上对象（object_queue
            // 留在 live），只有新中间页真正落在 pending 队列。
            await executeSql(database,
                `INSERT INTO public.fudaba_card_pages
                     (card_id, queue, page_id, display_order, object_version,
                      object_queue, width, height, created_at, updated_at)
                 VALUES (?, 'pending', 'front', 1,
                         '11111111-1111-4111-8111-111111111111'::uuid, 'live', 100, 50, TIMESTAMPTZ '2026-01-01T00:00:00Z', TIMESTAMPTZ '2026-01-01T00:00:00Z'),
                        (?, 'pending', 'page-aaaaaaaa', 2,
                         '88888888-8888-4888-8888-888888888888'::uuid, 'pending', 100, 50, TIMESTAMPTZ '2026-01-01T00:00:00Z', TIMESTAMPTZ '2026-01-01T00:00:00Z'),
                        (?, 'pending', 'back', 3,
                         '66666666-6666-4666-8666-666666666666'::uuid, 'live', 100, 50, TIMESTAMPTZ '2026-01-01T00:00:00Z', TIMESTAMPTZ '2026-01-01T00:00:00Z')`,
                [cardId, cardId, cardId]
            );
            await executeSql(database,
                `UPDATE fudaba_cards
                 SET review_status='pending', pending_payload=CAST(? AS jsonb)
                 WHERE card_number=?`,
                [
                    JSON.stringify({
                        producer_name: '保留页测试',
                        trade_note: '',
                        exchange_mode: 'none',
                        series_codes: ['cg'],
                        favorite_character_ids: [],
                        visible: true,
                        is_original: false,
                        made_with_ai: false
                    }),
                    id
                ]
            );
            const revision = Number((await queryOne<{ revision: number }>(database,
                'SELECT revision FROM fudaba_cards WHERE card_number=?',
                [id]
            ))!.revision);
            const claim = await repository.beginCardApproval(id, revision);
            assert.equal(claim.status, 'claimed');
            const completed = await repository.completeCardApproval(
                id,
                claim.status === 'claimed' ? claim.card.revision : 0
            );
            assert.equal(completed.status, 'updated');
            const rows: { page_id: string; display_order: number }[] = [];
            for (let index = 1; index <= 3; index += 1) {
                const row = await queryOne<{ page_id: string; display_order: number }>(
                    database,
                    `SELECT page_id, display_order FROM public.fudaba_card_pages
                      WHERE card_id=? AND queue='live' AND display_order=?`,
                    [cardId, index]
                );
                if (row) rows.push(row);
            }
            assert.deepEqual(rows.map((row) => row.page_id), [
                'front', 'page-aaaaaaaa', 'back'
            ]);
            assert.equal(
                await queryOne(database,
                    `SELECT 1 FROM public.fudaba_card_pages
                      WHERE card_id=? AND queue='pending'`,
                    [cardId]
                ),
                null
            );
        });

        postgresTest('the review diff shows the staged pages instead of the live ones', async () => {
            const database = await createPostgresTestDatabase('namecard-diff-pages');
            await seedCanonicalFudabaAgencies(database);
            const repository = new SqlCoreRepository(
                database,
                new PostgresqlSchemaStrategy()
            );
            await repository.initialize();

            const ownerId = 'diff-pages-owner';
            await executeSql(database,
                `INSERT INTO platform_accounts (id, status, created_at, updated_at)
                 VALUES (?, 'active', 1, 1)`,
                [ownerId]
            );
            await executeSql(database,
                `INSERT INTO platform_profiles (account_id, display_name, updated_at)
                 VALUES (?, '调试用户', 1)`,
                [ownerId]
            );
            const id = await repository.insertPendingCard(guestInput('diff-pages'));
            await executeSql(database,
                `UPDATE fudaba_cards
                 SET owner_account_id=?, producer_name=?, trade_note='',
                     publication_status='published'
                 WHERE card_number=?`,
                [ownerId, '待审名称', id]
            );
            const cardId = (await queryOne<{ id: string }>(database,
                'SELECT id FROM fudaba_cards WHERE card_number=?',
                [id]
            ))!.id;
            await executeSql(database,
                `INSERT INTO public.fudaba_card_pages
                     (card_id, queue, page_id, display_order, object_version,
                      width, height, created_at, updated_at)
                 VALUES (?, 'live', 'front', 1,
                         '11111111-1111-4111-8111-111111111111'::uuid, 100, 50,
                         TIMESTAMPTZ '2026-01-01T00:00:00Z',
                         TIMESTAMPTZ '2026-01-01T00:00:00Z'),
                        (?, 'live', 'page-cccccccc', 2,
                         '55555555-5555-4555-8555-555555555555'::uuid, 100, 50,
                         TIMESTAMPTZ '2026-01-01T00:00:00Z',
                         TIMESTAMPTZ '2026-01-01T00:00:00Z'),
                        (?, 'live', 'back', 3,
                         '66666666-6666-4666-8666-666666666666'::uuid, 100, 50,
                         TIMESTAMPTZ '2026-01-01T00:00:00Z',
                         TIMESTAMPTZ '2026-01-01T00:00:00Z')`,
                [cardId, cardId, cardId]
            );
            await executeSql(database,
                `UPDATE fudaba_cards
                 SET review_status='pending',
                     pending_payload=CAST(? AS jsonb)
                 WHERE card_number=?`,
                [
                    JSON.stringify({
                        producer_name: '待审名称',
                        trade_note: '',
                        exchange_mode: 'none',
                        series_codes: ['cg'],
                        favorite_character_ids: [],
                        visible: true,
                        is_original: false,
                        made_with_ai: false
                    }),
                    id
                ]
            );
            // 待审页集是完整快照：正反面换了图，另加两张新中间页。
            await executeSql(database,
                `INSERT INTO public.fudaba_card_pages
                     (card_id, queue, page_id, display_order, object_version,
                      object_queue, width, height, created_at, updated_at)
                 VALUES (?, 'pending', 'front', 1,
                         'aaaaaaaa-0000-4000-8000-000000000001'::uuid, 'pending', 100, 50, TIMESTAMPTZ '2026-01-01T00:00:00Z', TIMESTAMPTZ '2026-01-01T00:00:00Z'),
                        (?, 'pending', 'page-aaaaaaaa', 2,
                         'aaaaaaaa-0000-4000-8000-000000000002'::uuid, 'pending', 100, 50, TIMESTAMPTZ '2026-01-01T00:00:00Z', TIMESTAMPTZ '2026-01-01T00:00:00Z'),
                        (?, 'pending', 'page-bbbbbbbb', 3,
                         'bbbbbbbb-0000-4000-8000-000000000003'::uuid, 'pending', 100, 50, TIMESTAMPTZ '2026-01-01T00:00:00Z', TIMESTAMPTZ '2026-01-01T00:00:00Z'),
                        (?, 'pending', 'back', 4,
                         'bbbbbbbb-0000-4000-8000-000000000004'::uuid, 'pending', 100, 50, TIMESTAMPTZ '2026-01-01T00:00:00Z', TIMESTAMPTZ '2026-01-01T00:00:00Z')`,
                [cardId, cardId, cardId, cardId]
            );
            // The reviewer sees the submitted pages, never the live ones: a
            // fallback here turned a staged middle page into the back.
            const artwork = await repository.findAdminCardArtwork(id);
            assert.ok(artwork);
            assert.equal(artwork.staged, true);
            assert.equal(artwork.middleObjectKeys.length, 2);
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
                exchange_mode: string;
            }>(database,
                `SELECT producer_name, bio, accent, owner_account_id,
                trade_note, exchange_mode
         FROM fudaba_cards WHERE card_number=?`,
                [id]
            );
            assert.deepEqual(row, {
                producer_name: 'Producer Name',
                bio: 'A short bio',
                accent: '#ABCDEF',
                owner_account_id: null,
                trade_note: null,
                exchange_mode: 'none'
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
             trade_note, available, source_url, source_label, source_credit, media_rights_status,
             publication_status, revision, created_at,
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
                `SELECT to_regclass('public.namecard_favorite_characters') AS namecard_favorite_characters,
                to_regclass('public.fudaba_card_favorite_characters') AS fudaba_card_favorite_characters,
                to_regclass('public.fudaba_card_claims') AS claims,
                to_regclass('public.fudaba_claim_envelopes') AS envelopes`
            ).first<Record<string, string | null>>();
            assert.deepEqual(relations, {
                namecard_favorite_characters: 'namecard_favorite_characters',
                fudaba_card_favorite_characters: 'fudaba_card_favorite_characters',
                claims: 'fudaba_card_claims',
                envelopes: 'fudaba_claim_envelopes'
            });
        }, 30_000);
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
             trade_note, available, source_url, source_label, source_credit, media_rights_status,
             publication_status, revision, created_at,
             updated_at, deleted_at)
         VALUES ('unification-exchange', 'unification-owner', 'Producer', 'Card',
                 '765', '', 'exchange/front.webp', 'exchange/back.webp',
                 '#4f64dd', '', '', TRUE, NULL, NULL, NULL, 'approved',
                 'published', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL)`
            ).run();

            await migratePostgres({ connectionString: harness.databaseUrl });

            // 旧 key 列已在 20261112140000 迁移里删除，这里只核对统一后的行身份；
            // 媒体 key 搬进页面行是由 ops:namecards:migrate-pages 回填的，迁移本身
            // 不再写它们。
            const migratedApproved = await harness.connection.prepare(
                `SELECT card_number, origin, publication_status,
                revision, owner_account_id, producer_name
         FROM fudaba_cards WHERE id=?`
            ).bind(`legacy-${approved.id}`).first<Record<string, unknown>>();
            assert.deepEqual(migratedApproved, {
                card_number: approved.id,
                origin: 'legacy',
                publication_status: 'published',
                revision: 3,
                owner_account_id: null,
                producer_name: null,
            });

            const migratedGuest = await harness.connection.prepare(
                `SELECT origin, publication_status
         FROM fudaba_cards WHERE id=?`
            ).bind(`legacy-${guest.id}`).first<Record<string, unknown>>();
            assert.deepEqual(migratedGuest, {
                origin: 'guest',
                publication_status: 'pending'
            });

            const guestSeries = await harness.connection.prepare(
                `SELECT series_code FROM fudaba_card_series WHERE card_id=?`
            ).bind(`legacy-${guest.id}`).all<{ series_code: string }>();
            assert.deepEqual(
                guestSeries.results.map((entry) => entry.series_code),
                ['765']
            );

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
                (id, origin, producer_name,
                 publication_status, created_at, updated_at)
             VALUES ('half-filled', 'guest', 'Producer', 'pending',
                     CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
                ).run(),
                /fudaba_cards_owner_layer_check/,
                'a card without an owner must not carry owner-only fields'
            );
        });
    });
}
