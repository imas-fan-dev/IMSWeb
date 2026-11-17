import { adminExchangePath } from '@imsweb/contracts/paths';
import type { AdminOfficeReview } from '@imsweb/contracts/fudaba/office-review';
import { fudabaOwnerOfficeView } from '@/domains/community/fudaba/offices/response';
import type { CardPageView } from '@/domains/community/fudaba/cards/artwork-view';
import type {
    FudabaAdminCardClaim,
    FudabaRegisteredCardReview,
} from '@imsweb/contracts/fudaba/card-claims';
import { fudabaOwnerCardView } from '@/domains/community/fudaba/contracts/card';
import { fudabaCardClaimView } from '@/domains/community/fudaba/contracts/claim';
import type {
    FudabaAdminCardClaimRecord,
    FudabaRegisteredCardReviewRecord,
    FudabaOfficeReviewRecord,
} from '@/ports/repositories';

export function fudabaAdminOfficeReviewView(
    record: FudabaOfficeReviewRecord,
): AdminOfficeReview {
    return {
        office: fudabaOwnerOfficeView(
            record.office,
            adminExchangePath(
                `/offices/${encodeURIComponent(record.office.id)}`,
            ),
        ),
        owner: {
            id: record.office.owner_account_id,
            email: record.owner_email,
            displayName: record.owner_display_name,
        },
        reviewer:
            record.office.reviewed_by === null
                ? null
                : {
                      id: record.office.reviewed_by,
                      username: record.reviewer_username,
                      displayName: record.reviewer_display_name,
                  },
    };
}

export function fudabaRegisteredCardReviewView(
    card: FudabaRegisteredCardReviewRecord,
    pages?: readonly CardPageView[],
): FudabaRegisteredCardReview {
    const view = fudabaOwnerCardView(card, pages);
    // 审核队列按后台作用域取页面行：正/反两面由页序推导。
    const front = view.pages?.find((page) => page.role === 'front');
    const back = view.pages?.find((page) => page.role === 'back');
    return {
        card: {
            ...view,
            ...(front ? { frontImageUrl: front.url } : {}),
            backImageUrl: back?.url ?? null,
        },
        owner: {
            id: card.owner_account_id,
            displayName: card.owner_display_name,
        },
    };
}

export function fudabaAdminCardClaimView(
    claim: FudabaAdminCardClaimRecord,
): FudabaAdminCardClaim {
    return {
        ...fudabaCardClaimView(claim),
        targetCardNumber: claim.target_card_number,
        claimant: {
            id: claim.claimant_account_id,
            displayName: claim.claimant_display_name,
        },
        legacyCard: {
            id: claim.legacy_card_id,
        },
    };
}
