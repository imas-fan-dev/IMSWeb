import type { FudabaCardClaimRecord } from '@/ports/repositories';

function favoriteCharacters(record: FudabaCardClaimRecord) {
    return record.favorite_characters.map((character) => ({
        id: character.character_id,
        name: character.name_cn,
        seriesCode: character.agency_code
    }));
}

export function fudabaCardClaimView(claim: FudabaCardClaimRecord) {
    return {
        id: claim.id,
        legacyCardId: claim.legacy_card_id,
        targetCardId: claim.target_card_id,
        seriesCode: claim.series_code,
        favoriteCharacters: favoriteCharacters(claim),
        state: claim.state,
        message: claim.message,
        reviewNote: claim.review_note,
        revision: claim.revision,
        createdAt: claim.created_at,
        updatedAt: claim.updated_at,
        reviewedAt: claim.reviewed_at
    };
}
