import assert from 'node:assert/strict';
import { describe, test } from 'vitest';
import { wikiPublicStoryDocumentSchema } from '@imsweb/contracts/wiki';

function documentWithLink(url: string) {
    return {
        version: 1 as const,
        headings: [],
        availableTags: [],
        blocks: [
            {
                type: 'paragraph' as const,
                children: [
                    {
                        type: 'link' as const,
                        url,
                        children: [{ type: 'text' as const, value: '来源' }],
                    },
                ],
            },
        ],
    };
}

// The AST is the only wire format public clients render, so the shared schema
// owns the URL policy: absolute http(s) or a site-relative path, never a
// protocol-relative, data, or javascript URL.
describe('public story document contract', () => {
    test('accepts absolute http(s) and site-relative link URLs', () => {
        for (const url of [
            'https://www.bilibili.com/video/BV1xx411c7mD',
            'http://example.test/guide',
            '/wiki?agency=sc',
        ]) {
            const parsed = wikiPublicStoryDocumentSchema.parse(documentWithLink(url));
            assert.deepEqual(parsed, documentWithLink(url));
        }
    });

    test('rejects unsafe link URLs', () => {
        for (const url of [
            '//evil.example/x',
            'javascript:alert(1)',
            'data:text/html;base64,aaa',
            'mailto:someone@example.test',
            'wiki/relative-without-slash',
        ]) {
            assert.throws(
                () => wikiPublicStoryDocumentSchema.parse(documentWithLink(url)),
                /unsafe|invalid/i,
                url
            );
        }
    });
});

const SOURCE_LINK = {
    up: 'UP主',
    title: '第一话',
    url: 'https://www.bilibili.com/video/BV1xx411c7mD',
    contentType: '剧情',
    sourcePlatform: 'Bilibili',
};

function documentWithSourceLink(url: string) {
    return {
        version: 1 as const,
        headings: [],
        availableTags: [],
        blocks: [
            {
                type: 'links' as const,
                title: '',
                collapsed: false,
                links: [{ ...SOURCE_LINK, url }],
            },
        ],
    };
}

// Story blocks extend the version 1 AST without changing the existing nodes:
// the schema is exact, so a new card option needs a contract change here first.
describe('public story document story blocks', () => {
    test('accepts links, card grids, and tabs with their exact wire shape', () => {
        const document = {
            version: 1 as const,
            headings: [],
            availableTags: ['天海春香'],
            blocks: [
                {
                    type: 'links' as const,
                    title: '来源',
                    collapsed: true,
                    links: [SOURCE_LINK],
                },
                {
                    type: 'cardGrid' as const,
                    layout: 'list' as const,
                    cols: null,
                    ratio: '1/1' as const,
                    filter: 'tags' as const,
                    collapsed: false,
                    title: '',
                    cards: [
                        {
                            type: 'card' as const,
                            id: 42,
                            title: '【初星】',
                            subtitle: '',
                            fit: 'contain' as const,
                            tags: ['天海春香'],
                            links: [],
                        },
                    ],
                },
                {
                    type: 'tabs' as const,
                    items: [
                        {
                            type: 'tab' as const,
                            title: '序章',
                            children: [
                                {
                                    type: 'paragraph' as const,
                                    children: [
                                        { type: 'text' as const, value: '正文' },
                                    ],
                                },
                            ],
                        },
                    ],
                },
            ],
        };

        assert.deepEqual(wikiPublicStoryDocumentSchema.parse(document), document);
    });

    test('rejects unsafe source URLs and out-of-range card grid options', () => {
        assert.throws(
            () =>
                wikiPublicStoryDocumentSchema.parse(
                    documentWithSourceLink('javascript:alert(1)')
                ),
            /unsafe|invalid/i
        );
        assert.throws(
            () =>
                wikiPublicStoryDocumentSchema.parse({
                    version: 1,
                    headings: [],
                    availableTags: [],
                    blocks: [
                        {
                            type: 'cardGrid',
                            layout: 'grid',
                            cols: 9,
                            ratio: null,
                            filter: null,
                            collapsed: false,
                            title: '',
                            cards: [],
                        },
                    ],
                }),
            /cols|too_big|invalid/i
        );
    });
});
