import assert from 'node:assert/strict';
import { test } from 'vitest';

import type { FudabaPendingCardPayload } from '@/ports/repositories/fudaba';
import {
    CARD_REVIEW_EXEMPT_FIELDS,
    type CardReviewSnapshot,
    fudabaReviewPolicy
} from '@/ports/repositories/fudaba-review-policy';

const { requiresCardReview } = fudabaReviewPolicy;

const live: CardReviewSnapshot = {
    producerName: 'P',
    producerReading: 'ぴー',
    seriesCodes: ['series'],
    favoriteCharacterIds: [3, 1],
    bio: 'bio',
    tradeNote: 'note',
    madeOn: null,
    groupName: null,
    isOriginal: false,
    madeWithAi: false,
    visible: true,
    credits: []
};

function submission(
    overrides: Partial<FudabaPendingCardPayload> = {}
): FudabaPendingCardPayload {
    return {
        producer_name: 'P',
        producer_reading: 'ぴー',
        series_codes: ['series'],
        favorite_character_ids: [...live.favoriteCharacterIds],
        bio: 'bio',
        trade_note: 'note',
        exchange_mode: 'manual',
        made_on: null,
        group_name: null,
        is_original: false,
        made_with_ai: false,
        visible: true,
        credits: [],
        ...overrides
    };
}

test('identical content needs no review', () => {
    assert.equal(requiresCardReview(live, submission()), false);
});

test('the owner bookkeeping fields never need a review', () => {
    assert.deepEqual([...CARD_REVIEW_EXEMPT_FIELDS].sort(), [
        'exchange_mode',
        'group_name',
        'is_original',
        'made_on',
        'made_with_ai',
        'visible'
    ]);
    const changes: Partial<FudabaPendingCardPayload>[] = [
        { exchange_mode: 'none' },
        { group_name: 'group' },
        { is_original: true },
        { made_on: '2016-03' },
        { made_with_ai: true },
        { visible: false }
    ];
    for (const change of changes) {
        assert.equal(
            requiresCardReview(live, submission(change)),
            false,
            JSON.stringify(change)
        );
    }
});

test('trailing whitespace is not a content change', () => {
    assert.equal(
        requiresCardReview(live, submission({ producer_name: '  P  ' })),
        false
    );
});

test('reordered favourite characters are the same selection', () => {
    assert.equal(
        requiresCardReview(live, submission({ favorite_character_ids: [1, 3] })),
        false
    );
});

test('adding or dropping a favourite character needs review', () => {
    assert.equal(
        requiresCardReview(live, submission({ favorite_character_ids: [1] })),
        true
    );
    assert.equal(
        requiresCardReview(live, submission({ favorite_character_ids: [1, 3, 4] })),
        true
    );
});

test('content fields need review', () => {
    const changes: Partial<FudabaPendingCardPayload>[] = [
        { producer_name: 'P2' },
        { producer_reading: 'ぴー2' },
        { series_codes: ['series2'] },
        { bio: 'bio2' },
        { trade_note: 'note2' }
    ];
    for (const change of changes) {
        assert.equal(
            requiresCardReview(live, submission(change)),
            true,
            JSON.stringify(change)
        );
    }
});

test('credits are content, so any attribution change needs review', () => {
    const credit = {
        accountId: null,
        displayName: 'illustrator',
        url: 'https://example.com',
        roles: ['illustration'] as const
    };
    assert.equal(
        requiresCardReview(live, submission({ credits: [{ ...credit, roles: ['illustration'] }] })),
        true
    );
    assert.equal(
        requiresCardReview(
            { ...live, credits: [{ ...credit, roles: ['illustration'] }] },
            submission({ credits: [{ ...credit, roles: ['illustration'] }] })
        ),
        false
    );
});
