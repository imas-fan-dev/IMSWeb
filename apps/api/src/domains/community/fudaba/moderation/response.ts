import { adminExchangePath } from "@imsweb/contracts/paths";
import type { FudabaAdminCardClaim } from "@imsweb/contracts/fudaba/card-claims";
import type { FudabaLocationReview } from "@imsweb/contracts/fudaba/location-review";
import { fudabaOwnerCardView } from "@/domains/community/fudaba/contracts/card";
import { fudabaCardClaimView } from "@/domains/community/fudaba/contracts/claim";
import { regionalLocation } from "@/domains/community/fudaba/contracts/location";
import type {
    FudabaAdminCardClaimRecord,
    FudabaOfficeLocationReviewRecord,
    FudabaRegisteredCardReviewRecord,
} from "@/ports/repositories";

export function fudabaLocationReviewView(
    location: FudabaOfficeLocationReviewRecord,
): FudabaLocationReview {
    return {
        officeId: location.office_id,
        officeName: location.office_name,
        city: location.office_city,
        ownerAccountId: location.owner_account_id,
        location: regionalLocation(location.latitude_e1, location.longitude_e1),
        reviewState: location.review_state,
        revision: location.revision,
        submittedAt: location.submitted_at,
        reviewedAt: location.reviewed_at,
        reviewedBy: location.reviewed_by,
        reviewNote: location.review_note,
    };
}

export function fudabaRegisteredCardReviewView(
    card: FudabaRegisteredCardReviewRecord,
) {
    const encodedId = encodeURIComponent(card.id);
    return {
        card: {
            ...fudabaOwnerCardView(card),
            frontImageUrl: adminExchangePath(
                `/card-reviews/${encodedId}/media/front?v=${card.revision}`,
            ),
            backImageUrl: adminExchangePath(
                `/card-reviews/${encodedId}/media/back?v=${card.revision}`,
            ),
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
        claimant: {
            id: claim.claimant_account_id,
            displayName: claim.claimant_display_name,
        },
        legacyCard: {
            id: claim.legacy_card_id,
            frontImageUrl: claim.legacy_image1_url,
            backImageUrl: claim.legacy_image2_url,
        },
    };
}
