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
