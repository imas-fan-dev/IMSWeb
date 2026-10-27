import type { FudabaOwnerLocation } from '@imsweb/contracts/fudaba';
import { publicOfficeLocation } from '@/domains/community/fudaba/contracts/location';
import type { FudabaOfficePublicLocationRecord } from '@/ports/repositories';

export function fudabaOwnerLocationView(
    location: FudabaOfficePublicLocationRecord
): FudabaOwnerLocation {
    return {
        officeId: location.office_id,
        location: publicOfficeLocation(location),
        exactLocationConsentAt: location.exact_location_consent_at,
        reviewState: location.review_state,
        revision: location.revision,
        submittedAt: location.submitted_at,
        reviewedAt: location.reviewed_at,
        reviewNote: location.review_note
    };
}
