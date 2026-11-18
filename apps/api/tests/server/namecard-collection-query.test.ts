/**
 * 名片册列表的参数化查询（PRD §3 / §4 / §7.1）跑在真库上：排序、搜索、高级筛选、
 * 两个开关与分页都直接断言 `listCollection` 的结果——它把「收到的条目」与
 * 「我自己的名片」合并成一份集合，排序与筛选只在这里做一次。
 *
 * 删除卡的条目是重点：卡片行没了以后，企划 / 担当角色 / 团体 / 制作日期 / 排序键
 * 都必须从交换当时的 `snapshot` 回退，不能因为原卡消失就掉出筛选结果。
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe } from 'vitest';
import { SqlCoreRepository } from '@/infra/db/repositories/core-repository';
import { executeSql, queryOne } from '@/infra/db/sql/query';
import type { NewFudabaCardInput } from '@/ports/repositories/fudaba';
import type { NamecardCollectionQueryRecord } from '@/ports/repositories';
import {
    createFudabaRepositoryFixture,
    initializedPostgresSchema,
    makeFudabaCardInput,
    seedPlatformAccount,
} from '../fixtures/fudaba-card-fixture';
import { postgresTest } from '../postgres-test-database';

const OWNER = 'owner';
const COLLECTOR = 'collector';

/** 【按企划】需要不同的 (category, display_order)：目录里补两个测试角色。 */
const CHARACTER_IDS = {
    /** 本家偶像，目录排序 5。 */
    idolLate: 910_001,
    /** 事务员，目录排序 0：分类更大的排在后面。 */
    staff: 910_002
} as const;

async function collectionFixture() {
    const fixture = await createFudabaRepositoryFixture();
    const namecards = new SqlCoreRepository(
        fixture.database,
        initializedPostgresSchema
    );
    await seedPlatformAccount(fixture, OWNER);
    await seedPlatformAccount(fixture, COLLECTOR);
    await executeSql(
        fixture.database,
        `INSERT INTO namecard_characters
             (id, agency_id, category, is_fallback, name_cn, display_order)
         VALUES (?, 1, 'idol', FALSE, '测试副担当', 5),
                (?, 1, 'staff', FALSE, '测试事务员', 0)`,
        [CHARACTER_IDS.idolLate, CHARACTER_IDS.staff]
    );

    async function publish(
        id: string,
        overrides: Partial<NewFudabaCardInput> = {}
    ): Promise<number> {
        await fixture.repository.createCard(
            makeFudabaCardInput(id, OWNER, { exchangeMode: 'auto', ...overrides })
        );
        const row = await queryOne<{ card_number: number | string }>(
            fixture.database,
            'SELECT card_number FROM fudaba_cards WHERE id=?',
            [id]
        );
        assert.ok(row, `card ${id} was not created`);
        return Number(row.card_number);
    }

    /** 一次已经完成的交换：`at` 决定条目的 `obtained_at`。 */
    function collect(cardNumber: number, obtainedAt: string) {
        return namecards.commitExchange({
            id: randomUUID(),
            clientExchangeId: `client-${randomUUID()}`,
            source: 'card-share',
            initiatorAccountId: COLLECTOR,
            targetAccountId: OWNER,
            targetCardNumbers: [cardNumber],
            giveCardNumbers: [],
            scanSessionId: null,
            at: obtainedAt
        });
    }

    const list = (
        input: Partial<NamecardCollectionQueryRecord> = {},
        accountId = COLLECTOR
    ) => namecards.listCollection({ accountId, limit: 24, offset: 0, ...input });

    const numbers = async (
        input: Partial<NamecardCollectionQueryRecord> = {},
        accountId = COLLECTOR
    ) => (await list(input, accountId)).rows.map((row) => row.card_number);

    return {
        ...fixture,
        namecards,
        publish,
        collect,
        list,
        numbers
    };
}

describe('namecard collection queries', () => {
    postgresTest('sorts by exchange time in both directions and paginates', async () => {
        const { publish, collect, list, numbers } = await collectionFixture();
        const first = await publish('card-exchange-first');
        const second = await publish('card-exchange-second');
        const third = await publish('card-exchange-third');
        await collect(first, '2026-01-01T00:00:00.000Z');
        await collect(second, '2026-02-01T00:00:00.000Z');
        await collect(third, '2026-03-01T00:00:00.000Z');

        // 默认：交换时间倒序（最新在前）。
        assert.deepEqual(await numbers(), [third, second, first]);
        assert.deepEqual(await numbers({ sort: 'exchange', dir: 'asc' }), [
            first,
            second,
            third
        ]);

        const page = await list({ sort: 'exchange', dir: 'asc', limit: 2, offset: 2 });
        assert.equal(page.total, 3);
        assert.deepEqual(
            page.rows.map((row) => row.card_number),
            [third]
        );
        assert.equal(page.rows[0]?.own, false);
    });

    postgresTest('sorts by the name metadata and keeps symbols last', async () => {
        const { publish, collect, numbers, database, namecards } =
            await collectionFixture();
        const english = await publish('card-name-english', {
            producerName: 'alpha'
        });
        const kana = await publish('card-name-kana', {
            producerName: '春香',
            producerReading: 'はるか'
        });
        const pinyin = await publish('card-name-pinyin', {
            producerName: '天海春香'
        });
        const symbol = await publish('card-name-symbol', { producerName: '★' });
        // 原卡删除后只剩快照：排序键也要从快照里读出来。
        const deleted = await publish('card-name-deleted', {
            producerName: 'zeta'
        });
        for (const [cardNumber, at] of [
            [english, '2026-01-01T00:00:00.000Z'],
            [kana, '2026-01-02T00:00:00.000Z'],
            [pinyin, '2026-01-03T00:00:00.000Z'],
            [symbol, '2026-01-04T00:00:00.000Z'],
            [deleted, '2026-01-05T00:00:00.000Z']
        ] as const) {
            await collect(cardNumber, at);
        }
        await executeSql(database, 'DELETE FROM fudaba_cards WHERE id=?', [
            'card-name-deleted'
        ]);
        const snapshot = (
            await namecards.listCollection({
                accountId: COLLECTOR,
                limit: 24,
                offset: 0
            })
        ).rows.find((row) => row.card_number === deleted)?.snapshot;
        assert.equal(snapshot?.sortNameBucket, 0);
        assert.equal(snapshot?.sortNameKey, 'zeta');

        assert.deepEqual(await numbers({ sort: 'name' }), [
            english,
            kana,
            pinyin,
            deleted,
            symbol
        ]);
        // 单一拉丁键混排（英文/假名罗马音/拼音一起比较），特殊符号照样垫底；
        // 倒序只翻转比较键。
        assert.deepEqual(await numbers({ sort: 'name', dir: 'desc' }), [
            deleted,
            pinyin,
            kana,
            english,
            symbol
        ]);
    });

    postgresTest('sorts by series count and the first character', async () => {
        const { publish, collect, numbers } = await collectionFixture();
        const lateIdol = await publish('card-series-late-idol', {
            seriesCodes: ['765'],
            favoriteCharacterIds: [CHARACTER_IDS.idolLate]
        });
        const staffOnly = await publish('card-series-staff', {
            seriesCodes: ['cg'],
            favoriteCharacterIds: [CHARACTER_IDS.staff]
        });
        const cross = await publish('card-series-cross', {
            seriesCodes: ['765', 'cg'],
            favoriteCharacterIds: [900_001]
        });
        const firstIdol = await publish('card-series-first-idol', {
            seriesCodes: ['ml'],
            favoriteCharacterIds: [900_001]
        });
        for (const [cardNumber, at] of [
            [lateIdol, '2026-01-01T00:00:00.000Z'],
            [staffOnly, '2026-01-02T00:00:00.000Z'],
            [cross, '2026-01-03T00:00:00.000Z'],
            [firstIdol, '2026-01-04T00:00:00.000Z']
        ] as const) {
            await collect(cardNumber, at);
        }

        // 单一企划在前 → 同数量按第一个担当角色（分类 → 目录排序）→ 交换时间。
        assert.deepEqual(await numbers({ sort: 'series' }), [
            firstIdol,
            lateIdol,
            staffOnly,
            cross
        ]);
        assert.deepEqual(await numbers({ sort: 'series', dir: 'desc' }), [
            cross,
            staffOnly,
            lateIdol,
            firstIdol
        ]);
    });

    postgresTest('sorts by made-on precision and falls back to the created time', async () => {
        const { publish, collect, numbers } = await collectionFixture();
        const fullDate = await publish('card-date-full', {
            madeOn: '2020-05-06',
            createdAt: '2021-01-01T00:00:00.000Z'
        });
        const monthDate = await publish('card-date-month', {
            madeOn: '2018-12',
            createdAt: '2021-01-01T00:00:00.000Z'
        });
        const yearOnly = await publish('card-date-year', {
            madeOn: '2019',
            createdAt: '2021-01-01T00:00:00.000Z'
        });
        const noDateEarly = await publish('card-date-none-early', {
            madeOn: null,
            createdAt: '2017-01-01T00:00:00.000Z'
        });
        const noDateLate = await publish('card-date-none-late', {
            madeOn: null,
            createdAt: '2022-01-01T00:00:00.000Z'
        });
        for (const [cardNumber, at] of [
            [fullDate, '2026-01-01T00:00:00.000Z'],
            [monthDate, '2026-01-02T00:00:00.000Z'],
            [yearOnly, '2026-01-03T00:00:00.000Z'],
            [noDateEarly, '2026-01-04T00:00:00.000Z'],
            [noDateLate, '2026-01-05T00:00:00.000Z']
        ] as const) {
            await collect(cardNumber, at);
        }

        // 有月日 → 只有年份 → 没有日期（用创建时间回退），精度层级固定（PRD §3.3）。
        assert.deepEqual(await numbers({ sort: 'date', dir: 'asc' }), [
            monthDate,
            fullDate,
            yearOnly,
            noDateEarly,
            noDateLate
        ]);
        assert.deepEqual(await numbers({ sort: 'date', dir: 'desc' }), [
            fullDate,
            monthDate,
            yearOnly,
            noDateLate,
            noDateEarly
        ]);
    });

    postgresTest('includeHidden and includeOwn toggle their entries', async () => {
        const { publish, collect, list, numbers, database, namecards } =
            await collectionFixture();
        const hiddenEntry = await publish('card-toggle-hidden');
        const visibleEntry = await publish('card-toggle-visible');
        await collect(hiddenEntry, '2026-01-01T00:00:00.000Z');
        await collect(visibleEntry, '2026-01-02T00:00:00.000Z');
        await namecards.setCollectionHidden({
            accountId: COLLECTOR,
            cardNumber: hiddenEntry,
            hidden: true,
            at: '2026-01-03T00:00:00.000Z'
        });

        assert.deepEqual(await numbers(), [visibleEntry]);
        assert.deepEqual(await numbers({ includeHidden: true }), [
            visibleEntry,
            hiddenEntry
        ]);
        const hidden = await list({ includeHidden: true });
        assert.ok(
            hidden.rows.some(
                (row) =>
                    row.card_number === hiddenEntry && row.hidden_at !== null
            )
        );

        // 自己的名片：只并 `published`（整卡 `hidden` 不显示），交换时间回退创建时间。
        const ownPublished = await publish('card-own-published', {
            createdAt: '2026-02-01T00:00:00.000Z'
        });
        const ownHidden = await publish('card-own-hidden', {
            publicationStatus: 'hidden'
        });
        const own = await namecards.listCollection({
            accountId: OWNER,
            limit: 24,
            offset: 0,
            includeOwn: true
        });
        const ownRow = own.rows.find(
            (row) => row.card_number === ownPublished
        );
        assert.equal(ownRow?.own, true);
        assert.equal(
            new Date(ownRow?.obtained_at ?? 0).toISOString(),
            '2026-02-01T00:00:00.000Z'
        );
        // 自己的两张 `published` 名片；整卡 `hidden` 的那张不出现。
        assert.equal(own.total, 3);
        assert.ok(
            own.rows.every((row) => row.card_number !== ownHidden),
            '整卡 hidden 的名片不该并入名片册'
        );

        // 自己的名片已经在册里时不重复计一条：合成一条指向自己名片的交换记录。
        const exchangeId = randomUUID();
        await executeSql(
            database,
            `INSERT INTO public.namecard_exchanges
                 (id, client_exchange_id, source, status, initiator_account_id,
                  target_account_id, target_card_numbers, initiator_card_numbers,
                  skipped, created_at, resolved_at)
             VALUES (?, ?, 'card-share', 'completed', ?, ?, '{}'::bigint[],
                     '{}'::bigint[], '[]'::jsonb, ?, ?)`,
            [
                exchangeId,
                `client-${exchangeId}`,
                OWNER,
                COLLECTOR,
                '2026-02-02T00:00:00.000Z',
                '2026-02-02T00:00:00.000Z'
            ]
        );
        await executeSql(
            database,
            `INSERT INTO public.namecard_collection_entries
                 (id, collector_account_id, card_number, card_id, exchange_id,
                  obtained_at, hidden_at, snapshot)
             SELECT ?, ?, card.card_number, card.id, ?,
                    '2026-02-02T00:00:00.000Z', NULL, '{}'::jsonb
               FROM fudaba_cards card WHERE card.id='card-own-published'`,
            [randomUUID(), OWNER, exchangeId]
        );
        // 同一个名片编号只出现一次：条目存在时不再从「我的名片」补一条。
        const deduped = await numbers({ includeOwn: true }, OWNER);
        assert.equal(
            deduped.filter((number) => number === ownPublished).length,
            1
        );
        const dedupedRow = (
            await namecards.listCollection({
                accountId: OWNER,
                limit: 24,
                offset: 0,
                includeOwn: true
            })
        ).rows.find((row) => row.card_number === ownPublished);
        assert.equal(dedupedRow?.own, false);
    });

    postgresTest('filters by q, group and series', async () => {
        const { publish, collect, numbers } = await collectionFixture();
        const alice = await publish('card-filter-alice', {
            producerName: 'Alice Producer',
            seriesCodes: ['ml']
        });
        const groupCard = await publish('card-filter-group', {
            producerName: '',
            isGroupCard: true,
            groupName: 'GroupBeta',
            seriesCodes: ['876']
        });
        const crossSeries = await publish('card-filter-cross', {
            producerName: 'Nobody',
            seriesCodes: ['765', 'cg'],
            groupName: 'GroupBeta'
        });
        for (const cardNumber of [alice, groupCard, crossSeries]) {
            await collect(cardNumber, '2026-01-01T00:00:00.000Z');
        }

        assert.deepEqual(await numbers({ q: 'alice' }), [alice]);
        // 制作人名称为空时用团体名称检索（有制作人名的卡只查制作人名）。
        assert.deepEqual(await numbers({ q: 'groupbeta' }), [groupCard]);
        assert.deepEqual(await numbers({ groupName: 'groupbeta' }), [
            crossSeries,
            groupCard
        ]);
        // 企划多选是「命中任意一个」。
        assert.deepEqual(await numbers({ seriesCodes: ['cg'] }), [crossSeries]);
        assert.deepEqual(await numbers({ seriesCodes: ['765', 'zzz'] }), [
            crossSeries
        ]);
        // 【不含越境】排除复数企划。
        assert.deepEqual(await numbers({ excludeCross: true }), [
            groupCard,
            alice
        ]);
    });

    postgresTest('filters characters with any, all, excludeOther and excludeCross', async () => {
        const { publish, collect, numbers } = await collectionFixture();
        const haruka = await publish('card-char-haruka', {
            favoriteCharacterIds: [900_001]
        });
        const uzuki = await publish('card-char-uzuki', {
            favoriteCharacterIds: [900_002]
        });
        const both = await publish('card-char-both', {
            favoriteCharacterIds: [900_001, 900_002]
        });
        const cross = await publish('card-char-cross', {
            favoriteCharacterIds: [900_001],
            seriesCodes: ['765', 'cg']
        });
        for (const cardNumber of [haruka, uzuki, both, cross]) {
            await collect(cardNumber, '2026-01-01T00:00:00.000Z');
        }

        assert.deepEqual(
            await numbers({ characterIds: [900_001], match: 'any' }),
            [cross, both, haruka]
        );
        assert.deepEqual(
            await numbers({
                characterIds: [900_001, 900_002],
                match: 'all'
            }),
            [both]
        );
        // 【不含其他】：担当角色必须全部落在筛选项里。
        assert.deepEqual(
            await numbers({
                characterIds: [900_001],
                match: 'any',
                excludeOther: true
            }),
            [cross, haruka]
        );
        assert.deepEqual(
            await numbers({ characterIds: [900_001], excludeCross: true }),
            [both, haruka]
        );
    });

    postgresTest('a deleted card stays sortable and filterable through its snapshot', async () => {
        const { publish, collect, list, numbers, database } =
            await collectionFixture();
        const deleted = await publish('card-snapshot-card', {
            producerName: 'SnapName',
            seriesCodes: ['cg'],
            groupName: 'SnapshotGroup',
            madeOn: '2016',
            favoriteCharacterIds: [CHARACTER_IDS.idolLate]
        });
        const alpha = await publish('card-snapshot-alpha', {
            producerName: 'alpha'
        });
        await collect(deleted, '2026-01-01T00:00:00.000Z');
        await collect(alpha, '2026-01-02T00:00:00.000Z');

        await executeSql(database, 'DELETE FROM fudaba_cards WHERE id=?', [
            'card-snapshot-card'
        ]);
        const rows = await list();
        const entry = rows.rows.find((row) => row.card_number === deleted);
        assert.ok(entry);
        assert.equal(entry.card, null);
        assert.deepEqual([...entry.snapshot.seriesCodes], ['cg']);
        assert.deepEqual([...entry.snapshot.favoriteCharacterIds], [
            CHARACTER_IDS.idolLate
        ]);
        assert.equal(entry.snapshot.groupName, 'SnapshotGroup');
        assert.equal(entry.snapshot.madeOn, '2016');

        assert.deepEqual(await numbers({ q: 'snapname' }), [deleted]);
        assert.deepEqual(await numbers({ seriesCodes: ['cg'] }), [deleted]);
        assert.deepEqual(await numbers({ groupName: 'snapshotgroup' }), [
            deleted
        ]);
        assert.deepEqual(
            await numbers({ characterIds: [CHARACTER_IDS.idolLate] }),
            [deleted]
        );
        assert.deepEqual(await numbers({ sort: 'name' }), [alpha, deleted]);
        // 没有 `madeOn` 的条目按创建时间回退；删除卡没有创建时间，退回交换时间。
        assert.deepEqual(await numbers({ sort: 'date', dir: 'asc' }), [
            deleted,
            alpha
        ]);
    });
});
