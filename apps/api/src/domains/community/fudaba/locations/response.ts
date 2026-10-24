import type { FudabaOwnerLocation } from '@imsweb/contracts/fudaba';
import { regionalLocation } from '@/domains/community/fudaba/contracts/location';
import type { FudabaOfficePublicLocationRecord } from '@/ports/repositories';

export function fudabaOwnerLocationView(
    location: FudabaOfficePublicLocationRecord
): FudabaOwnerLocation {
    return {
        officeId: location.office_id,
        location: regionalLocation(location.latitude_e1, location.longitude_e1),
        reviewState: location.review_state,
        revision: location.revision,
        submittedAt: location.submitted_at,
        reviewedAt: location.reviewed_at,
        reviewNote: location.review_note
    };
}
