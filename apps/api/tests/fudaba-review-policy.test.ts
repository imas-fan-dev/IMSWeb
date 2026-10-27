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
    displayName: 'NEI',
    producerName: 'P',
    seriesCode: 'series',
    favoriteCharacter: 'Mika',
    favoriteCharacterIds: [3, 1],
    accent: '#fff',
    bio: 'bio',
    tradeNote: 'note'
};

function submission(overrides: Partial<FudabaPendingCardPayload> = {}): FudabaPendingCardPayload {
    return {
        display_name: 'NEI',
        producer_name: 'P',
        series_code: 'series',
        favorite_character: 'Mika',
        favorite_character_ids: [...live.favoriteCharacterIds],
        accent: '#fff',
        bio: 'bio',
        trade_note: 'note',
        available: true,
        ...overrides
    };
}

test('identical content needs no review', () => {
    assert.equal(requiresCardReview(live, submission()), false);
});

test('exempt fields alone do not trigger review', () => {
    for (const field of CARD_REVIEW_EXEMPT_FIELDS) {
        assert.equal(field, 'available');
        assert.equal(requiresCardReview(live, submission({ available: false })), false);
    }
});

test('trailing whitespace is not a content change', () => {
    assert.equal(requiresCardReview(live, submission({ display_name: '  NEI  ' })), false);
});

test('reordered favourite characters are the same selection', () => {
    assert.equal(requiresCardReview(live, submission({ favorite_character_ids: [1, 3] })), false);
});

test('adding or dropping a favourite character needs review', () => {
    assert.equal(requiresCardReview(live, submission({ favorite_character_ids: [1] })), true);
    assert.equal(requiresCardReview(live, submission({ favorite_character_ids: [1, 3, 4] })), true);
});

test('any content field change needs review', () => {
    const changes: Partial<FudabaPendingCardPayload>[] = [
        { display_name: 'NEI 2' },
        { producer_name: 'P2' },
        { series_code: 'series2' },
        { favorite_character: 'Shizuka' },
        { accent: '#000' },
        { bio: 'bio2' },
        { trade_note: 'note2' }
    ];
    for (const change of changes) {
        assert.equal(requiresCardReview(live, submission(change)), true, JSON.stringify(change));
    }
});
