import assert from 'node:assert/strict';
import test from 'node:test';
import {
    buildInformationHtmlDocument,
    INFORMATION_DOCUMENT_CSP
} from '@/domains/content/information/information-html-document';

test('information HTML documents escape metadata and keep managed body markup', () => {
    const document = buildInformationHtmlDocument(
        '<Summer & Live>',
        '<h2>活动正文</h2><img src="/uploads/information/original/body.webp">'
    );

    assert.match(document, /<title>&lt;Summer &amp; Live&gt;<\/title>/);
    assert.match(document, /<h2>活动正文<\/h2>/);
    assert.match(document, /\/uploads\/information\/original\/body\.webp/);
    assert.match(INFORMATION_DOCUMENT_CSP, /script-src 'none'/);
    assert.match(INFORMATION_DOCUMENT_CSP, /form-action 'none'/);
    assert.match(INFORMATION_DOCUMENT_CSP, /img-src 'self'/);
});
