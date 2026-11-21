import assert from 'node:assert/strict';
import { describe, test } from 'vitest';
import { compileEnhancedMarkdown } from '@/domains/content/wiki/documents/enhanced-markdown-compiler';

const FENCE = '```';

describe('Enhanced Markdown compiler', () => {
    test('compiles headings, paragraphs, inline marks, and links into a version 1 AST', async () => {
        const result = await compileEnhancedMarkdown(
            [
                '## 观看顺序',
                '',
                '先看 **主线**，再看 *活动*，来源见 [官方页面](https://example.com/page)。',
                '',
                '### 第一节',
                ''
            ].join('\n')
        );

        assert.deepEqual(result, {
            document: {
                version: 1,
                headings: [
                    { id: '观看顺序', level: 2, text: '观看顺序' },
                    { id: '第一节', level: 3, text: '第一节' }
                ],
                availableTags: [],
                blocks: [
                    {
                        type: 'heading',
                        level: 2,
                        id: '观看顺序',
                        children: [{ type: 'text', value: '观看顺序' }]
                    },
                    {
                        type: 'paragraph',
                        children: [
                            { type: 'text', value: '先看 ' },
                            {
                                type: 'strong',
                                children: [{ type: 'text', value: '主线' }]
                            },
                            { type: 'text', value: '，再看 ' },
                            {
                                type: 'emphasis',
                                children: [{ type: 'text', value: '活动' }]
                            },
                            { type: 'text', value: '，来源见 ' },
                            {
                                type: 'link',
                                url: 'https://example.com/page',
                                children: [{ type: 'text', value: '官方页面' }]
                            },
                            { type: 'text', value: '。' }
                        ]
                    },
                    {
                        type: 'heading',
                        level: 3,
                        id: '第一节',
                        children: [{ type: 'text', value: '第一节' }]
                    }
                ]
            },
            plainText: [
                '观看顺序',
                '先看 主线，再看 活动，来源见 官方页面。',
                '第一节'
            ].join('\n'),
            warnings: []
        });
    });

    test('compiles lists, blockquotes, tables, and thematic breaks', async () => {
        const result = await compileEnhancedMarkdown(
            [
                '- 第一项',
                '- ~~第二项~~',
                '',
                '1. 步骤一',
                '2. 步骤二',
                '',
                '> 引用一段',
                '',
                '| 章节 | 数量 |',
                '| --- | ---: |',
                '| 主线 | 12 |',
                '',
                '---',
                ''
            ].join('\n')
        );

        assert.deepEqual(result.document.blocks, [
            {
                type: 'list',
                ordered: false,
                start: null,
                items: [
                    {
                        children: [
                            {
                                type: 'paragraph',
                                children: [{ type: 'text', value: '第一项' }]
                            }
                        ]
                    },
                    {
                        children: [
                            {
                                type: 'paragraph',
                                children: [
                                    {
                                        type: 'delete',
                                        children: [
                                            { type: 'text', value: '第二项' }
                                        ]
                                    }
                                ]
                            }
                        ]
                    }
                ]
            },
            {
                type: 'list',
                ordered: true,
                start: 1,
                items: [
                    {
                        children: [
                            {
                                type: 'paragraph',
                                children: [{ type: 'text', value: '步骤一' }]
                            }
                        ]
                    },
                    {
                        children: [
                            {
                                type: 'paragraph',
                                children: [{ type: 'text', value: '步骤二' }]
                            }
                        ]
                    }
                ]
            },
            {
                type: 'blockquote',
                children: [
                    {
                        type: 'paragraph',
                        children: [{ type: 'text', value: '引用一段' }]
                    }
                ]
            },
            {
                type: 'table',
                align: [null, 'right'],
                header: [
                    [{ type: 'text', value: '章节' }],
                    [{ type: 'text', value: '数量' }]
                ],
                rows: [
                    [
                        [{ type: 'text', value: '主线' }],
                        [{ type: 'text', value: '12' }]
                    ]
                ]
            },
            { type: 'thematicBreak' }
        ]);
        assert.deepEqual(result.warnings, []);
    });

    test('compiles callout and details directives with typed attributes', async () => {
        const result = await compileEnhancedMarkdown(
            [
                ':::callout{type="warning" title="注意"}',
                '不要剧透，内含 `code`。',
                ':::',
                '',
                ':::details{title="结局" open}',
                '大团圆。',
                ':::',
                '',
                ':::details{title="隐藏章节"}',
                '折叠内容。',
                ':::',
                ''
            ].join('\n')
        );

        assert.deepEqual(result.document.blocks, [
            {
                type: 'callout',
                tone: 'warning',
                title: '注意',
                children: [
                    {
                        type: 'paragraph',
                        children: [
                            { type: 'text', value: '不要剧透，内含 ' },
                            { type: 'inlineCode', value: 'code' },
                            { type: 'text', value: '。' }
                        ]
                    }
                ]
            },
            {
                type: 'details',
                title: '结局',
                open: true,
                children: [
                    {
                        type: 'paragraph',
                        children: [{ type: 'text', value: '大团圆。' }]
                    }
                ]
            },
            {
                type: 'details',
                title: '隐藏章节',
                open: false,
                children: [
                    {
                        type: 'paragraph',
                        children: [{ type: 'text', value: '折叠内容。' }]
                    }
                ]
            }
        ]);
        assert.deepEqual(result.warnings, []);
        assert.deepEqual(result.document.headings, []);
    });

    test('collects the outline from root headings only and de-duplicates anchors', async () => {
        const result = await compileEnhancedMarkdown(
            [
                '## 重复',
                '',
                ':::callout{type="info" title="说明"}',
                '### 卡片内部的标题',
                ':::',
                '',
                '## 重复',
                ''
            ].join('\n')
        );

        assert.deepEqual(result.document.headings, [
            { id: '重复', level: 2, text: '重复' },
            { id: '重复-2', level: 2, text: '重复' }
        ]);
        assert.equal(result.document.blocks.length, 3);
    });

    test('rejects raw HTML with line-numbered warnings and never emits HTML', async () => {
        const result = await compileEnhancedMarkdown(
            [
                '## 标题',
                '',
                '<div onclick="alert(1)">危险</div>',
                '',
                '安全 <b>段落</b>',
                ''
            ].join('\n')
        );

        assert.deepEqual(result.warnings, [
            {
                line: 3,
                code: 'raw-html-rejected',
                message: '已移除原生 HTML'
            },
            {
                line: 5,
                code: 'raw-html-rejected',
                message: '已移除原生 HTML'
            },
            {
                line: 5,
                code: 'raw-html-rejected',
                message: '已移除原生 HTML'
            }
        ]);
        assert.deepEqual(result.document.blocks, [
            {
                type: 'heading',
                level: 2,
                id: '标题',
                children: [{ type: 'text', value: '标题' }]
            },
            {
                type: 'paragraph',
                children: [{ type: 'text', value: '安全 段落' }]
            }
        ]);
        assert.equal(result.plainText, '标题\n安全 段落');
        assert.doesNotMatch(JSON.stringify(result.document), /<div|<b>/);
    });

    test('blocks non-http, data, and protocol-relative URLs while keeping their text', async () => {
        const result = await compileEnhancedMarkdown(
            [
                '[坏链接](javascript:alert(1)) 和 [协议相对](//evil.example/x) 与 [数据](data:text/html;base64,aaa)',
                '',
                '[站内相对路径](/wiki?agency=sc) 与 [https](https://example.com/a)'
            ].join('\n')
        );

        assert.deepEqual(
            result.warnings.map((warning) => [
                warning.line,
                warning.code,
                warning.message
            ]),
            [
                [1, 'unsafe-url-blocked', '已移除不安全的链接地址'],
                [1, 'unsafe-url-blocked', '已移除不安全的链接地址'],
                [1, 'unsafe-url-blocked', '已移除不安全的链接地址']
            ]
        );
        assert.deepEqual(result.document.blocks, [
            {
                type: 'paragraph',
                children: [
                    { type: 'text', value: '坏链接 和 协议相对 与 数据' }
                ]
            },
            {
                type: 'paragraph',
                children: [
                    {
                        type: 'link',
                        url: '/wiki?agency=sc',
                        children: [
                            { type: 'text', value: '站内相对路径' }
                        ]
                    },
                    { type: 'text', value: ' 与 ' },
                    {
                        type: 'link',
                        url: 'https://example.com/a',
                        children: [{ type: 'text', value: 'https' }]
                    }
                ]
            }
        ]);
    });

    test('normalizes h1 to h2 and reports unsupported syntax and unknown directives', async () => {
        const fenced = [FENCE + 'js', 'const answer = 1', FENCE].join('\n');
        const result = await compileEnhancedMarkdown(
            ['# 一级标题', '', fenced, '', ':::mystery{title="x"}', '内容', ':::', ''].join(
                '\n'
            )
        );

        assert.deepEqual(result.warnings, [
            {
                line: 1,
                code: 'heading-level-normalized',
                message: '一级标题已降级为二级标题'
            },
            {
                line: 3,
                code: 'unsupported-node',
                message: '已跳过不支持的 Markdown 语法：code'
            },
            {
                line: 7,
                code: 'invalid-directive',
                message: '未知的指令容器：mystery'
            }
        ]);
        assert.deepEqual(result.document.headings, [
            { id: '一级标题', level: 2, text: '一级标题' }
        ]);
        assert.deepEqual(result.document.blocks, [
            {
                type: 'heading',
                level: 2,
                id: '一级标题',
                children: [{ type: 'text', value: '一级标题' }]
            },
            {
                type: 'paragraph',
                children: [{ type: 'text', value: '内容' }]
            }
        ]);
    });

    test('warns about malformed callout attributes and falls back to the info tone', async () => {
        const result = await compileEnhancedMarkdown(
            [
                ':::callout{type="danger" title="警告"}',
                '内容。',
                ':::',
                '',
                ':::callout',
                '缺少属性的提示。',
                ':::',
                ''
            ].join('\n')
        );

        assert.deepEqual(result.warnings, [
            {
                line: 1,
                code: 'invalid-directive',
                message: '不支持的 callout 类型：danger'
            }
        ]);
        assert.deepEqual(
            result.document.blocks.map((block) => block.type),
            ['callout', 'callout']
        );
        const [first, second] = result.document.blocks;
        assert.equal(first.type === 'callout' ? first.tone : null, 'info');
        assert.equal(first.type === 'callout' ? first.title : null, '警告');
        assert.equal(second.type === 'callout' ? second.tone : null, 'info');
        assert.equal(second.type === 'callout' ? second.title : null, '');
    });

    test('normalizes h4 and deeper headings to h3 with a line-numbered warning', async () => {
        const result = await compileEnhancedMarkdown(
            [
                '#### 四级标题',
                '',
                '正文。',
                '',
                '###### 六级标题',
                ''
            ].join('\n')
        );

        assert.deepEqual(result.warnings, [
            {
                line: 1,
                code: 'heading-level-normalized',
                message: '深层标题已归一为三级标题'
            },
            {
                line: 5,
                code: 'heading-level-normalized',
                message: '深层标题已归一为三级标题'
            }
        ]);
        assert.deepEqual(result.document.headings, [
            { id: '四级标题', level: 3, text: '四级标题' },
            { id: '六级标题', level: 3, text: '六级标题' }
        ]);
        assert.deepEqual(
            result.document.blocks.map((block) =>
                block.type === 'heading' ? block.level : block.type
            ),
            [3, 'paragraph', 3]
        );
    });

    test('parses the details open attribute as an explicit boolean', async () => {
        const result = await compileEnhancedMarkdown(
            [
                ':::details{title="显式关闭" open=false}',
                '一。',
                ':::',
                '',
                ':::details{title="数字真" open=1}',
                '二。',
                ':::',
                '',
                ':::details{title="噪声关闭" open="no"}',
                '三。',
                ':::',
                '',
                ':::details{title="非法值" open="maybe"}',
                '四。',
                ':::',
                ''
            ].join('\n')
        );

        assert.deepEqual(
            result.document.blocks.map((block) =>
                block.type === 'details' ? block.open : null
            ),
            [false, true, false, false]
        );
        assert.deepEqual(result.warnings, [
            {
                line: 13,
                code: 'invalid-directive',
                message: '不支持的 details.open 取值：maybe'
            }
        ]);
    });

    test('de-duplicates heading anchors against the final id set', async () => {
        const result = await compileEnhancedMarkdown(
            ['## A', '', '## A', '', '## A-2', '', '## A', ''].join('\n')
        );

        assert.deepEqual(
            result.document.headings.map((heading) => heading.id),
            ['a', 'a-2', 'a-3', 'a-4']
        );
        assert.deepEqual(
            result.document.blocks.map((block) =>
                block.type === 'heading' ? block.id : null
            ),
            ['a', 'a-2', 'a-3', 'a-4']
        );
    });
});
