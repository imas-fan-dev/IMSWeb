import type { FudabaOwnerOffice } from '@imsweb/contracts/fudaba';
import type {
    FudabaOwnerOfficeRecord,
    FudabaOfficeStatus
} from '@/ports/repositories';

export function fudabaOwnerOfficeView(
    office: FudabaOwnerOfficeRecord
): FudabaOwnerOffice {
    const base = `/api/community/exchange/me/offices/${encodeURIComponent(office.id)}`;
    return {
        id: office.id,
        slug: office.slug,
        name: office.name,
        intro: office.intro,
        city: office.city,
        address: office.address,
        location: {
            latitude: office.latitude,
            longitude: office.longitude,
            precision: 'exact'
        },
        accent: office.accent,
        coverUrl: office.cover_object_key
            ? `${base}/media/cover?v=${office.revision}`
            : null,
        pendingCoverUrl: office.pending_cover_object_key
            ? `${base}/media/pending-cover?v=${office.revision}`
            : null,
        pendingCoverSubmittedAt: office.pending_cover_submitted_at,
        isOpen: office.is_open,
        visitorCount: office.visitor_count,
        status: office.status,
        revision: office.revision,
        seriesCodes: office.series_codes,
        createdAt: office.created_at,
        updatedAt: office.updated_at,
        archivedAt: office.archived_at
    };
}

export function fudabaOfficeConflict(
    revision: number,
    officeStatus: FudabaOfficeStatus
): Record<string, unknown> {
    return {
        success: false,
        code: 'FUDABA_OFFICE_STATE_CONFLICT',
        revision,
        officeStatus
    };
}
