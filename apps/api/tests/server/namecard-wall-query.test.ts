/**
 * 名片墙列表的参数化查询跑在真库上：筛选 / 排序与名片册同一套语义，但墙上
 * 没有交换时间——`created` 与所有排序兜底都用名片创建时间。可见性口径仍是
 * `published` + `visible` + 公开来源 + 未删除，与既有的 `listApprovedCards` 一致。
 */
import assert from 'node:assert/strict';
import { describe } from 'vitest';
import { SqlCoreRepository } from '@/infra/db/repositories/core-repository';
import { executeSql, queryOne } from '@/infra/db/sql/query';
import type { NewFudabaCardInput } from '@/ports/repositories/fudaba';
import type { NamecardWallQueryRecord } from '@/ports/repositories';
import {
    createFudabaRepositoryFixture,
    initializedPostgresSchema,
    makeFudabaCardInput,
    seedPlatformAccount
} from '../fixtures/fudaba-card-fixture';
import { postgresTest } from '../postgres-test-database';

/** 【按企划】需要不同的 (category, display_order)：目录里补三个测试角色。 */
const CHARACTER_IDS = {
    /** 本家偶像，目录排序 5。 */
    idolLate: 910_001,
    /** 事务员，目录排序 0：分类更靠后，但同分类里目录值最小。 */
    staff: 910_002,
    /** 角色，目录排序 0：业务分类排在事务员之后，字符串字典序却最小。 */
    chara: 910_003
} as const;

async function wallFixture() {
    const fixture = await createFudabaRepositoryFixture();
    const namecards = new SqlCoreRepository(
        fixture.database,
        initializedPostgresSchema
    );
    await seedPlatformAccount(fixture, 'owner');
    await executeSql(
        fixture.database,
        `INSERT INTO namecard_characters
             (id, agency_id, category, is_fallback, name_cn, display_order)
         VALUES (?, 1, 'idol', FALSE, '测试副担当', 5),
                (?, 1, 'staff', FALSE, '测试事务员', 0),
                (?, 1, 'chara', FALSE, '测试角色', 0)`,
        [CHARACTER_IDS.idolLate, CHARACTER_IDS.staff, CHARACTER_IDS.chara]
    );

    async function publish(
        id: string,
        overrides: Partial<NewFudabaCardInput> = {}
    ): Promise<number> {
        await fixture.repository.createCard(
            makeFudabaCardInput(id, 'owner', overrides)
        );
        const row = await queryOne<{ card_number: number | string }>(
            fixture.database,
            'SELECT card_number FROM fudaba_cards WHERE id=?',
            [id]
        );
        assert.ok(row, `card ${id} was not created`);
        return Number(row.card_number);
    }

    const list = (input: Partial<NamecardWallQueryRecord> = {}) =>
        namecards.listApprovedCardsPage({ limit: 24, offset: 0, ...input });

    const numbers = async (input: Partial<NamecardWallQueryRecord> = {}) =>
        (await list(input)).rows.map((card) => Number(card.card_number));

    return { ...fixture, namecards, publish, list, numbers };
}

describe('namecard wall queries', () => {
    postgresTest('sorts by the created time in both directions and paginates', async () => {
        const { publish, list, numbers } = await wallFixture();
        const first = await publish('wall-created-first', {
            createdAt: '2026-01-01T00:00:00.000Z'
        });
        const second = await publish('wall-created-second', {
            createdAt: '2026-02-01T00:00:00.000Z'
        });
        const third = await publish('wall-created-third', {
            createdAt: '2026-03-01T00:00:00.000Z'
        });

        // 默认：创建时间倒序（最新在前）。
        assert.deepEqual(await numbers(), [third, second, first]);
        assert.deepEqual(await numbers({ sort: 'created', dir: 'asc' }), [
            first,
            second,
            third
        ]);

        const page = await list({
            sort: 'created',
            dir: 'asc',
            limit: 2,
            offset: 2
        });
        assert.equal(page.total, 3);
        assert.deepEqual(
            page.rows.map((card) => card.card_number),
            [third]
        );
    });

    postgresTest('sorts by the name metadata and keeps symbols last', async () => {
        const { publish, numbers } = await wallFixture();
        const english = await publish('wall-name-english', {
            producerName: 'alpha'
        });
        const kana = await publish('wall-name-kana', {
            producerName: '春香',
            producerReading: 'はるか'
        });
        const pinyin = await publish('wall-name-pinyin', {
            producerName: '天海春香'
        });
        const symbol = await publish('wall-name-symbol', { producerName: '★' });

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

    postgresTest('orders single-series cards by the agency catalog', async () => {
        const { publish, numbers } = await wallFixture();
        // 企划目录顺序：765(0) → 876(1) → cg(2) → ml(3)。
        const ml = await publish('wall-series-ml', {
            seriesCodes: ['ml'],
            favoriteCharacterIds: [CHARACTER_IDS.staff]
        });
        const first = await publish('wall-series-765', {
            seriesCodes: ['765'],
            favoriteCharacterIds: [CHARACTER_IDS.chara]
        });
        const cg = await publish('wall-series-cg', {
            seriesCodes: ['cg'],
            favoriteCharacterIds: [900_001]
        });

        // 单企划组内按企划目录顺序，`dir` 只翻转这一层。
        assert.deepEqual(await numbers({ sort: 'series' }), [first, cg, ml]);
        assert.deepEqual(await numbers({ sort: 'series', dir: 'desc' }), [
            ml,
            cg,
            first
        ]);
    });

    postgresTest('keeps multi-series cards after every single-series card', async () => {
        const { publish, numbers } = await wallFixture();
        const single = await publish('wall-series-single', {
            seriesCodes: ['ml'],
            favoriteCharacterIds: [CHARACTER_IDS.staff],
            createdAt: '2026-03-01T00:00:00.000Z'
        });
        // 多企划彼此也不比较企划：只有创建时间兜底。
        const multiFirst = await publish('wall-series-multi-a', {
            seriesCodes: ['765', 'cg'],
            favoriteCharacterIds: [900_002],
            createdAt: '2026-01-01T00:00:00.000Z'
        });
        const multiSecond = await publish('wall-series-multi-b', {
            seriesCodes: ['ml', 'cg'],
            favoriteCharacterIds: [900_002],
            createdAt: '2026-02-01T00:00:00.000Z'
        });

        // 层级固定：倒序也翻不动「单企划在前、多企划在后」。
        const expected = [single, multiFirst, multiSecond];
        assert.deepEqual(await numbers({ sort: 'series' }), expected);
        assert.deepEqual(await numbers({ sort: 'series', dir: 'desc' }), expected);
    });

    postgresTest('orders series peers by the first character business category', async () => {
        const { publish, numbers } = await wallFixture();
        const idolFirst = await publish('wall-series-character-idol', {
            seriesCodes: ['765'],
            favoriteCharacterIds: [900_001]
        });
        const idolLate = await publish('wall-series-character-idol-late', {
            seriesCodes: ['765'],
            favoriteCharacterIds: [CHARACTER_IDS.idolLate]
        });
        const chara = await publish('wall-series-character-chara', {
            seriesCodes: ['765'],
            favoriteCharacterIds: [CHARACTER_IDS.chara]
        });
        const staff = await publish('wall-series-character-staff', {
            seriesCodes: ['765'],
            favoriteCharacterIds: [CHARACTER_IDS.staff]
        });

        // idol(0) → staff(1) → chara(4)：业务分类先于目录排序值；字典序会把
        // chara 排在 idol 前面，同分类里再按 display_order。
        assert.deepEqual(await numbers({ sort: 'series' }), [
            idolFirst,
            idolLate,
            staff,
            chara
        ]);
        assert.deepEqual(await numbers({ sort: 'series', dir: 'desc' }), [
            chara,
            staff,
            idolLate,
            idolFirst
        ]);
    });

    postgresTest('sorts by made-on precision and falls back to the created time', async () => {
        const { publish, numbers } = await wallFixture();
        const fullDate = await publish('wall-date-full', {
            madeOn: '2020-05-06',
            createdAt: '2021-01-01T00:00:00.000Z'
        });
        const monthDate = await publish('wall-date-month', {
            madeOn: '2018-12',
            createdAt: '2021-01-01T00:00:00.000Z'
        });
        const yearOnly = await publish('wall-date-year', {
            madeOn: '2019',
            createdAt: '2021-01-01T00:00:00.000Z'
        });
        const noDateEarly = await publish('wall-date-none-early', {
            madeOn: null,
            createdAt: '2017-01-01T00:00:00.000Z'
        });
        const noDateLate = await publish('wall-date-none-late', {
            madeOn: null,
            createdAt: '2022-01-01T00:00:00.000Z'
        });

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

    postgresTest('filters by q, group, series and excludeCross', async () => {
        const { publish, list, numbers } = await wallFixture();
        const alice = await publish('wall-filter-alice', {
            producerName: 'Alice Producer',
            seriesCodes: ['ml'],
            createdAt: '2026-01-01T00:00:00.000Z'
        });
        const groupCard = await publish('wall-filter-group', {
            producerName: '',
            isGroupCard: true,
            groupName: 'GroupBeta',
            seriesCodes: ['876'],
            createdAt: '2026-02-01T00:00:00.000Z'
        });
        const crossSeries = await publish('wall-filter-cross', {
            producerName: 'Nobody',
            seriesCodes: ['765', 'cg'],
            groupName: 'GroupBeta',
            createdAt: '2026-03-01T00:00:00.000Z'
        });

        assert.deepEqual(await numbers({ q: 'alice' }), [alice]);
        // 制作人名称为空时用团体名称检索（有制作人名的卡只查制作人名）。
        assert.deepEqual(await numbers({ q: 'groupbeta' }), [groupCard]);
        // 团体是子串匹配（忽略大小写），不是全等。
        assert.deepEqual(await numbers({ groupName: 'groupbeta' }), [
            crossSeries,
            groupCard
        ]);
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

        // 分页的 total 与筛选后的集合一致。
        const filtered = await list({ q: 'groupbeta', limit: 1 });
        assert.equal(filtered.total, 1);
        assert.equal(filtered.rows.length, 1);
    });

    postgresTest('filters characters with any, all, excludeOther and excludeCross', async () => {
        const { publish, numbers } = await wallFixture();
        const haruka = await publish('wall-char-haruka', {
            favoriteCharacterIds: [900_001],
            createdAt: '2026-01-01T00:00:00.000Z'
        });
        const uzuki = await publish('wall-char-uzuki', {
            favoriteCharacterIds: [900_002],
            createdAt: '2026-02-01T00:00:00.000Z'
        });
        const both = await publish('wall-char-both', {
            favoriteCharacterIds: [900_001, 900_002],
            createdAt: '2026-03-01T00:00:00.000Z'
        });
        const cross = await publish('wall-char-cross', {
            favoriteCharacterIds: [900_001],
            seriesCodes: ['765', 'cg'],
            createdAt: '2026-04-01T00:00:00.000Z'
        });

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

    postgresTest('declaration selects original or AI cards and joins the inverted set', async () => {
        const { publish, numbers } = await wallFixture();
        const original = await publish('wall-declaration-original', {
            isOriginal: true,
            createdAt: '2026-01-01T00:00:00.000Z'
        });
        const ai = await publish('wall-declaration-ai', {
            madeWithAi: true,
            createdAt: '2026-02-01T00:00:00.000Z'
        });
        const both = await publish('wall-declaration-both', {
            isOriginal: true,
            madeWithAi: true,
            createdAt: '2026-03-01T00:00:00.000Z'
        });
        const neither = await publish('wall-declaration-neither', {
            createdAt: '2026-04-01T00:00:00.000Z'
        });

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

    postgresTest('invert keeps the rows that miss the content filters', async () => {
        const { publish, numbers } = await wallFixture();
        const alice = await publish('wall-invert-alice', {
            producerName: 'Alice',
            seriesCodes: ['ml'],
            favoriteCharacterIds: [900_001],
            createdAt: '2026-01-01T00:00:00.000Z'
        });
        const bob = await publish('wall-invert-bob', {
            producerName: 'Bob',
            seriesCodes: ['cg'],
            favoriteCharacterIds: [900_002],
            createdAt: '2026-02-01T00:00:00.000Z'
        });
        const carol = await publish('wall-invert-carol', {
            producerName: 'Carol',
            seriesCodes: ['765'],
            favoriteCharacterIds: [900_001, 900_002],
            createdAt: '2026-03-01T00:00:00.000Z'
        });
        const cross = await publish('wall-invert-cross', {
            producerName: 'Dana',
            seriesCodes: ['765', 'cg'],
            favoriteCharacterIds: [900_001],
            createdAt: '2026-04-01T00:00:00.000Z'
        });

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

    postgresTest('invert is a no-op without content filters', async () => {
        const { publish, numbers } = await wallFixture();
        const first = await publish('wall-invert-none-first', {
            createdAt: '2026-01-01T00:00:00.000Z'
        });
        const second = await publish('wall-invert-none-second', {
            createdAt: '2026-02-01T00:00:00.000Z'
        });

        // 没有任何内容条件时，取反等价于不过滤：不能把所有行都排除。
        assert.deepEqual(await numbers({ invert: true }), [second, first]);
        assert.deepEqual(await numbers(), [second, first]);
    });

    postgresTest('keeps the wall visibility gate', async () => {
        const { publish, list, numbers } = await wallFixture();
        const published = await publish('wall-visible-published');
        await publish('wall-visible-hidden', {
            publicationStatus: 'hidden'
        });
        await publish('wall-visible-off', { visible: false });

        assert.deepEqual(await numbers(), [published]);
        const page = await list();
        assert.equal(page.total, 1);
    });
});
