/**
 * 标签系统的服务端行为：归一化 / 去重 / 上限、屏蔽词（literal + regex）、
 * 预设解析、候选排序、墙上筛选的 OR 语义，以及管理端的提升 / 别名合并 /
 * 屏蔽 / 删除预设。
 *
 * 全部跑在真库上：标签的归一化比较键、唯一约束与墙上 `EXISTS` 筛选一起验证。
 */
import assert from 'node:assert/strict';
import { describe } from 'vitest';
import { SqlCoreRepository } from '@/infra/db/repositories/core-repository';
import { SqlNamecardTagRepository } from '@/infra/db/repositories/namecard-tag-repository';
import { queryOne } from '@/infra/db/sql/query';
import type { NewFudabaCardInput } from '@/ports/repositories/fudaba';
import {
    createFudabaRepositoryFixture,
    initializedPostgresSchema,
    makeFudabaCardInput,
    seedPlatformAccount
} from '../fixtures/fudaba-card-fixture';
import { cardPageWrite } from '../fixtures/owner-route-fixture';
import { postgresTest } from '../postgres-test-database';

const NOW = '2026-11-20T12:00:00.000Z';

async function tagsFixture() {
    const fixture = await createFudabaRepositoryFixture();
    await seedPlatformAccount(fixture, 'owner');
    const tags = new SqlNamecardTagRepository(fixture.database);
    const wall = new SqlCoreRepository(fixture.database, initializedPostgresSchema);

    async function publish(
        id: string,
        overrides: Partial<NewFudabaCardInput> = {}
    ): Promise<string> {
        await fixture.repository.createCard(
            makeFudabaCardInput(id, 'owner', {
                favoriteCharacterIds: [],
                seriesCodes: ['765'],
                pages: [cardPageWrite('front')],
                ...overrides
            })
        );
        return id;
    }

    const replace = (cardId: string, names: string[]) =>
        tags.replace({ cardId, names });

    const firstSeen = async (normalized: string) => {
        const row = await queryOne<{ first_seen_at: string | Date }>(
            fixture.database,
            `SELECT first_seen_at FROM namecard_tag_registry WHERE normalized=?`,
            [normalized]
        );
        return row ? new Date(row.first_seen_at).toISOString() : null;
    };
    const registryCount = async (normalized: string) =>
        Number(
            (
                await queryOne<{ count: number | string }>(
                    fixture.database,
                    `SELECT COUNT(*)::int AS count FROM namecard_tag_registry WHERE normalized=?`,
                    [normalized]
                )
            )?.count ?? 0
        );

    return { ...fixture, tags, wall, publish, replace, firstSeen, registryCount };
}

describe('namecard tags', () => {
    postgresTest('normalizes, dedupes and rejects oversized sets', async () => {
        const { publish, replace } = await tagsFixture();
        const card = await publish('tags-normalize');

        const saved = await replace(card, [
            '  Vocaloid  ',
            'vocaloid',
            'ＡＢＣ',
            'abc',
            '双  空格'
        ]);
        assert.deepEqual(
            saved.map((tag) => tag.name),
            ['Vocaloid', 'ABC', '双 空格']
        );

        await assert.rejects(
            replace(
                card,
                Array.from({ length: 21 }, (_, index) => `tag-${index}`)
            ),
            /最多 20 个标签/
        );
        await assert.rejects(
            replace(card, ['x'.repeat(65)]),
            /长度无效/
        );
    });

    postgresTest('blocklist rejects new writes by literal and regex', async () => {
        const { tags, publish, replace } = await tagsFixture();
        const card = await publish('tags-blocklist');
        await tags.createBlocklist({
            pattern: 'spam',
            isRegex: false,
            now: NOW
        });
        await tags.createBlocklist({
            pattern: '^bad\\d+$',
            isRegex: true,
            now: NOW
        });

        await assert.rejects(
            replace(card, ['Spam 名片']),
            /标签「Spam 名片」被屏蔽/
        );
        await assert.rejects(replace(card, ['bad42']), /被屏蔽/);
        // 既有标签不受屏蔽词回溯删除；只有新写入被拦。
        const saved = await replace(card, ['正常标签']);
        assert.deepEqual(saved.map((tag) => tag.name), ['正常标签']);
    });

    postgresTest('resolves presets by name and alias, and keeps tags out of pending', async () => {
        const { tags, database, publish, replace } = await tagsFixture();
        const card = await publish('tags-preset');
        const preset = await tags.createPreset({
            name: 'Vocaloid',
            aliases: ['ボーカロイド'],
            now: NOW
        });

        const saved = await replace(card, ['vocaloid', 'ボーカロイド']);
        // 名称与别名指向同一预设：写入即去重，只留一条。
        assert.deepEqual(saved.map((tag) => tag.presetId), [preset.id]);

        // 标签即时生效，但没有写进待审载荷（内容审核与标签解耦）。
        const row = await queryOne<{ pending_payload: unknown }>(
            database,
            'SELECT pending_payload FROM fudaba_cards WHERE id=?',
            [card]
        );
        assert.equal(row?.pending_payload, null);
        const stored = await tags.listForCards([card]);
        assert.equal(stored.get(card)?.length, 1);
        assert.equal(stored.get(card)?.[0]?.name, 'Vocaloid');
    });

    postgresTest('deleting a preset returns its tags to free tags', async () => {
        const { tags, publish, replace } = await tagsFixture();
        const card = await publish('tags-preset-delete');
        const preset = await tags.createPreset({
            name: 'Rock',
            aliases: [],
            now: NOW
        });
        await replace(card, ['Rock']);

        assert.equal(await tags.deletePreset(preset.id), true);
        const stored = await tags.listForCards([card]);
        assert.deepEqual(stored.get(card), [{ name: 'Rock', presetId: null }]);
    });

    postgresTest('suggests only presets, matching name or alias with prefix first', async () => {
        const { tags } = await tagsFixture();
        await tags.createPreset({ name: 'Alpha', aliases: [], now: NOW });
        await tags.createPreset({ name: 'Alphabet', aliases: [], now: NOW });
        await tags.createPreset({
            name: 'Gamma',
            aliases: ['Alp'],
            now: NOW
        });
        await tags.createPreset({ name: 'Beta', aliases: [], now: NOW });

        const result = await tags.suggest({ q: 'alp', limit: 20 });
        assert.deepEqual(
            result.presets.map((preset) => preset.name),
            ['Alpha', 'Alphabet', 'Gamma']
        );
        assert.equal('free' in result, false);
    });

    postgresTest('wall filter matches tags with OR and resolves preset aliases', async () => {
        const { tags, wall, publish, replace } = await tagsFixture();
        const preset = await tags.createPreset({
            name: 'Vocaloid',
            aliases: ['ボーカロイド'],
            now: NOW
        });
        const first = await publish('tags-wall-a', {
            createdAt: '2026-01-01T00:00:00.000Z'
        });
        const second = await publish('tags-wall-b', {
            createdAt: '2026-02-01T00:00:00.000Z'
        });
        const third = await publish('tags-wall-c', {
            createdAt: '2026-03-01T00:00:00.000Z'
        });
        await replace(first, ['Vocaloid']);
        await replace(second, ['Rock Music']);
        await replace(third, ['Vocaloid', 'Rock Music']);

        const numbers = async (query: string[]) =>
            (
                await wall.listApprovedCardsPage({
                    limit: 24,
                    offset: 0,
                    tags: query
                })
            ).rows
                .map((card) => String(card.cardId ?? card.id))
                .sort();

        // 预设别名精确命中。
        assert.deepEqual(await numbers(['ボーカロイド']), [first, third].sort());
        // 自由标签按标签名子串命中。
        assert.deepEqual(await numbers(['rock']), [second, third].sort());
        // 多词之间是 OR。
        assert.deepEqual(
            await numbers(['Vocaloid', 'rock']),
            [first, second, third].sort()
        );
        // 预设名/别名与自由标签同口径：输入子串也能命中。
        // 卡片存的是别名「遊戯王」，搜索预设名里的 tcg 仍应命中。
        await tags.createPreset({
            name: '游戏王 (TCG)',
            aliases: ['遊戯王'],
            now: NOW
        });
        await replace(second, ['遊戯王']);
        assert.deepEqual(await numbers(['tcg']), [second]);
        // 命中的标签确实带预设 id。
        const stored = await tags.listForCards([first]);
        assert.equal(stored.get(first)?.[0]?.presetId, preset.id);
    });

    postgresTest('promote, alias merge, block and remove matched tags', async () => {
        const { tags, publish, replace } = await tagsFixture();
        const card = await publish('tags-admin');
        await replace(card, ['Solo', 'Duet', 'Spam Word']);

        const promoted = await tags.promoteFreeTag({
            name: 'Solo',
            aliases: ['ソロ'],
            now: NOW
        });
        let stored = await tags.listForCards([card]);
        assert.equal(
            stored.get(card)?.find((tag) => tag.name === 'Solo')?.presetId,
            promoted.id
        );

        const merged = await tags.mergeFreeTag({
            id: promoted.id,
            name: 'Duet',
            now: NOW
        });
        assert.deepEqual([...merged.aliases].sort(), ['Duet', 'ソロ'].sort());
        stored = await tags.listForCards([card]);
        // 并入别名后展示以预设名为准，且同一预设在一张卡上只出现一次。
        const canon = stored.get(card)?.filter((tag) => tag.presetId === promoted.id) ?? [];
        assert.equal(canon.length, 1);
        assert.equal(canon[0]?.name, 'Solo');

        // 屏蔽并移除：现存标签被删掉，屏蔽词入库。
        const blocked = await tags.blockFreeTag({
            name: 'Spam Word',
            pattern: 'spam',
            isRegex: false,
            now: NOW
        });
        assert.equal(blocked.removed, 1);
        stored = await tags.listForCards([card]);
        assert.equal(
            stored.get(card)?.some((tag) => tag.name === 'Spam Word'),
            false
        );

        // 屏蔽词命中的既有自由标签可一键移除。
        await replace(card, ['Noisy']);
        stored = await tags.listForCards([card]);
        assert.deepEqual(
            stored.get(card)?.map((tag) => tag.name),
            ['Noisy']
        );
        const regex = await tags.createBlocklist({
            pattern: 'nois',
            isRegex: false,
            now: NOW
        });
        const matches = await tags.listBlockedMatches();
        assert.deepEqual(
            matches.map((match) => [match.name, match.patternId]),
            [['Noisy', regex.id]]
        );
        assert.equal(await tags.removeBlocklistMatches(regex.id), 1);
    });

    postgresTest('records the first time a free tag appeared', async () => {
        const { firstSeen, registryCount, publish, replace } = await tagsFixture();
        const first = await publish('tags-first-seen-a');
        const second = await publish('tags-first-seen-b');
        await replace(first, ['冷门企划']);
        const before = await firstSeen('冷门企划');
        assert.ok(before);

        await replace(second, ['其他标签', '冷门企划']);
        const after = await firstSeen('冷门企划');
        assert.equal(after, before);
        assert.equal(await registryCount('冷门企划'), 1);
    });

    postgresTest('blockedNames reports literal and regex matches for pre-submit checks', async () => {
        const { tags } = await tagsFixture();
        await tags.createBlocklist({ pattern: 'spam', isRegex: false, now: NOW });
        await tags.createBlocklist({ pattern: '^bad\\d+$', isRegex: true, now: NOW });

        assert.deepEqual(await tags.blockedNames(['Not SPAM', 'Bad123', '正常']), [
            'Not SPAM',
            'Bad123'
        ]);
    });

    postgresTest('admin lists paginate and search by normalized name', async () => {
        const { tags, publish, replace } = await tagsFixture();
        const first = await publish('tags-paging-a');
        const second = await publish('tags-paging-b');
        await replace(first, ['Alpha', 'Beta']);
        await replace(second, ['Alpha']);

        const pageOne = await tags.listFree({
            q: null,
            sort: 'frequency',
            limit: 1,
            offset: 0
        });
        assert.equal(pageOne.total, 2);
        assert.deepEqual(pageOne.items, [{ name: 'Alpha', count: 2 }]);

        const searched = await tags.listFree({
            q: 'bet',
            sort: 'frequency',
            limit: 20,
            offset: 0
        });
        assert.deepEqual(searched.items, [{ name: 'Beta', count: 1 }]);

        const beyond = await tags.listFree({
            q: null,
            sort: 'frequency',
            limit: 1,
            offset: 2
        });
        assert.deepEqual(beyond.items, []);
        assert.equal(beyond.total, 2);
    });
});
