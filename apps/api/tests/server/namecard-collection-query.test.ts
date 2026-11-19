/**
 * 名片册列表的参数化查询（PRD §3 / §4 / §7.1）跑在真库上：排序、搜索、高级筛选、
 * 两个开关、所属用户与分页都直接断言 `listCollection` 的结果——它把「收到的条目」与
 * 「我自己的名片」合并成一份集合，排序与筛选只在这里做一次。
 *
 * 卡片行被删除（后台判删打 `deleted_at`、或者物理删除）的条目整条不出现：列表与 `total`
 * 同步排除，`snapshot` 只在卡行仍在、状态暂不入册（如 `approving`）时接手投影。
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
const OTHER_OWNER = 'owner-two';
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
    await seedPlatformAccount(fixture, OTHER_OWNER);
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
        overrides: Partial<NewFudabaCardInput> = {},
        owner = OWNER
    ): Promise<number> {
        await fixture.repository.createCard(
            makeFudabaCardInput(id, owner, { exchangeMode: 'auto', ...overrides })
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
    function collect(cardNumber: number, obtainedAt: string, owner = OWNER) {
        return namecards.commitExchange({
            id: randomUUID(),
            clientExchangeId: `client-${randomUUID()}`,
            source: 'card-share',
            initiatorAccountId: COLLECTOR,
            targetAccountId: owner,
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
        const { publish, collect, numbers } = await collectionFixture();
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
        for (const [cardNumber, at] of [
            [english, '2026-01-01T00:00:00.000Z'],
            [kana, '2026-01-02T00:00:00.000Z'],
            [pinyin, '2026-01-03T00:00:00.000Z'],
            [symbol, '2026-01-04T00:00:00.000Z']
        ] as const) {
            await collect(cardNumber, at);
        }

        assert.deepEqual(await numbers({ sort: 'name' }), [
            english,
            kana,
            pinyin,
            symbol
        ]);
        // 单一拉丁键混排（英文/假名罗马音/拼音一起比较），特殊符号照样垫底；
        // 倒序只翻转比较键。
        assert.deepEqual(await numbers({ sort: 'name', dir: 'desc' }), [
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
        // 团体是子串匹配（忽略大小写），不是全等。
        assert.deepEqual(await numbers({ groupName: 'beta' }), [
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

    postgresTest('a deleted card drops out of the list and the total', async () => {
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
        // 卡片行物理删除后，条目与快照仍在（`card_id` 置空），但整条不再进列表。
        const rows = await list();
        assert.equal(rows.total, 1);
        assert.deepEqual(
            rows.rows.map((row) => row.card_number),
            [alpha]
        );
        assert.ok(rows.rows[0]?.card, '卡片行还在的条目仍带实时投影');

        // 删除卡不再参与任何筛选或排序：命中它的条件都返回空。
        assert.deepEqual(await numbers({ q: 'snapname' }), []);
        assert.deepEqual(await numbers({ seriesCodes: ['cg'] }), []);
        assert.deepEqual(await numbers({ groupName: 'snapshotgroup' }), []);
        assert.deepEqual(
            await numbers({ characterIds: [CHARACTER_IDS.idolLate] }),
            []
        );
        assert.deepEqual(await numbers({ sort: 'name' }), [alpha]);
        assert.deepEqual(await numbers({ sort: 'date', dir: 'asc' }), [alpha]);
    });

    postgresTest('an entry whose card row is missing never reaches the list or the total', async () => {
        const { publish, collect, list, numbers, database } =
            await collectionFixture();
        const kept = await publish('card-missing-kept');
        const softDeleted = await publish('card-missing-soft-deleted');
        const physicallyDeleted = await publish('card-missing-physically-deleted');
        await collect(kept, '2026-01-01T00:00:00.000Z');
        await collect(softDeleted, '2026-01-02T00:00:00.000Z');
        await collect(physicallyDeleted, '2026-01-03T00:00:00.000Z');

        // 后台判删只打 `deleted_at`；物理删除会同时把条目的 `card_id` 置空。
        await executeSql(database, 'UPDATE fudaba_cards SET deleted_at=CURRENT_TIMESTAMP WHERE id=?', [
            'card-missing-soft-deleted'
        ]);
        await executeSql(database, 'DELETE FROM fudaba_cards WHERE id=?', [
            'card-missing-physically-deleted'
        ]);

        const page = await list({ sort: 'exchange', dir: 'asc' });
        assert.equal(page.total, 1);
        assert.deepEqual(
            page.rows.map((row) => row.card_number),
            [kept]
        );
        // 条目仍然留着：快照与编号是交换当时的记录，只是默认不再展示。
        const entries = await queryOne<{ total: number | string }>(
            database,
            `SELECT count(*) AS total FROM namecard_collection_entries
              WHERE collector_account_id=?`,
            [COLLECTOR]
        );
        assert.equal(Number(entries?.total), 3);
        assert.deepEqual(await numbers({ includeHidden: true }), [kept]);
    });

    postgresTest('filters by card owner and keeps own cards out for other owners', async () => {
        const { publish, collect, list, numbers } = await collectionFixture();
        const fromOwner = await publish('card-owner-first');
        const fromOther = await publish('card-owner-second', {}, OTHER_OWNER);
        const own = await publish('card-owner-own', {}, COLLECTOR);
        await collect(fromOwner, '2026-01-01T00:00:00.000Z', OWNER);
        await collect(fromOther, '2026-01-02T00:00:00.000Z', OTHER_OWNER);

        assert.deepEqual(await numbers({ owner: OWNER }), [fromOwner]);
        assert.deepEqual(await numbers({ owner: OTHER_OWNER }), [fromOther]);
        assert.deepEqual(await numbers({ owner: 'nobody' }), []);

        // 卡主不是自己时，`includeOwn` 不会把「我的名片」并进来。
        const otherPage = await list({ owner: OTHER_OWNER, includeOwn: true });
        assert.equal(otherPage.total, 1);
        assert.deepEqual(
            otherPage.rows.map((row) => row.card_number),
            [fromOther]
        );

        // 卡主是自己：自己的名片能被筛出来，收到的条目全部排除。
        const ownPage = await list({ owner: COLLECTOR, includeOwn: true });
        assert.equal(ownPage.total, 1);
        assert.deepEqual(
            ownPage.rows.map((row) => row.card_number),
            [own]
        );
        assert.equal(ownPage.rows[0]?.own, true);
        // 不带 `includeOwn` 时自己的名片不参与，只剩「以自己为卡主」的条目（没有）。
        assert.deepEqual(await numbers({ owner: COLLECTOR }), []);
    });

    postgresTest('entries carry the card owner identity for the producer link', async () => {
        const { publish, collect, list, database } = await collectionFixture();
        await executeSql(
            database,
            `INSERT INTO platform_profiles (account_id, display_name, bio, updated_at)
             VALUES (?, ?, '', ?), (?, ?, '', ?)`,
            [
                OWNER,
                'Owner Name',
                Date.now(),
                COLLECTOR,
                'Collector Name',
                Date.now()
            ]
        );
        const fromOwner = await publish('card-owner-identity', {}, OWNER);
        // 卡主是 OTHER_OWNER，但没写资料行：账号可用却解析不到 → null。
        const fromUnknown = await publish(
            'card-owner-identity-unknown',
            {},
            OTHER_OWNER
        );
        const own = await publish('card-owner-identity-own', {}, COLLECTOR);
        await collect(fromOwner, '2026-01-01T00:00:00.000Z', OWNER);
        await collect(fromUnknown, '2026-01-02T00:00:00.000Z', OTHER_OWNER);

        const page = await list({ includeOwn: true });
        const received = page.rows.find(
            (row) => row.card_number === fromOwner
        );
        const unknown = page.rows.find(
            (row) => row.card_number === fromUnknown
        );
        const mine = page.rows.find((row) => row.card_number === own);
        assert.equal(received?.owner?.account_id, OWNER);
        assert.equal(received?.owner?.display_name, 'Owner Name');
        assert.match(received?.owner?.uid ?? '', /^[1-9]\d*$/);
        // `includeOwn` 带出的自己的名片：owner 就是当前用户。
        assert.equal(mine?.owner?.account_id, COLLECTOR);
        assert.equal(mine?.owner?.display_name, 'Collector Name');
        assert.notEqual(mine?.owner?.uid, received?.owner?.uid);
        assert.equal(unknown?.owner, null);
    });

    postgresTest('invert keeps the rows that miss the content filters', async () => {
        const { publish, collect, numbers } = await collectionFixture();
        const alice = await publish('card-invert-alice', {
            producerName: 'Alice',
            seriesCodes: ['ml'],
            favoriteCharacterIds: [900_001]
        });
        const bob = await publish('card-invert-bob', {
            producerName: 'Bob',
            seriesCodes: ['cg'],
            favoriteCharacterIds: [900_002]
        });
        const carol = await publish('card-invert-carol', {
            producerName: 'Carol',
            seriesCodes: ['765'],
            favoriteCharacterIds: [900_001, 900_002]
        });
        // 不同企划的卡：参与【不含越境】的取反。
        const cross = await publish('card-invert-cross', {
            producerName: 'Dana',
            seriesCodes: ['765', 'cg'],
            favoriteCharacterIds: [900_001]
        });
        for (const [cardNumber, at] of [
            [alice, '2026-01-01T00:00:00.000Z'],
            [bob, '2026-01-02T00:00:00.000Z'],
            [carol, '2026-01-03T00:00:00.000Z'],
            [cross, '2026-01-04T00:00:00.000Z']
        ] as const) {
            await collect(cardNumber, at);
        }

        // 默认倒序：cross, carol, bob, alice。
        assert.deepEqual(await numbers({ q: 'alice' }), [alice]);
        assert.deepEqual(await numbers({ q: 'alice', invert: true }), [
            cross,
            carol,
            bob
        ]);
        assert.deepEqual(await numbers({ seriesCodes: ['cg'], invert: true }), [
            carol,
            alice
        ]);
        // 角色「命中任意一个」整体取反。
        assert.deepEqual(
            await numbers({
                characterIds: [900_001],
                match: 'any',
                invert: true
            }),
            [bob]
        );
        // 角色「同时包含」命中 carol，取反后留下另外三张。
        assert.deepEqual(
            await numbers({
                characterIds: [900_001, 900_002],
                match: 'all',
                invert: true
            }),
            [cross, bob, alice]
        );
        // 【不含越境】本身是内容条件，取反后只剩越境的那张。
        assert.deepEqual(await numbers({ excludeCross: true, invert: true }), [
            cross
        ]);
    });

    postgresTest('declaration selects original or AI cards and joins the inverted set', async () => {
        const { publish, collect, numbers } = await collectionFixture();
        const original = await publish('card-declaration-original', {
            isOriginal: true
        });
        const ai = await publish('card-declaration-ai', {
            madeWithAi: true
        });
        const both = await publish('card-declaration-both', {
            isOriginal: true,
            madeWithAi: true
        });
        const neither = await publish('card-declaration-neither');
        for (const [cardNumber, at] of [
            [original, '2026-01-01T00:00:00.000Z'],
            [ai, '2026-01-02T00:00:00.000Z'],
            [both, '2026-01-03T00:00:00.000Z'],
            [neither, '2026-01-04T00:00:00.000Z']
        ] as const) {
            await collect(cardNumber, at);
        }

        assert.deepEqual(await numbers({ declaration: 'original' }), [
            both,
            original
        ]);
        assert.deepEqual(await numbers({ declaration: 'ai' }), [both, ai]);
        // 声明与其它内容条件同属命中集合：取反后两种声明都不命中的卡留下。
        assert.deepEqual(
            await numbers({ declaration: 'original', invert: true }),
            [neither, ai]
        );
        assert.deepEqual(await numbers({ declaration: 'ai', invert: true }), [
            neither,
            original
        ]);
    });

    postgresTest('invert leaves scope switches alone and is a no-op without content filters', async () => {
        const { publish, collect, numbers, namecards } = await collectionFixture();
        const hiddenContent = await publish('card-invert-hidden', {
            producerName: 'HiddenContent'
        });
        const visibleContent = await publish('card-invert-visible', {
            producerName: 'VisibleContent'
        });
        await collect(hiddenContent, '2026-01-01T00:00:00.000Z');
        await collect(visibleContent, '2026-01-02T00:00:00.000Z');
        await namecards.setCollectionHidden({
            accountId: COLLECTOR,
            cardNumber: hiddenContent,
            hidden: true,
            at: '2026-01-03T00:00:00.000Z'
        });

        // `includeHidden` 是范围条件：反向排除后隐藏条目仍要由它决定是否进册，
        // 取反本身既不会把它翻进来，也不会把它翻出去。
        assert.deepEqual(
            await numbers({ q: 'visiblecontent', invert: true }),
            []
        );
        assert.deepEqual(
            await numbers({
                q: 'visiblecontent',
                invert: true,
                includeHidden: true
            }),
            [hiddenContent]
        );
        // 没有任何内容条件时，取反等价于不过滤。
        assert.deepEqual(await numbers({ invert: true }), [visibleContent]);
        assert.deepEqual(await numbers(), [visibleContent]);
        assert.deepEqual(
            await numbers({ invert: true, includeHidden: true }),
            await numbers({ includeHidden: true })
        );

        // `includeOwn` 同样是范围条件：自己的名片照常并入，只有内容条件被取反。
        const ownHit = await publish(
            'card-invert-own-hit',
            { producerName: 'OwnHit' },
            OTHER_OWNER
        );
        const ownMiss = await publish(
            'card-invert-own-miss',
            { producerName: 'OwnMiss' },
            OTHER_OWNER
        );
        assert.deepEqual(
            (await numbers({ includeOwn: true, invert: true }, OTHER_OWNER)).sort(
                (left, right) => left - right
            ),
            [ownHit, ownMiss].sort((left, right) => left - right)
        );
        assert.deepEqual(
            await numbers(
                { includeOwn: true, q: 'ownhit', invert: true },
                OTHER_OWNER
            ),
            [ownMiss]
        );
    });
});
