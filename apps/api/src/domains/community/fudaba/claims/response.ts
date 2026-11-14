import type { AdminCardSupplement } from '@imsweb/contracts/fudaba/card-claims';
import type { FudabaCardSupplementRecord } from '@/ports/repositories';

export function fudabaCardSupplementView(
    supplement: FudabaCardSupplementRecord
): AdminCardSupplement {
    return {
        id: supplement.id,
        cardId: supplement.card_id,
        state: supplement.state,
        payload: supplement.payload,
        submitter: {
            id: supplement.submitter_account_id,
            displayName: supplement.submitter_display_name
        },
        reviewNote: supplement.review_note,
        revision: supplement.revision,
        createdAt: supplement.created_at,
        updatedAt: supplement.updated_at,
        reviewedAt: supplement.reviewed_at
    };
}
