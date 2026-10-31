import assert from 'node:assert/strict';
import { test } from 'vitest';

import type {
    FudabaCardCredit,
    FudabaPendingCardPayload
} from '@/ports/repositories/fudaba';
import {
    CARD_REVIEW_EXEMPT_FIELDS,
    type CardReviewSnapshot,
    fudabaReviewPolicy
} from '@/ports/repositories/fudaba-review-policy';

const { requiresCardReview } = fudabaReviewPolicy;

const live: CardReviewSnapshot = {
    producerName: 'P',
    bio: 'bio',
    tradeNote: 'note',
    isOriginal: false
};

function submission(
    overrides: Partial<FudabaPendingCardPayload> = {}
): FudabaPendingCardPayload {
    return {
        producer_name: 'P',
        producer_reading: 'ぴー',
        series_codes: ['series'],
        favorite_character_ids: [1, 3],
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

test('only artwork, name, bio, originality and the exchange note are reviewed', () => {
    assert.deepEqual([...CARD_REVIEW_EXEMPT_FIELDS].sort(), [
        'credits',
        'exchange_mode',
        'favorite_character_ids',
        'group_name',
        'made_on',
        'made_with_ai',
        'producer_reading',
        'series_codes',
        'visible'
    ]);
});

test('the exempt fields publish without a review', () => {
    const credit: FudabaCardCredit = {
        accountId: null,
        displayName: 'illustrator',
        url: 'https://example.com',
        roles: ['illustration']
    };
    const changes: Partial<FudabaPendingCardPayload>[] = [
        { producer_reading: 'ぴー2' },
        { series_codes: ['series2'] },
        { favorite_character_ids: [1] },
        { favorite_character_ids: [1, 3, 4] },
        { credits: [credit] },
        { exchange_mode: 'none' },
        { group_name: 'group' },
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

test('the reviewed fields always need a review', () => {
    const changes: Partial<FudabaPendingCardPayload>[] = [
        { producer_name: 'P2' },
        { bio: 'bio2' },
        { trade_note: 'note2' },
        { is_original: true }
    ];
    for (const change of changes) {
        assert.equal(
            requiresCardReview(live, submission(change)),
            true,
            JSON.stringify(change)
        );
    }
    assert.equal(
        requiresCardReview({ ...live, isOriginal: true }, submission({ is_original: false })),
        true
    );
});

test('trailing whitespace is not a content change', () => {
    assert.equal(
        requiresCardReview(live, submission({ producer_name: '  P  ' })),
        false
    );
    assert.equal(
        requiresCardReview(live, submission({ bio: ' bio ', trade_note: '\tnote' })),
        false
    );
    // Blanking a reviewed field is still a content change.
    assert.equal(requiresCardReview(live, submission({ bio: '   ' })), true);
});
