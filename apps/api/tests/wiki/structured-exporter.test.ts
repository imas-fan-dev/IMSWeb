import assert from 'node:assert/strict';
import { describe, test } from 'vitest';
import { compileEnhancedMarkdown } from '@/domains/content/wiki/documents/enhanced-markdown-compiler';
import {
    exportStructuredDocument,
    type StructuredExportInput,
} from '@/domains/content/wiki/documents/structured-document-exporter';

/**
 * Structured-to-Markdown exporter (Ticket 06).
 *
 * Every fixture is an independent literal modelled on one audit §7.2 edge case,
 * and each expectation is the exact Markdown a maintainer would review — not a
 * re-derivation of the exporter's own helpers. Each generated document is then
 * compiled by the real server compiler so the export can never drift away from
 * the dialect it targets.
 */
async function compileExport(markdown: string) {
    return compileEnhancedMarkdown(markdown);
}

describe('structured document exporter', () => {
    test('exports a zero-link gallery with cast subtitles as tags', async () => {
        // 学园偶像大师 / S卡: 170 cards, no sources at all, and every card
        // carries its cast list in `出场：A, B`. Cards keep their artwork and
        // the block stays a grid because nothing links out.
        const input: StructuredExportInput = {
            categories: [
                {
                    name: 'S卡',
                    cards: [
                        {
                            id: 11519,
                            title: '【【初】有村麻央】',
                            subtitle: '出场：千奈, 广',
                            fit: 'cover',
                            coverAssetId: 12,
                            legacyImage: false,
                            links: [],
                        },
                        {
                            id: 11520,
                            title: '【【N.I.A】有村麻央】',
                            subtitle: '出场：咲季, 手毬, 琴音, 清夏',
                            fit: 'cover',
                            coverAssetId: 13,
                            legacyImage: false,
                            links: [],
                        },
                    ],
                },
            ],
        };

        const result = exportStructuredDocument(input);

        assert.equal(
            result.markdown,
            [
                ':::card-grid{title="S卡" layout="grid" filter="tags"}',
                ':::card{id="11519" title="【【初】有村麻央】" tags="千奈,广" asset="cover:12"}',
                ':::',
                ':::card{id="11520" title="【【N.I.A】有村麻央】" tags="咲季,手毬,琴音,清夏" asset="cover:13"}',
                ':::',
                ':::',
            ].join('\n')
        );
        assert.deepEqual(result.lintWarnings, []);
        assert.deepEqual(result.stats, {
            categories: 1,
            cards: 2,
            links: 0,
            collapsedCategories: 0,
        });

        const compiled = await compileExport(result.markdown);
        assert.deepEqual(compiled.warnings, []);
        const grid = compiled.document.blocks[0];
        assert.equal(grid?.type, 'cardGrid');
        if (grid?.type !== 'cardGrid') return;
        assert.equal(grid.title, 'S卡');
        assert.equal(grid.layout, 'grid');
        assert.deepEqual(grid.cards.map((card) => card.title), [
            '【【初】有村麻央】',
            '【【N.I.A】有村麻央】',
        ]);
        assert.deepEqual(grid.cards[0]?.tags, ['千奈', '广']);
        assert.deepEqual(grid.cards[0]?.asset, { kind: 'cover', id: 12 });
        assert.deepEqual(grid.cards[1]?.tags, ['咲季', '手毬', '琴音', '清夏']);
        assert.deepEqual(compiled.document.availableTags, [
            '千奈',
            '广',
            '咲季',
            '手毬',
            '琴音',
            '清夏',
        ]);
    });

    test('exports a text-only category as a compact list', async () => {
        // 学园偶像大师 / 初: ten to eleven image-less cards per idol page. A grid
        // of empty frames reads badly, so a pure text-only category becomes a
        // list of titled rows.
        const input: StructuredExportInput = {
            categories: [
                {
                    name: '初',
                    cards: [
                        {
                            id: 201,
                            title: '【第1话：第一步】',
                            subtitle: '',
                            fit: 'cover',
                            coverAssetId: null,
                            legacyImage: false,
                            links: [],
                        },
                        {
                            id: 202,
                            title: '【第2话：并肩】',
                            subtitle: '',
                            fit: 'cover',
                            coverAssetId: null,
                            legacyImage: false,
                            links: [],
                        },
                    ],
                },
            ],
        };

        const result = exportStructuredDocument(input);

        assert.equal(
            result.markdown,
            [
                ':::card-grid{title="初" layout="list"}',
                ':::card{id="201" title="【第1话：第一步】"}',
                ':::',
                ':::card{id="202" title="【第2话：并肩】"}',
                ':::',
                ':::',
            ].join('\n')
        );
        assert.deepEqual(result.lintWarnings, []);

        const compiled = await compileExport(result.markdown);
        assert.deepEqual(compiled.warnings, []);
        const grid = compiled.document.blocks[0];
        if (grid?.type !== 'cardGrid') throw new Error('expected a card grid');
        assert.equal(grid.layout, 'list');
        assert.equal(grid.cards.length, 2);
        assert.equal(grid.cards[0]?.asset, null);
    });

    test('exports a 1:1 card-to-source category as a compact list', async () => {
        // SideM / High×Joker: 50 cards and 50 sources. A per-card list row keeps
        // the card title, its single source and the container compact instead of
        // repeating fifty grid frames.
        const input: StructuredExportInput = {
            categories: [
                {
                    name: '组合剧情',
                    cards: [
                        {
                            id: 301,
                            title: '【【組合】High×Joker 第1话】',
                            subtitle: '',
                            fit: 'cover',
                            coverAssetId: 7,
                            legacyImage: false,
                            links: [
                                {
                                    up: '某某UP',
                                    title: '【中字】【High×Joker】第一话',
                                    url: 'https://www.bilibili.com/video/BV1aa411c7m1',
                                    contentType: '剧情',
                                    sourcePlatform: 'Bilibili',
                                },
                            ],
                        },
                        {
                            id: 302,
                            title: '【【組合】High×Joker 第2话】',
                            subtitle: '',
                            fit: 'cover',
                            coverAssetId: 8,
                            legacyImage: false,
                            links: [
                                {
                                    up: '某某UP',
                                    title: '【中字】【High×Joker】第二话',
                                    url: 'https://www.bilibili.com/video/BV1aa411c7m2',
                                    contentType: '剧情',
                                    sourcePlatform: 'Bilibili',
                                },
                            ],
                        },
                    ],
                },
            ],
        };

        const result = exportStructuredDocument(input);

        assert.equal(
            result.markdown,
            [
                ':::card-grid{title="组合剧情" layout="list"}',
                ':::card{id="301" title="【【組合】High×Joker 第1话】" asset="cover:7"}',
                '- [剧情｜Bilibili｜某某UP](https://www.bilibili.com/video/BV1aa411c7m1) 【中字】【High×Joker】第一话',
                ':::',
                ':::card{id="302" title="【【組合】High×Joker 第2话】" asset="cover:8"}',
                '- [剧情｜Bilibili｜某某UP](https://www.bilibili.com/video/BV1aa411c7m2) 【中字】【High×Joker】第二话',
                ':::',
                ':::',
            ].join('\n')
        );
        assert.deepEqual(result.lintWarnings, []);
        assert.deepEqual(result.stats, {
            categories: 1,
            cards: 2,
            links: 2,
            collapsedCategories: 0,
        });

        const compiled = await compileExport(result.markdown);
        assert.deepEqual(compiled.warnings, []);
        const grid = compiled.document.blocks[0];
        if (grid?.type !== 'cardGrid') throw new Error('expected a card grid');
        assert.equal(grid.layout, 'list');
        assert.deepEqual(grid.cards[0]?.links, [
            {
                up: '某某UP',
                title: '【中字】【High×Joker】第一话',
                url: 'https://www.bilibili.com/video/BV1aa411c7m1',
                contentType: '剧情',
                sourcePlatform: 'Bilibili',
            },
        ]);
    });

    test('exports a shared-contain card set as a portrait grid', async () => {
        // Vertical artwork (the audit's 1,169 `fit=contain` cards, 835 of them
        // in 灰姑娘) is a portrait set: the block becomes `portrait` and each
        // card keeps its own `fit="contain"` so nothing is cropped.
        const input: StructuredExportInput = {
            categories: [
                {
                    name: '竖卡',
                    cards: [
                        {
                            id: 401,
                            title: '【安娜斯塔西娅 第1话】',
                            subtitle: '',
                            fit: 'contain',
                            coverAssetId: 9,
                            legacyImage: false,
                            links: [],
                        },
                        {
                            id: 402,
                            title: '【安娜斯塔西娅 第2话】',
                            subtitle: '',
                            fit: 'contain',
                            coverAssetId: 10,
                            legacyImage: false,
                            links: [],
                        },
                    ],
                },
            ],
        };

        const result = exportStructuredDocument(input);

        assert.equal(
            result.markdown,
            [
                ':::card-grid{title="竖卡" layout="portrait"}',
                ':::card{id="401" title="【安娜斯塔西娅 第1话】" fit="contain" asset="cover:9"}',
                ':::',
                ':::card{id="402" title="【安娜斯塔西娅 第2话】" fit="contain" asset="cover:10"}',
                ':::',
                ':::',
            ].join('\n')
        );
        assert.deepEqual(result.lintWarnings, []);

        const compiled = await compileExport(result.markdown);
        assert.deepEqual(compiled.warnings, []);
        const grid = compiled.document.blocks[0];
        if (grid?.type !== 'cardGrid') throw new Error('expected a card grid');
        assert.equal(grid.layout, 'portrait');
        assert.deepEqual(grid.cards.map((card) => card.fit), [
            'contain',
            'contain',
        ]);
    });

    test('keeps a mixed-fit card set on a grid with per-card contain', async () => {        const input: StructuredExportInput = {
            categories: [
                {
                    name: '特殊',
                    cards: [
                        {
                            id: 501,
                            title: '【横卡】',
                            subtitle: '',
                            fit: 'cover',
                            coverAssetId: 11,
                            legacyImage: false,
                            links: [],
                        },
                        {
                            id: 502,
                            title: '【竖卡】',
                            subtitle: '',
                            fit: 'contain',
                            coverAssetId: 12,
                            legacyImage: false,
                            links: [],
                        },
                    ],
                },
            ],
        };

        const result = exportStructuredDocument(input);

        assert.equal(
            result.markdown,
            [
                ':::card-grid{title="特殊" layout="grid"}',
                ':::card{id="501" title="【横卡】" asset="cover:11"}',
                ':::',
                ':::card{id="502" title="【竖卡】" fit="contain" asset="cover:12"}',
                ':::',
                ':::',
            ].join('\n')
        );
        assert.deepEqual(result.lintWarnings, []);

        const compiled = await compileExport(result.markdown);
        assert.deepEqual(compiled.warnings, []);
        const grid = compiled.document.blocks[0];
        if (grid?.type !== 'cardGrid') throw new Error('expected a card grid');
        assert.deepEqual(grid.cards.map((card) => card.fit), [
            'cover',
            'contain',
        ]);
    });

    test('sorts numeric chapter buckets numerically instead of lexicographically', async () => {
        // 百万现场 / 主线剧情: the 17 bucket names are `1-10`, `11-20`, … `101-110`.
        // Lexicographic order renders the chapters as 1-10, 101-110, 11-20, so a
        // pure numeric-bucket category list is sorted by its start number.
        const card = (id: number, title: string) => ({
            id,
            title,
            subtitle: '',
            fit: 'cover' as const,
            coverAssetId: id,
            legacyImage: false,
            links: [],
        });
        const input: StructuredExportInput = {
            categories: [
                { name: '1-10', cards: [card(1, '【1：最重要的事】')] },
                { name: '101-110', cards: [card(3, '【101：新的开始】')] },
                { name: '11-20', cards: [card(2, '【11：Thank you！】')] },
            ],
        };

        const result = exportStructuredDocument(input);

        assert.equal(
            result.markdown,
            [
                ':::card-grid{title="1-10" layout="grid"}',
                ':::card{id="1" title="【1：最重要的事】" asset="cover:1"}',
                ':::',
                ':::',
                '',
                ':::card-grid{title="11-20" layout="grid"}',
                ':::card{id="2" title="【11：Thank you！】" asset="cover:2"}',
                ':::',
                ':::',
                '',
                ':::card-grid{title="101-110" layout="grid"}',
                ':::card{id="3" title="【101：新的开始】" asset="cover:3"}',
                ':::',
                ':::',
            ].join('\n')
        );
        assert.deepEqual(result.stats, {
            categories: 3,
            cards: 3,
            links: 0,
            collapsedCategories: 0,
        });
        assert.deepEqual(result.lintWarnings, []);

        const compiled = await compileExport(result.markdown);
        assert.deepEqual(compiled.warnings, []);
        assert.deepEqual(
            compiled.document.blocks.map((block) =>
                block.type === 'cardGrid' ? block.title : block.type
            ),
            ['1-10', '11-20', '101-110']
        );
    });

    test('keeps the entry display order when only some names are numeric', async () => {
        // 百万现场 / 活动剧情 mixes `白金星光巡游` with 22 named activity kinds;
        // sorting those would invent an order the maintainer never chose.
        const card = (id: number) => ({
            id,
            title: `【卡${id}】`,
            subtitle: '',
            fit: 'cover' as const,
            coverAssetId: id,
            legacyImage: false,
            links: [],
        });
        const input: StructuredExportInput = {
            categories: [
                { name: '11-20', cards: [card(2)] },
                { name: '白金星光巡游', cards: [card(4)] },
                { name: '1-10', cards: [card(1)] },
            ],
        };

        const result = exportStructuredDocument(input);

        const compiled = await compileExport(result.markdown);
        assert.deepEqual(compiled.warnings, []);
        assert.deepEqual(
            compiled.document.blocks.map((block) =>
                block.type === 'cardGrid' ? block.title : block.type
            ),
            ['11-20', '白金星光巡游', '1-10']
        );
    });

    test('escapes only what the dialect needs and keeps titles readable', async () => {
        // 灰姑娘女孩 / 卡剧情: link titles carry `"`, `[中字]`, `【】` and `「」`
        // everywhere (61.9% of titles use `【】`), while only a `](` pair would
        // actually open a second link. Everything else stays literal.
        const input: StructuredExportInput = {
            categories: [
                {
                    name: '卡剧情',
                    cards: [
                        {
                            id: 601,
                            title: '【【三姉妹カフェ[ネコ]】】',
                            subtitle: '神崎兰子、二宫飞鸟',
                            fit: 'cover',
                            coverAssetId: 21,
                            legacyImage: false,
                            links: [],
                        },
                        {
                            id: 602,
                            title: "【【it's me】】",
                            subtitle: '',
                            fit: 'cover',
                            coverAssetId: 22,
                            legacyImage: false,
                            links: [
                                {
                                    up: '某某UP',
                                    title: '【MLTD】(中字)呐？……呐？——德川茉莉R卡"闪耀花道"觉醒剧情',
                                    url: 'https://www.bilibili.com/video/BV1cc411c7m3',
                                    contentType: '剧情',
                                    sourcePlatform: 'Bilibili',
                                },
                            ],
                        },
                        {
                            id: 603,
                            title: '【終幕】',
                            subtitle: '',
                            fit: 'contain',
                            coverAssetId: 23,
                            legacyImage: false,
                            links: [
                                {
                                    up: '某某UP',
                                    title: '【中字】逆ミステリー！<患者>【七尾百合子】](其一)',
                                    url: 'https://www.bilibili.com/video/BV1cc411c7m4',
                                    contentType: '剧情',
                                    sourcePlatform: 'Bilibili',
                                },
                            ],
                        },
                    ],
                },
            ],
        };

        const result = exportStructuredDocument(input);

        assert.equal(
            result.markdown,
            [
                ':::card-grid{title="卡剧情" layout="grid" filter="tags"}',
                ':::card{id="601" title="【【三姉妹カフェ[ネコ]】】" tags="神崎兰子,二宫飞鸟" asset="cover:21"}',
                ':::',
                ':::card{id="602" title="【【it\'s me】】" asset="cover:22"}',
                '- [剧情｜Bilibili｜某某UP](https://www.bilibili.com/video/BV1cc411c7m3) 【MLTD】(中字)呐？……呐？——德川茉莉R卡"闪耀花道"觉醒剧情',
                ':::',
                ':::card{id="603" title="【終幕】" fit="contain" asset="cover:23"}',
                '- [剧情｜Bilibili｜某某UP](https://www.bilibili.com/video/BV1cc411c7m4) 【中字】逆ミステリー！<患者>【七尾百合子】]\\(其一)',
                ':::',
                ':::',
            ].join('\n')
        );
        assert.deepEqual(result.lintWarnings, []);

        const compiled = await compileExport(result.markdown);
        assert.deepEqual(compiled.warnings, []);
        const grid = compiled.document.blocks[0];
        if (grid?.type !== 'cardGrid') throw new Error('expected a card grid');
        assert.deepEqual(grid.cards.map((card) => card.title), [
            '【【三姉妹カフェ[ネコ]】】',
            "【【it's me】】",
            '【終幕】',
        ]);
        assert.deepEqual(
            grid.cards.map((card) => card.links[0]?.title ?? ''),
            [
                '',
                '【MLTD】(中字)呐？……呐？——德川茉莉R卡"闪耀花道"觉醒剧情',
                '【中字】逆ミステリー！<患者>【七尾百合子】](其一)',
            ]
        );
    });

    test('keeps every source label field in its own slot', async () => {
        // The dialect splits a `[类型｜平台｜UP]` label on both `|` and `｜`
        // (compiler `SOURCE_FIELD_SEPARATOR`), so a stored bar cannot be escaped:
        // `\|` still splits after Markdown parsing. It becomes the non-separator
        // homoglyph `丨`, which keeps the three fields aligned — a bar in the
        // type or platform field used to shift every later field silently.
        const input: StructuredExportInput = {
            categories: [
                {
                    name: '其他',
                    cards: [
                        {
                            id: 701,
                            title: '【卡】',
                            subtitle: '',
                            fit: 'cover',
                            coverAssetId: 31,
                            legacyImage: false,
                            links: [
                                {
                                    up: 'UP]名字|X',
                                    title: '',
                                    url: 'https://www.bilibili.com/video/BV1dd411c7m5',
                                    contentType: '剧情|译制',
                                    sourcePlatform: 'Bilibili｜测试',
                                },
                            ],
                        },
                    ],
                },
            ],
        };

        const result = exportStructuredDocument(input);

        assert.equal(
            result.markdown,
            [
                ':::card-grid{title="其他" layout="list"}',
                ':::card{id="701" title="【卡】" asset="cover:31"}',
                '- [剧情丨译制｜Bilibili丨测试｜UP\\]名字丨X](https://www.bilibili.com/video/BV1dd411c7m5)',
                ':::',
                ':::',
            ].join('\n')
        );
        assert.deepEqual(result.lintWarnings, []);

        const compiled = await compileExport(result.markdown);
        assert.deepEqual(compiled.warnings, []);
        const grid = compiled.document.blocks[0];
        if (grid?.type !== 'cardGrid') throw new Error('expected a card grid');
        // No field drifts into its neighbour: type, platform and UP stay aligned.
        assert.deepEqual(grid.cards[0]?.links, [
            {
                up: 'UP]名字丨X',
                title: '',
                url: 'https://www.bilibili.com/video/BV1dd411c7m5',
                contentType: '剧情丨译制',
                sourcePlatform: 'Bilibili丨测试',
            },
        ]);
    });

    test('collapses a source label the compiler can re-infer', async () => {
        // 1,876 biligame rows store the pseudo UP name `bwiki`; writing an empty
        // label lets the compiler re-infer `Wiki｜bilibili wiki｜bwiki`, so the
        // source line stays short without losing a field.
        const input: StructuredExportInput = {
            categories: [
                {
                    name: '卡剧情',
                    cards: [
                        {
                            id: 801,
                            title: '【卡】',
                            subtitle: '',
                            fit: 'cover',
                            coverAssetId: 41,
                            legacyImage: false,
                            links: [
                                {
                                    up: 'bwiki',
                                    title: '有村麻央',
                                    url: 'https://wiki.biligame.com/gakumas/有村麻央',
                                    contentType: 'Wiki',
                                    sourcePlatform: 'bilibili wiki',
                                },
                                {
                                    up: 'UP主',
                                    title: '某人的切片',
                                    url: 'https://www.bilibili.com/video/BV1ee411c7m6',
                                    contentType: '剧情',
                                    sourcePlatform: 'Bilibili',
                                },
                            ],
                        },
                    ],
                },
            ],
        };

        const result = exportStructuredDocument(input);

        assert.equal(
            result.markdown,
            [
                ':::card-grid{title="卡剧情" layout="grid"}',
                ':::card{id="801" title="【卡】" asset="cover:41"}',
                '- [](https://wiki.biligame.com/gakumas/有村麻央) 有村麻央',
                '- [剧情｜Bilibili｜UP主](https://www.bilibili.com/video/BV1ee411c7m6) 某人的切片',
                ':::',
                ':::',
            ].join('\n')
        );

        const compiled = await compileExport(result.markdown);
        assert.deepEqual(compiled.warnings, []);
        const grid = compiled.document.blocks[0];
        if (grid?.type !== 'cardGrid') throw new Error('expected a card grid');
        assert.deepEqual(grid.cards[0]?.links, [
            {
                up: 'bwiki',
                title: '有村麻央',
                url: 'https://wiki.biligame.com/gakumas/有村麻央',
                contentType: 'Wiki',
                sourcePlatform: 'bilibili wiki',
            },
            {
                up: 'UP主',
                title: '某人的切片',
                url: 'https://www.bilibili.com/video/BV1ee411c7m6',
                contentType: '剧情',
                sourcePlatform: 'Bilibili',
            },
        ]);
    });

    test('keeps the decorative brackets unless stripBrackets is asked for', async () => {
        const card = (id: number, title: string) => ({
            id,
            title,
            subtitle: '',
            fit: 'cover' as const,
            coverAssetId: id,
            legacyImage: false,
            links: [],
        });
        const input: StructuredExportInput = {
            categories: [
                {
                    name: '特殊',
                    cards: [
                        card(901, '【【初】有村麻央】'),
                        card(902, "【it's me】"),
                    ],
                },
            ],
        };

        const preserved = exportStructuredDocument(input);
        assert.match(preserved.markdown, /title="【【初】有村麻央】"/u);
        assert.match(preserved.markdown, /title="【it's me】"/u);

        const stripped = exportStructuredDocument(input, {
            stripBrackets: true,
        });
        assert.match(stripped.markdown, /title="【初】有村麻央"/u);
        assert.match(stripped.markdown, /title="it's me"/u);
        assert.deepEqual((await compileExport(stripped.markdown)).warnings, []);
    });

    test('reports dirty data instead of silently dropping it', async () => {
        // 765PRO / 三浦梓 (`entryKind="other"` despite being an idol page): a `#`
        // placeholder subtitle, a legacy image the dialect cannot reference, a
        // pseudo UP name, a duplicated URL, and a search-page URL.
        const input: StructuredExportInput = {
            categories: [
                {
                    name: 'SP',
                    cards: [
                        {
                            id: 1001,
                            title: '【主线剧情】',
                            subtitle: '#',
                            fit: 'cover',
                            coverAssetId: null,
                            legacyImage: false,
                            links: [],
                        },
                        {
                            id: 1002,
                            title: '【营业剧情】',
                            subtitle: '',
                            fit: 'cover',
                            coverAssetId: null,
                            legacyImage: true,
                            links: [],
                        },
                    ],
                },
                {
                    name: 'OFA',
                    cards: [
                        {
                            id: 1003,
                            title: '【个人剧情】',
                            subtitle: '',
                            fit: 'cover',
                            coverAssetId: 51,
                            legacyImage: false,
                            links: [
                                {
                                    up: '播放列表/合集',
                                    title: '第一话',
                                    url: 'https://www.bilibili.com/video/BV1ff411c7m7',
                                    contentType: '剧情',
                                    sourcePlatform: 'Bilibili',
                                },
                                {
                                    up: '播放列表/合集',
                                    title: '第一话',
                                    url: 'https://www.bilibili.com/video/BV1ff411c7m7',
                                    contentType: '剧情',
                                    sourcePlatform: 'Bilibili',
                                },
                                {
                                    up: '某某UP',
                                    title: '搜索结果',
                                    url: 'https://search.bilibili.com/all?keyword=三浦梓',
                                    contentType: '剧情',
                                    sourcePlatform: 'Bilibili',
                                },
                            ],
                        },
                    ],
                },
            ],
        };

        const result = exportStructuredDocument(input);

        assert.equal(
            result.markdown,
            [
                ':::card-grid{title="SP" layout="list"}',
                ':::card{id="1001" title="【主线剧情】"}',
                ':::',
                ':::card{id="1002" title="【营业剧情】"}',
                ':::',
                ':::',
                '',
                ':::card-grid{title="OFA" layout="grid"}',
                ':::card{id="1003" title="【个人剧情】" asset="cover:51"}',
                '- [剧情｜Bilibili｜播放列表/合集](https://www.bilibili.com/video/BV1ff411c7m7) 第一话',
                '- [剧情｜Bilibili｜某某UP](https://search.bilibili.com/all?keyword=三浦梓) 搜索结果',
                ':::',
                ':::',
            ].join('\n')
        );
        assert.deepEqual(result.lintWarnings, [
            {
                code: 'placeholder-subtitle',
                context: 'SP / 【主线剧情】',
                message: '副标题只是占位符「#」，草稿中已省略',
            },
            {
                code: 'unmapped-card-image',
                context: 'SP / 【营业剧情】',
                message:
                    '卡片插图只存在于旧版图片文件，文档语法无法引用，草稿中已省略插图',
            },
            {
                code: 'pseudo-up-name',
                context: 'OFA / 【个人剧情】',
                message:
                    '发布者「播放列表/合集」是伪 UP 名（平台标识而非作者），草稿仍保留原值',
            },
            {
                code: 'non-content-url',
                context: 'OFA / 【个人剧情】',
                message:
                    '「https://search.bilibili.com/all?keyword=三浦梓」是搜索页而不是内容页，草稿仍保留该链接',
            },
            {
                code: 'duplicate-url',
                context: 'OFA / 【个人剧情】',
                message:
                    '同一张卡重复引用了「https://www.bilibili.com/video/BV1ff411c7m7」，草稿只保留第一条',
            },
        ]);
        assert.deepEqual(result.stats, {
            categories: 2,
            cards: 3,
            links: 2,
            collapsedCategories: 0,
        });

        const compiled = await compileExport(result.markdown);
        assert.deepEqual(compiled.warnings, []);
        const grid = compiled.document.blocks[1];
        if (grid?.type !== 'cardGrid') throw new Error('expected a card grid');
        assert.equal(grid.cards[0]?.links.length, 2);
    });

    test('flags near-duplicate category names', async () => {
        // SideM / DRAMATIC STARS keeps both `节日_生日` and `节日/生日`; exporting
        // them verbatim would produce two almost identical blocks.
        const card = (id: number) => ({
            id,
            title: `【卡${id}】`,
            subtitle: '',
            fit: 'cover' as const,
            coverAssetId: id,
            legacyImage: false,
            links: [],
        });
        const input: StructuredExportInput = {
            categories: [
                { name: '节日_生日', cards: [card(1101)] },
                { name: '其他', cards: [card(1102)] },
                { name: '节日/生日', cards: [card(1103)] },
            ],
        };

        const result = exportStructuredDocument(input);

        assert.deepEqual(result.lintWarnings, [
            {
                code: 'near-duplicate-category',
                context: '节日/生日',
                message:
                    '分类名「节日/生日」与「节日_生日」只差分隔符，导出后会出现两个近似重复的区块',
            },
        ]);

        const compiled = await compileExport(result.markdown);
        assert.deepEqual(compiled.warnings, []);
        assert.deepEqual(
            compiled.document.blocks.map((block) =>
                block.type === 'cardGrid' ? block.title : block.type
            ),
            ['节日_生日', '其他', '节日/生日']
        );
    });

    test('exports repeated card names without inventing headings', async () => {
        // 765PRO / 三浦梓 repeats `主线剧情` inside several game buckets; cards are
        // directives, so a repeated title stays legal and nothing is dropped.
        const card = (id: number) => ({
            id,
            title: '【主线剧情】',
            subtitle: '',
            fit: 'cover' as const,
            coverAssetId: id,
            legacyImage: false,
            links: [],
        });
        const input: StructuredExportInput = {
            categories: [{ name: '星耀季节', cards: [card(1201), card(1202)] }],
        };

        const result = exportStructuredDocument(input);

        assert.equal(
            result.markdown,
            [
                ':::card-grid{title="星耀季节" layout="grid"}',
                ':::card{id="1201" title="【主线剧情】" asset="cover:1201"}',
                ':::',
                ':::card{id="1202" title="【主线剧情】" asset="cover:1202"}',
                ':::',
                ':::',
            ].join('\n')
        );
        assert.deepEqual(result.lintWarnings, []);
        const compiled = await compileExport(result.markdown);
        assert.deepEqual(compiled.warnings, []);
    });

    test('folds heavy categories and long category lists', async () => {
        const card = (id: number) => ({
            id,
            title: `【卡${id}】`,
            subtitle: '',
            fit: 'cover' as const,
            coverAssetId: id,
            legacyImage: false,
            links: [],
        });

        const heavy = exportStructuredDocument(
            {
                categories: [
                    { name: 'S卡', cards: [card(1), card(2), card(3)] },
                ],
            },
            { collapseThreshold: 2 }
        );
        assert.equal(
            heavy.markdown,
            [
                ':::card-grid{title="S卡" layout="grid" collapsed}',
                ':::card{id="1" title="【卡1】" asset="cover:1"}',
                ':::',
                ':::card{id="2" title="【卡2】" asset="cover:2"}',
                ':::',
                ':::card{id="3" title="【卡3】" asset="cover:3"}',
                ':::',
                ':::',
            ].join('\n')
        );
        assert.deepEqual(heavy.stats, {
            categories: 1,
            cards: 3,
            links: 0,
            collapsedCategories: 1,
        });

        // 百万现场 / 活动剧情 has 23 categories; above ten every block folds so a
        // 432-card page stays navigable.
        const many = exportStructuredDocument({
            categories: Array.from({ length: 10 }, (unused, index) => ({
                name: `分类${index + 1}`,
                cards: [card(index + 1)],
            })),
        });
        assert.deepEqual(many.stats, {
            categories: 10,
            cards: 10,
            links: 0,
            collapsedCategories: 10,
        });
        assert.equal(
            many.markdown.match(/::card-grid\{title="[^"]+" layout="grid" collapsed\}/gu)
                ?.length,
            10
        );
        assert.deepEqual((await compileExport(many.markdown)).warnings, []);
    });

    test('escapes backslashes and keeps the readable characters literal', async () => {
        // Audit §6: the only characters that really break the dialect are `\`,
        // `]` and the `](` pair. `"`, `「」`, `*`, `<` and `>` stay literal in
        // trailing titles (no `\*` noise), and a backslash in a label field
        // must be escaped so it cannot start an escape sequence. A balanced
        // `*..*` pair is read by the compiler as emphasis, so that pair
        // round-trips as its text while `"`, `「」`, `<`, `>` and `\` stay literal.
        const input: StructuredExportInput = {
            categories: [
                {
                    name: '卡剧情',
                    cards: [
                        {
                            id: 1301,
                            title: '【Ａ「引用」】',
                            subtitle: '「幕」*强调*<注>',
                            fit: 'cover',
                            coverAssetId: 61,
                            legacyImage: false,
                            links: [
                                {
                                    up: 'UP\\slash',
                                    title: '【中字】「A」*B*<C>"D" E\\F',
                                    url: 'https://www.bilibili.com/video/BV1gg411c7m7',
                                    contentType: '剧情',
                                    sourcePlatform: 'Bilibili',
                                },
                            ],
                        },
                    ],
                },
            ],
        };

        const result = exportStructuredDocument(input);

        assert.equal(
            result.markdown,
            [
                ':::card-grid{title="卡剧情" layout="list"}',
                ':::card{id="1301" title="【Ａ「引用」】" subtitle="「幕」*强调*<注>" asset="cover:61"}',
                '- [剧情｜Bilibili｜UP\\\\slash](https://www.bilibili.com/video/BV1gg411c7m7) 【中字】「A」*B*<C>"D" E\\F',
                ':::',
                ':::',
            ].join('\n')
        );
        assert.deepEqual(result.lintWarnings, []);

        const compiled = await compileExport(result.markdown);
        assert.deepEqual(compiled.warnings, []);
        const grid = compiled.document.blocks[0];
        if (grid?.type !== 'cardGrid') throw new Error('expected a card grid');
        assert.equal(grid.cards[0]?.title, '【Ａ「引用」】');
        assert.equal(grid.cards[0]?.subtitle, '「幕」*强调*<注>');
        assert.deepEqual(grid.cards[0]?.links, [
            {
                up: 'UP\\slash',
                title: '【中字】「A」B<C>"D" E\\F',
                url: 'https://www.bilibili.com/video/BV1gg411c7m7',
                contentType: '剧情',
                sourcePlatform: 'Bilibili',
            },
        ]);
    });

    test('never builds a grid out of artwork the dialect cannot reference', async () => {
        // 765PRO keeps most card artwork as legacy `image_file`s, and the dialect
        // can only reference `cover:<id>` / `doc:<id>`. Counting such a card as
        // "has artwork" produced grid walls of empty frames, so layout only counts
        // representable artwork and the unmapped images are reported instead.
        const input: StructuredExportInput = {
            categories: [
                {
                    name: 'SP',
                    cards: [
                        {
                            id: 1401,
                            title: '【主线剧情】',
                            subtitle: '',
                            fit: 'cover',
                            coverAssetId: null,
                            legacyImage: true,
                            links: [],
                        },
                        {
                            id: 1402,
                            title: '【营业剧情】',
                            subtitle: '',
                            fit: 'cover',
                            coverAssetId: null,
                            legacyImage: false,
                            links: [],
                        },
                    ],
                },
            ],
        };

        const result = exportStructuredDocument(input);

        assert.equal(
            result.markdown,
            [
                ':::card-grid{title="SP" layout="list"}',
                ':::card{id="1401" title="【主线剧情】"}',
                ':::',
                ':::card{id="1402" title="【营业剧情】"}',
                ':::',
                ':::',
            ].join('\n')
        );
        assert.deepEqual(result.lintWarnings, [
            {
                code: 'unmapped-card-image',
                context: 'SP / 【主线剧情】',
                message:
                    '卡片插图只存在于旧版图片文件，文档语法无法引用，草稿中已省略插图',
            },
        ]);

        const compiled = await compileExport(result.markdown);
        assert.deepEqual(compiled.warnings, []);
        const grid = compiled.document.blocks[0];
        if (grid?.type !== 'cardGrid') throw new Error('expected a card grid');
        assert.equal(grid.layout, 'list');
        assert.deepEqual(
            grid.cards.map((card) => card.asset),
            [null, null]
        );
    });

    test('reports categories that hold no cards', async () => {
        // 24 live category instances have zero cards (audit §2). They hold no card
        // data, but their names still exist in `wiki_entry_categories`, so the
        // draft reports them instead of dropping them silently.
        const input: StructuredExportInput = {
            categories: [
                {
                    name: 'S卡',
                    cards: [
                        {
                            id: 1501,
                            title: '【【初】有村麻央】',
                            subtitle: '',
                            fit: 'cover',
                            coverAssetId: 71,
                            legacyImage: false,
                            links: [],
                        },
                    ],
                },
                { name: '活动', cards: [] },
            ],
        };

        const result = exportStructuredDocument(input);

        assert.equal(
            result.markdown,
            [
                ':::card-grid{title="S卡" layout="grid"}',
                ':::card{id="1501" title="【【初】有村麻央】" asset="cover:71"}',
                ':::',
                ':::',
            ].join('\n')
        );
        assert.deepEqual(result.stats, {
            categories: 1,
            cards: 1,
            links: 0,
            collapsedCategories: 0,
        });
        assert.deepEqual(result.lintWarnings, [
            {
                code: 'empty-category',
                context: '活动',
                message: '分类「活动」在该内容页没有任何卡片，草稿中没有对应区块',
            },
        ]);

        assert.deepEqual((await compileExport(result.markdown)).warnings, []);
    });

    test('exports a 765PRO page whose entry kind is other', async () => {
        // 765PRO's 18 idol entries are all `entry_kind="other"` in the database
        // (`三浦梓`: game-name categories, repeated card names, no sources). The
        // exporter input carries no kind at all, so this shape exports the same way
        // as any other; `document-export.contract.test.ts` proves it against the
        // real `entry_kind` column.
        const card = (id: number, title: string) => ({
            id,
            title,
            subtitle: '',
            fit: 'cover' as const,
            coverAssetId: null,
            legacyImage: false,
            links: [],
        });
        const input: StructuredExportInput = {
            categories: [
                {
                    name: '星耀季节',
                    cards: [card(1601, '【主线剧情】'), card(1602, '【主线剧情】')],
                },
                { name: 'SP', cards: [card(1603, '【营业剧情】')] },
            ],
        };

        const result = exportStructuredDocument(input);

        assert.equal(
            result.markdown,
            [
                ':::card-grid{title="星耀季节" layout="list"}',
                ':::card{id="1601" title="【主线剧情】"}',
                ':::',
                ':::card{id="1602" title="【主线剧情】"}',
                ':::',
                ':::',
                '',
                ':::card-grid{title="SP" layout="list"}',
                ':::card{id="1603" title="【营业剧情】"}',
                ':::',
                ':::',
            ].join('\n')
        );
        assert.deepEqual(result.lintWarnings, []);

        const compiled = await compileExport(result.markdown);
        assert.deepEqual(compiled.warnings, []);
        assert.deepEqual(
            compiled.document.blocks.map((block) =>
                block.type === 'cardGrid' ? block.title : block.type
            ),
            ['星耀季节', 'SP']
        );
    });

    test('keeps emoji category names verbatim', async () => {
        // 闪耀色彩 / 页游节日: `🍫情人节` / `🃏愚人节` / `🌟闪耀日`. The dialect must
        // carry emoji names as titles, never ASCII-slug them.
        const card = (id: number) => ({
            id,
            title: `【卡${id}】`,
            subtitle: '',
            fit: 'cover' as const,
            coverAssetId: id,
            legacyImage: false,
            links: [],
        });
        const input: StructuredExportInput = {
            categories: [
                { name: '🍫情人节', cards: [card(1701), card(1702)] },
                { name: '🃏愚人节', cards: [card(1703)] },
            ],
        };

        const result = exportStructuredDocument(input);

        assert.equal(
            result.markdown,
            [
                ':::card-grid{title="🍫情人节" layout="grid"}',
                ':::card{id="1701" title="【卡1701】" asset="cover:1701"}',
                ':::',
                ':::card{id="1702" title="【卡1702】" asset="cover:1702"}',
                ':::',
                ':::',
                '',
                ':::card-grid{title="🃏愚人节" layout="grid"}',
                ':::card{id="1703" title="【卡1703】" asset="cover:1703"}',
                ':::',
                ':::',
            ].join('\n')
        );
        assert.deepEqual(result.lintWarnings, []);

        const compiled = await compileExport(result.markdown);
        assert.deepEqual(compiled.warnings, []);
        assert.deepEqual(
            compiled.document.blocks.map((block) =>
                block.type === 'cardGrid' ? block.title : block.type
            ),
            ['🍫情人节', '🃏愚人节']
        );
    });
});
