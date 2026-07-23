import assert from 'node:assert/strict';
import test from 'node:test';
import {
    defaultInformationIndex,
    informationCardSummary,
    parseInformationIndex,
    serializeInformationIndex
} from '@/domains/information/data';

test('information index keeps legacy cards manageable and strips HTML from summaries', () => {
    const index = defaultInformationIndex();
    assert.equal(index.cards.length, 6);
    assert.equal(index.cards[0]?.category, 'activity');
    assert.equal(index.cards[0]?.contentType, 'external');

    const htmlIndex = {
        version: 1 as const,
        assets: ['/uploads/information/original/cover.webp'],
        cards: [{
            id: 'info-contract-001',
            category: 'fan' as const,
            contentType: 'html' as const,
            title: 'Contract HTML',
            image: '/uploads/information/original/cover.webp',
            link: '/ignored',
            html: '<h2>Hosted content</h2>',
            updatedAt: '2026-07-23T00:00:00.000Z'
        }]
    };
    const parsed = parseInformationIndex(serializeInformationIndex(htmlIndex));
    assert.equal(parsed.cards[0]?.link, '/information/info-contract-001');
    assert.equal(parsed.cards[0]?.html, '<h2>Hosted content</h2>');
    assert.equal('html' in informationCardSummary(parsed.cards[0]!), false);
});

test('information index rejects hosted cover images missing from the asset manifest', () => {
    const body = new TextEncoder().encode(JSON.stringify({
        version: 1,
        assets: [],
        cards: [{
            id: 'info-contract-002',
            category: 'activity',
            contentType: 'external',
            title: 'Missing asset',
            image: '/uploads/information/original/missing.webp',
            link: 'https://example.com',
            updatedAt: '2026-07-23T00:00:00.000Z'
        }]
    }));
    assert.throws(() => parseInformationIndex(body), /image is invalid/);
});
