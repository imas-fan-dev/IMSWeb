import assert from 'node:assert/strict';
import { describe, test } from 'vitest';
import { compileEnhancedMarkdown } from '@/domains/content/wiki/documents/enhanced-markdown-compiler';

/**
 * Audit-calibrated fixtures for the story blocks ticket: inline source lists,
 * card grids, and tabs. Every expectation is an independent literal taken from
 * the spec/audit rules rather than re-derived from the compiler internals.
 */
describe('Enhanced Markdown story blocks', () => {
    test('compiles :::links with an inline source list title kept outside the attributes', async () => {
        const result = await compileEnhancedMarkdown(
            [
                ':::links{title="主要来源"}',
                '- [剧情｜Bilibili｜UP主甲](https://www.bilibili.com/video/BV1xx411c7mD) 第一话【中字】',
                ':::',
                ''
            ].join('\n')
        );

        assert.deepEqual(result, {
            document: {
                version: 1,
                headings: [],
                availableTags: [],
                blocks: [
                    {
                        type: 'links',
                        title: '主要来源',
                        collapsed: false,
                        links: [
                            {
                                up: 'UP主甲',
                                title: '第一话【中字】',
                                url: 'https://www.bilibili.com/video/BV1xx411c7mD',
                                contentType: '剧情',
                                sourcePlatform: 'Bilibili'
                            }
                        ]
                    }
                ]
            },
            assetRefs: [],
            categoryRefs: [],
            plainText: [
                '主要来源',
                '剧情 Bilibili UP主甲 第一话【中字】'
            ].join('\n'),
            warnings: []
        });
    });

    test('infers omitted type, platform, and UP from the source host', async () => {
        const result = await compileEnhancedMarkdown(
            [
                ':::links',
                '- [](https://www.bilibili.com/video/BV2) 仅链接',
                '- [UP主乙](https://bilibili.com/video/BV3) 无 www',
                '- [](https://wiki.biligame.com/imass/卡面) 卡面词条',
                '- [词条组](https://wiki.biligame.com/imass/X) 词条',
                '- [](https://www.acfun.cn/v/ac1) 熟肉',
                '- [某站UP](https://example.com/a) 外部来源',
                ':::',
                ''
            ].join('\n')
        );

        assert.deepEqual(result.document.blocks, [
            {
                type: 'links',
                title: '',
                collapsed: false,
                links: [
                    {
                        up: '未知发布者',
                        title: '仅链接',
                        url: 'https://www.bilibili.com/video/BV2',
                        contentType: '剧情',
                        sourcePlatform: 'Bilibili'
                    },
                    {
                        up: 'UP主乙',
                        title: '无 www',
                        url: 'https://bilibili.com/video/BV3',
                        contentType: '剧情',
                        sourcePlatform: 'Bilibili'
                    },
                    {
                        up: 'bwiki',
                        title: '卡面词条',
                        url: 'https://wiki.biligame.com/imass/卡面',
                        contentType: 'Wiki',
                        sourcePlatform: 'bilibili wiki'
                    },
                    {
                        up: '词条组',
                        title: '词条',
                        url: 'https://wiki.biligame.com/imass/X',
                        contentType: 'Wiki',
                        sourcePlatform: 'bilibili wiki'
                    },
                    {
                        up: '未知发布者',
                        title: '熟肉',
                        url: 'https://www.acfun.cn/v/ac1',
                        contentType: '剧情',
                        sourcePlatform: '其他来源'
                    },
                    {
                        up: '某站UP',
                        title: '外部来源',
                        url: 'https://example.com/a',
                        contentType: '剧情',
                        sourcePlatform: '其他来源'
                    }
                ]
            }
        ]);
        assert.deepEqual(result.warnings, []);
    });

    test('reads two segments as type or platform and always prefers three explicit segments', async () => {
        const result = await compileEnhancedMarkdown(
            [
                ':::links',
                '- [音乐｜UP主丙](https://www.bilibili.com/video/BV4) 曲目',
                '- [bwiki｜词条组](https://www.bilibili.com/video/BV5) 平台优先',
                '- [剧情|AcFun|UP主丁](https://www.acfun.cn/v/ac2) 半角竖线',
                ':::',
                ''
            ].join('\n')
        );

        assert.deepEqual(result.document.blocks, [
            {
                type: 'links',
                title: '',
                collapsed: false,
                links: [
                    {
                        up: 'UP主丙',
                        title: '曲目',
                        url: 'https://www.bilibili.com/video/BV4',
                        contentType: '音乐',
                        sourcePlatform: 'Bilibili'
                    },
                    {
                        up: '词条组',
                        title: '平台优先',
                        url: 'https://www.bilibili.com/video/BV5',
                        contentType: '剧情',
                        sourcePlatform: 'bwiki'
                    },
                    {
                        up: 'UP主丁',
                        title: '半角竖线',
                        url: 'https://www.acfun.cn/v/ac2',
                        contentType: '剧情',
                        sourcePlatform: 'AcFun'
                    }
                ]
            }
        ]);
        assert.deepEqual(result.warnings, []);
    });

    test('keeps audit-conflict characters in the trailing title verbatim', async () => {
        const result = await compileEnhancedMarkdown(
            [
                ':::links{title="审计标题"}',
                '- [剧情｜Bilibili｜UP主甲](https://www.bilibili.com/video/BV6) 【中字】"双引号" 「书名」 * 星 <注>',
                '- [剧情｜Bilibili｜UP主乙](https://www.bilibili.com/video/BV7) [中字] 合集](含第二部)',
                '- [Wiki｜bilibili wiki｜词条组](https://wiki.biligame.com/imass/Y) 【剧情】「序章」',
                '- [剧情｜Bilibili｜UP主丙](https://www.bilibili.com/video/BV8) <b>加粗</b> 标题',
                ':::',
                ''
            ].join('\n')
        );

        assert.deepEqual(result.document.blocks, [
            {
                type: 'links',
                title: '审计标题',
                collapsed: false,
                links: [
                    {
                        up: 'UP主甲',
                        title: '【中字】"双引号" 「书名」 * 星 <注>',
                        url: 'https://www.bilibili.com/video/BV6',
                        contentType: '剧情',
                        sourcePlatform: 'Bilibili'
                    },
                    {
                        up: 'UP主乙',
                        title: '[中字] 合集](含第二部)',
                        url: 'https://www.bilibili.com/video/BV7',
                        contentType: '剧情',
                        sourcePlatform: 'Bilibili'
                    },
                    {
                        up: '词条组',
                        title: '【剧情】「序章」',
                        url: 'https://wiki.biligame.com/imass/Y',
                        contentType: 'Wiki',
                        sourcePlatform: 'bilibili wiki'
                    },
                    {
                        up: 'UP主丙',
                        title: '<b>加粗</b> 标题',
                        url: 'https://www.bilibili.com/video/BV8',
                        contentType: '剧情',
                        sourcePlatform: 'Bilibili'
                    }
                ]
            }
        ]);
        assert.deepEqual(result.warnings, []);
    });

    test("accepts the batch macro's escaped source line", async () => {
        // The document workbench emits this exact line for a parsed Bilibili
        // link whose UP name contains `]`/`|` and whose title contains `](`.
        const result = await compileEnhancedMarkdown(
            [
                ':::links',
                '- [剧情｜Bilibili｜A\\]B｜C](https://www.bilibili.com/video/BV1xx411c7mD) 标题]\\(陷阱',
                ':::',
                ''
            ].join('\n')
        );

        assert.deepEqual(result.document.blocks, [
            {
                type: 'links',
                title: '',
                collapsed: false,
                links: [
                    {
                        up: 'A]B｜C',
                        title: '标题](陷阱',
                        url: 'https://www.bilibili.com/video/BV1xx411c7mD',
                        contentType: '剧情',
                        sourcePlatform: 'Bilibili'
                    }
                ]
            }
        ]);
        assert.deepEqual(result.warnings, []);
    });

    test('compiles :::card-grid and :::card with zero-link, text-only, and tagged cards', async () => {
        const result = await compileEnhancedMarkdown(
            [
                ':::card-grid{layout="portrait" cols="4" ratio="4/5" filter="tags" title="S 卡图鉴"}',
                ':::card{id="41" title="【初星】" subtitle="序章" tags="天海春香, 765PRO" fit="contain"}',
                '- [剧情｜Bilibili｜UP主甲](https://www.bilibili.com/video/BV9) 初星',
                ':::',
                ':::card{title="【学马仕】" tags="天海春香，765PRO,天海春香"}',
                ':::',
                ':::card{id="42" title="初"}',
                ':::',
                ':::',
                ''
            ].join('\n')
        );

        assert.deepEqual(result, {
            document: {
                version: 1,
                headings: [],
                availableTags: ['天海春香', '765PRO'],
                blocks: [
                    {
                        type: 'cardGrid',
                        layout: 'portrait',
                        cols: 4,
                        ratio: '4/5',
                        filter: 'tags',
                        collapsed: false,
                        title: 'S 卡图鉴',
                        cards: [
                            {
                                type: 'card',
                                id: 41,
                                title: '【初星】',
                                subtitle: '序章',
                                fit: 'contain',
                                asset: null,
                                imageUrl: null,
                                presentationPolicy: 'inherit',
                                tags: ['天海春香', '765PRO'],
                                links: [
                                    {
                                        up: 'UP主甲',
                                        title: '初星',
                                        url: 'https://www.bilibili.com/video/BV9',
                                        contentType: '剧情',
                                        sourcePlatform: 'Bilibili'
                                    }
                                ]
                            },
                            {
                                type: 'card',
                                id: null,
                                title: '【学马仕】',
                                subtitle: '',
                                fit: 'cover',
                                asset: null,
                                imageUrl: null,
                                presentationPolicy: 'inherit',
                                tags: ['天海春香', '765PRO'],
                                links: []
                            },
                            {
                                type: 'card',
                                id: 42,
                                title: '初',
                                subtitle: '',
                                fit: 'cover',
                                asset: null,
                                imageUrl: null,
                                presentationPolicy: 'inherit',
                                tags: [],
                                links: []
                            }
                        ]
                    }
                ]
            },
            assetRefs: [],
            categoryRefs: [],
            plainText: [
                'S 卡图鉴',
                '【初星】 序章',
                '天海春香 765PRO',
                '剧情 Bilibili UP主甲 初星',
                '【学马仕】',
                '天海春香 765PRO',
                '初'
            ].join('\n'),
            warnings: []
        });
    });

    test('compiles :::tabs wrapping :::tab panels', async () => {
        const result = await compileEnhancedMarkdown(
            [
                '## 版本对比',
                '',
                ':::tabs',
                ':::tab{title="CG 版"}',
                '- 2005 年初版',
                ':::',
                ':::tab{title="新剧场版"}',
                '- 2011 年重制',
                ':::',
                ':::',
                ''
            ].join('\n')
        );

        assert.deepEqual(result.document, {
            version: 1,
            headings: [{ id: '版本对比', level: 2, text: '版本对比' }],
            availableTags: [],
            blocks: [
                {
                    type: 'heading',
                    level: 2,
                    id: '版本对比',
                    children: [{ type: 'text', value: '版本对比' }]
                },
                {
                    type: 'tabs',
                    items: [
                        {
                            type: 'tab',
                            title: 'CG 版',
                            children: [
                                {
                                    type: 'list',
                                    ordered: false,
                                    start: null,
                                    items: [
                                        {
                                            children: [
                                                {
                                                    type: 'paragraph',
                                                    children: [
                                                        {
                                                            type: 'text',
                                                            value: '2005 年初版'
                                                        }
                                                    ]
                                                }
                                            ]
                                        }
                                    ]
                                }
                            ]
                        },
                        {
                            type: 'tab',
                            title: '新剧场版',
                            children: [
                                {
                                    type: 'list',
                                    ordered: false,
                                    start: null,
                                    items: [
                                        {
                                            children: [
                                                {
                                                    type: 'paragraph',
                                                    children: [
                                                        {
                                                            type: 'text',
                                                            value: '2011 年重制'
                                                        }
                                                    ]
                                                }
                                            ]
                                        }
                                    ]
                                }
                            ]
                        }
                    ]
                }
            ]
        });
        assert.deepEqual(
            result.plainText,
            [
                '版本对比',
                'CG 版',
                '2005 年初版',
                '新剧场版',
                '2011 年重制'
            ].join('\n')
        );
        assert.deepEqual(result.warnings, []);
    });

    test('falls back with line-numbered warnings for invalid block attributes', async () => {
        const result = await compileEnhancedMarkdown(
            [
                ':::card-grid{layout="masonry" cols="9" ratio="3/2" filter="cast" collapsed="maybe"}',
                ':::card{id="abc" fit="fill" title="A"}',
                ':::',
                ':::',
                ':::tab{title="孤立"}',
                ':::',
                ''
            ].join('\n')
        );

        assert.deepEqual(result.document.blocks, [
            {
                type: 'cardGrid',
                layout: 'grid',
                cols: null,
                ratio: null,
                filter: null,
                collapsed: false,
                title: '',
                cards: [
                    {
                        type: 'card',
                        id: null,
                        title: 'A',
                        subtitle: '',
                        fit: 'cover',
                        asset: null,
                        imageUrl: null,
                        presentationPolicy: 'inherit',
                        tags: [],
                        links: []
                    }
                ]
            }
        ]);
        assert.deepEqual(result.warnings, [
            {
                line: 1,
                code: 'invalid-directive',
                message: '不支持的 card-grid.layout 取值：masonry'
            },
            {
                line: 1,
                code: 'invalid-directive',
                message: '不支持的 card-grid.cols 取值：9'
            },
            {
                line: 1,
                code: 'invalid-directive',
                message: '不支持的 card-grid.ratio 取值：3/2'
            },
            {
                line: 1,
                code: 'invalid-directive',
                message: '不支持的 card-grid.filter 取值：cast'
            },
            {
                line: 1,
                code: 'invalid-directive',
                message: '不支持的 collapsed 取值：maybe'
            },
            {
                line: 2,
                code: 'invalid-directive',
                message: '不支持的 card.id 取值：abc'
            },
            {
                line: 2,
                code: 'invalid-directive',
                message: '不支持的 card.fit 取值：fill'
            },
            {
                line: 5,
                code: 'invalid-directive',
                message: ':::tab 必须位于 :::tabs 内'
            }
        ]);
    });

    test('treats bare collapsed attributes as true', async () => {
        const result = await compileEnhancedMarkdown(
            [
                ':::links{collapsed title="折叠来源"}',
                '- [](https://www.bilibili.com/video/BV1) 标题',
                ':::',
                '',
                ':::card-grid{collapsed}',
                ':::card{title="卡甲"}',
                ':::',
                ':::',
                ''
            ].join('\n')
        );

        assert.deepEqual(
            result.document.blocks.map((block) => block.type),
            ['links', 'cardGrid']
        );
        const linksBlock = result.document.blocks[0];
        assert.ok(linksBlock.type === 'links');
        assert.equal(linksBlock.collapsed, true);
        const gridBlock = result.document.blocks[1];
        assert.ok(gridBlock.type === 'cardGrid');
        assert.equal(gridBlock.collapsed, true);
        assert.deepEqual(result.warnings, []);
    });

    test('drops unsafe source URLs and reports them with line numbers', async () => {
        const result = await compileEnhancedMarkdown(
            [
                ':::links',
                '- [剧情｜Bilibili｜UP](javascript:alert(1)) 坏链接',
                '- [](//evil.example/x) 协议相对',
                ':::',
                ''
            ].join('\n')
        );

        assert.deepEqual(result.document.blocks, []);
        assert.deepEqual(result.warnings, [
            {
                line: 2,
                code: 'unsafe-url-blocked',
                message: '已移除不安全的来源地址'
            },
            {
                line: 3,
                code: 'unsafe-url-blocked',
                message: '已移除不安全的来源地址'
            },
            {
                line: 1,
                code: 'empty-directive',
                message: ':::links 未包含有效的来源列表项'
            }
        ]);
    });

    test('warns when a links or card-grid container has no usable children', async () => {
        const result = await compileEnhancedMarkdown(
            [':::links', ':::', '', ':::card-grid', ':::', ''].join('\n')
        );

        assert.deepEqual(result.document.blocks, []);
        assert.deepEqual(result.warnings, [
            {
                line: 1,
                code: 'empty-directive',
                message: ':::links 未包含有效的来源列表项'
            },
            {
                line: 4,
                code: 'empty-directive',
                message: ':::card-grid 未包含有效的 :::card'
            }
        ]);
    });
});
