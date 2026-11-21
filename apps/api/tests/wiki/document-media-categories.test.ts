import assert from 'node:assert/strict';
import { describe, test } from 'vitest';
import { compileEnhancedMarkdown } from '@/domains/content/wiki/documents/enhanced-markdown-compiler';

/**
 * Seam 1 fixtures for the media and structured-category directives.
 *
 * The compiler is a pure function: it parses `::media` / `::story-category`
 * into asset and category *references* plus their source lines. Membership of
 * an asset or category is a database fact, so only the resolver warns about it.
 */
describe('Enhanced Markdown media and structured categories', () => {
    test('compiles ::media with a shared cover reference', async () => {
        const result = await compileEnhancedMarkdown(
            [
                '## 视觉图',
                '',
                '::media{asset="cover:12" caption="主视觉" fit="contain"}',
                '',
            ].join('\n'),
        );

        assert.deepEqual(result.document.blocks, [
            {
                type: 'heading',
                level: 2,
                id: '视觉图',
                children: [{ type: 'text', value: '视觉图' }],
            },
            {
                type: 'media',
                asset: { kind: 'cover', id: 12 },
                caption: '主视觉',
                fit: 'contain',
                imageUrl: null,
                presentationPolicy: 'inherit',
            },
        ]);
        assert.deepEqual(result.assetRefs, [
            { line: 3, asset: { kind: 'cover', id: 12 } },
        ]);
        assert.deepEqual(result.warnings, []);
        assert.equal(result.plainText, ['视觉图', '主视觉'].join('\n'));
    });

    test('defaults ::media caption and fit and reads document uploads', async () => {
        const result = await compileEnhancedMarkdown(
            '::media{asset="doc:7"}\n',
        );

        assert.deepEqual(result.document.blocks, [
            {
                type: 'media',
                asset: { kind: 'doc', id: 7 },
                caption: '',
                fit: 'cover',
                imageUrl: null,
                presentationPolicy: 'inherit',
            },
        ]);
        assert.deepEqual(result.assetRefs, [
            { line: 1, asset: { kind: 'doc', id: 7 } },
        ]);
    });

    test('rejects unreadable media assets and falls back on unknown fits', async () => {
        const result = await compileEnhancedMarkdown(
            [
                '::media{asset="cover:12" fit="stretch"}',
                '',
                '::media{caption="无素材"}',
                '',
                '::media{asset="banner:3"}',
                '',
            ].join('\n'),
        );

        assert.deepEqual(result.document.blocks, [
            {
                type: 'media',
                asset: { kind: 'cover', id: 12 },
                caption: '',
                fit: 'cover',
                imageUrl: null,
                presentationPolicy: 'inherit',
            },
        ]);
        assert.deepEqual(
            result.warnings.map((warning) => [warning.line, warning.code]),
            [
                [1, 'invalid-directive'],
                [3, 'invalid-directive'],
                [5, 'invalid-directive'],
            ],
        );
        assert.deepEqual(result.assetRefs, [
            { line: 1, asset: { kind: 'cover', id: 12 } },
        ]);
    });

    test('compiles a named ::story-category and keeps its reference line', async () => {
        const result = await compileEnhancedMarkdown(
            [
                '## 卡池',
                '',
                '::story-category{name="SSR" collapsed}',
                '',
            ].join('\n'),
        );

        assert.deepEqual(result.document.blocks.at(-1), {
            type: 'storyCategory',
            categoryName: 'SSR',
            collapsed: true,
        });
        assert.deepEqual(result.categoryRefs, [{ line: 3, name: 'SSR' }]);
        assert.deepEqual(result.warnings, []);
    });

    test('compiles ::story-categories as the whole card pool', async () => {
        const result = await compileEnhancedMarkdown('::story-categories\n');

        assert.deepEqual(result.document.blocks, [
            {
                type: 'storyCategory',
                categoryName: null,
                collapsed: false,
            },
        ]);
        assert.deepEqual(result.categoryRefs, []);
        assert.deepEqual(result.warnings, []);
    });

    test('rejects a ::story-category without a name and ignores a name on ::story-categories', async () => {
        const result = await compileEnhancedMarkdown(
            ['::story-category{collapsed}', '', '::story-categories{name="X"}', ''].join(
                '\n',
            ),
        );

        assert.deepEqual(result.document.blocks, [
            {
                type: 'storyCategory',
                categoryName: null,
                collapsed: false,
            },
        ]);
        assert.deepEqual(
            result.warnings.map((warning) => [warning.line, warning.code]),
            [
                [1, 'invalid-directive'],
                [3, 'invalid-directive'],
            ],
        );
    });

    test('keeps :::card asset references on the card grid', async () => {
        const result = await compileEnhancedMarkdown(
            [
                ':::card-grid{layout="grid"}',
                ':::card{title="【第一话】" asset="cover:3" fit="contain"}',
                ':::',
                '',
            ].join('\n'),
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
                        title: '【第一话】',
                        subtitle: '',
                        fit: 'contain',
                        asset: { kind: 'cover', id: 3 },
                        imageUrl: null,
                        presentationPolicy: 'inherit',
                        tags: [],
                        links: [],
                    },
                ],
            },
        ]);
        assert.deepEqual(result.assetRefs, [
            { line: 2, asset: { kind: 'cover', id: 3 } },
        ]);
    });

    test('warns about an unreadable card asset and still keeps the text card', async () => {
        const result = await compileEnhancedMarkdown(
            [
                ':::card-grid',
                ':::card{title="纯文字" asset="cover:zero"}',
                ':::',
                '',
            ].join('\n'),
        );

        assert.deepEqual(
            result.warnings.map((warning) => [warning.line, warning.code]),
            [[2, 'invalid-directive']],
        );
        const grid = result.document.blocks[0];
        assert.equal(grid?.type, 'cardGrid');
        assert.deepEqual(grid.type === 'cardGrid' ? grid.cards[0].asset : null, null);
    });

    test('rejects ::media nested inside a card grid', async () => {
        const result = await compileEnhancedMarkdown(
            [':::card-grid', '::media{asset="cover:1"}', ':::', ''].join('\n'),
        );

        assert.deepEqual(result.document.blocks, []);
        assert.deepEqual(
            result.warnings.map((warning) => [warning.line, warning.code]),
            [
                [2, 'invalid-directive'],
                [1, 'empty-directive'],
            ],
        );
    });
});
