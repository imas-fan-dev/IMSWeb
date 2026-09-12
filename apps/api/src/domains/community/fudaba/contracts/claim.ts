import type { FudabaCardClaimRecord } from '@/ports/repositories';

function favoriteIdols(record: FudabaCardClaimRecord) {
    return record.favorite_idols.map((idol) => ({
        id: idol.idol_id,
        name: idol.name_cn,
        seriesCode: idol.agency_code
    }));
}

export function fudabaCardClaimView(claim: FudabaCardClaimRecord) {
    return {
        id: claim.id,
        legacyCardId: claim.legacy_card_id,
        targetCardId: claim.target_card_id,
        seriesCode: claim.series_code,
        favoriteIdols: favoriteIdols(claim),
        state: claim.state,
        message: claim.message,
        reviewNote: claim.review_note,
        revision: claim.revision,
        createdAt: claim.created_at,
        updatedAt: claim.updated_at,
        reviewedAt: claim.reviewed_at
    };
}
