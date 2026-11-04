import assert from 'node:assert/strict';
import { test } from 'vitest';

import type {
    FudabaCardCredit,
    FudabaPendingCardPayload
} from '@/ports/repositories/fudaba';
import {
    CARD_REVIEW_EXEMPT_FIELDS,
    type CardReviewSnapshot,
    type CardSubmissionSnapshot,
    fudabaReviewPolicy,
    isArtworkReorder,
    sameArtworkOrder,
    sameCardSubmission
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

const artwork: CardSubmissionSnapshot = {
    producerName: 'P',
    producerReading: 'ぴー',
    bio: 'bio',
    tradeNote: 'note',
    groupName: null,
    madeOn: null,
    exchangeMode: 'manual',
    isOriginal: false,
    madeWithAi: false,
    visible: true,
    seriesCodes: ['series'],
    favoriteCharacterIds: [1, 3],
    credits: [{ accountId: null, displayName: 'A', url: null, roles: ['design'] }]
};

test('artwork order compares element by element', () => {
    assert.equal(sameArtworkOrder(['front', 'mid', 'back'], ['front', 'mid', 'back']), true);
    assert.equal(sameArtworkOrder(['front', 'mid', 'back'], ['front', 'back', 'mid']), false);
    assert.equal(sameArtworkOrder(['front'], ['front', 'back']), false);
});

test('only a pure permutation of the same pages counts as a reorder', () => {
    assert.equal(isArtworkReorder(['front', 'back'], ['back', 'front']), true);
    assert.equal(isArtworkReorder(['front', 'mid-1', 'back'], ['front', 'back', 'mid-1']), true);
    // A replacement is not a reorder even when the count matches.
    assert.equal(isArtworkReorder(['front', 'back'], ['front', 'swap']), false);
    // Repeating a page is not a reorder either.
    assert.equal(isArtworkReorder(['front', 'back'], ['front', 'front']), false);
    assert.equal(isArtworkReorder(['front', 'back'], ['front', 'back']), false);
    assert.equal(isArtworkReorder(['front'], ['front', 'back']), false);
});

const approved = submission({ credits: [...artwork.credits] });

test('an unchanged resubmission matches the approved copy', () => {
    assert.equal(sameCardSubmission(artwork, approved), true);
});

test('any edited field makes the resubmission a real change', () => {
    const cases: Partial<FudabaPendingCardPayload>[] = [
        { producer_name: 'Q' },
        { producer_reading: 'きゅー' },
        { bio: 'different' },
        { trade_note: 'another note' },
        { exchange_mode: 'auto' },
        { is_original: true },
        { made_with_ai: true },
        { visible: false },
        { series_codes: ['other'] },
        { favorite_character_ids: [1] },
        { credits: [] }
    ];
    for (const overrides of cases) {
        assert.equal(
            sameCardSubmission(artwork, submission({ ...approved, ...overrides })),
            false,
            JSON.stringify(overrides)
        );
    }
});

test('surrounding whitespace is not a change', () => {
    assert.equal(
        sameCardSubmission(
            { ...artwork, bio: 'bio', producerName: 'P' },
            submission({ ...approved, bio: '  bio ', producer_name: ' P ' })
        ),
        true
    );
});
