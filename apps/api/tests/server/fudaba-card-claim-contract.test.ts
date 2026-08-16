import assert from 'node:assert/strict';
import test from 'node:test';
import {
    fudabaCardClaimView,
    parseLegacyCardClaim
} from '@/domains/fudaba/card-claims';
import { parseFudabaCardCreateFields } from '@/domains/fudaba/owner-card';
import { toPublicNamecardResponse } from '@/domains/namecards/response';
import type { FudabaCardClaimRecord } from '@/ports/repositories';

function registeredFields(favoriteIdolIds: string) {
    return {
        producerName: 'Producer',
        displayName: 'My card',
        seriesCode: '765',
        favoriteIdolIds,
        accent: '#dc2626',
        bio: '',
        tradeNote: '',
        available: 'true'
    };
}

test('registered card fields accept ordered multi-idol JSON and reject invalid sets', () => {
    assert.deepEqual(
        parseFudabaCardCreateFields(registeredFields('[3,1,2]')).favoriteIdolIds,
        [3, 1, 2]
    );
    for (const favoriteIdolIds of ['[]', '[1,1]', '[0]', 'not-json']) {
        assert.throws(
            () => parseFudabaCardCreateFields(registeredFields(favoriteIdolIds)),
            /favoriteIdolIds/
        );
    }
    assert.throws(
        () => parseFudabaCardCreateFields({
            ...registeredFields('[1]'),
            favoriteIdol: 'legacy scalar'
        }),
        /未知字段/
    );
});

test('legacy card claims accept cross-series selections and enforce 1..20 unique idols', () => {
    assert.deepEqual(parseLegacyCardClaim({
        targetCardId: null,
        seriesCode: '765',
        favoriteIdolIds: [900_001, 900_002],
        message: 'same producer'
    }), {
        targetCardId: null,
        seriesCode: '765',
        favoriteIdolIds: [900_001, 900_002],
        message: 'same producer'
    });
    for (const favoriteIdolIds of [
        [],
        [1, 1],
        [0],
        Array.from({ length: 21 }, (_, index) => index + 1)
    ]) {
        assert.throws(() => parseLegacyCardClaim({
            targetCardId: null,
            seriesCode: '765',
            favoriteIdolIds,
            message: ''
        }), /favoriteIdolIds/);
    }
});

test('namecard and claim views expose structured idol and claim metadata', () => {
    const publicCard = toPublicNamecardResponse({
        id: 7,
        image1_url: '/uploads/namecard/original/front.webp',
        image2_url: '/uploads/namecard/original/back.webp',
        status: 'approved',
        created_at: '2026-08-16T19:30:00.000Z',
        series_code: '765',
        favorite_idols: [{
            idol_id: 900_001,
            agency_code: '765',
            name_cn: '测试春香',
            display_order: 0
        }],
        claim_status: 'pending',
        viewer_claim_state: 'pending'
    });
    assert.equal(publicCard.seriesCode, '765');
    assert.deepEqual(publicCard.favoriteIdols, [{
        id: 900_001,
        name: '测试春香',
        seriesCode: '765'
    }]);
    assert.equal(publicCard.claimStatus, 'pending');
    assert.equal(publicCard.viewerClaimState, 'pending');

    const historicalCard = toPublicNamecardResponse({
        id: 8,
        image1_url: '/uploads/namecard/original/front.webp',
        image2_url: '/uploads/namecard/original/back.webp',
        status: 'approved',
        created_at: null
    });
    assert.equal(historicalCard.seriesCode, null);
    assert.deepEqual(historicalCard.favoriteIdols, []);
    assert.equal(historicalCard.claimStatus, 'unclaimed');

    const claim: FudabaCardClaimRecord = {
        id: 'claim-1',
        legacy_card_id: 7,
        claimant_account_id: 'account-1',
        target_card_id: null,
        series_code: '765',
        state: 'pending',
        message: '',
        review_note: '',
        reviewed_by: null,
        reviewed_at: null,
        revision: 0,
        created_at: '2026-08-16T19:30:00.000Z',
        updated_at: '2026-08-16T19:30:00.000Z',
        favorite_idols: [{
            idol_id: 900_001,
            agency_code: '765',
            name_cn: '测试春香',
            display_order: 0
        }]
    };
    assert.deepEqual(fudabaCardClaimView(claim).favoriteIdols, [{
        id: 900_001,
        name: '测试春香',
        seriesCode: '765'
    }]);
});
