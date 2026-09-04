import type {
    FudabaGuestSubmissionDetailInput,
    FudabaGuestSubmissionInput,
    FudabaGuestSubmissionReceiptInput,
    FudabaGuestSubmissionWithdrawalInput,
} from '@imsweb/contracts/fudaba/guest-submissions';
import type {
    CardIdolSelectionRecord,
    NamecardSubmissionRecord,
} from '@/ports/repositories';

export type FudabaGuestSubmissionReceiptResponse =
    FudabaGuestSubmissionReceiptInput;
export type FudabaGuestSubmissionDetailResponse = FudabaGuestSubmissionDetailInput;
export type FudabaGuestSubmissionWithdrawalResponse =
    FudabaGuestSubmissionWithdrawalInput;

export interface GuestSubmissionMessageResponse {
    msg: string;
}

export interface GuestSubmissionRateLimitResponse {
    error: string;
}

export interface GuestSubmissionErrorResponse {
    error: string;
    revision?: number;
}

function favoriteIdols(row: NamecardSubmissionRecord): Array<{
    id: number;
    name: string;
    seriesCode: string;
}> {
    return (row.favorite_idols ?? row.favoriteIdols ?? []).map(
        (idol: CardIdolSelectionRecord) => ({
            id: idol.idol_id,
            name: idol.name_cn,
            seriesCode: idol.agency_code,
        }),
    );
}

function timestamp(value: string | Date | null): string | null {
    if (value === null || typeof value === 'string') return value;
    return value.toISOString();
}

export function toFudabaGuestSubmissionResponse(
    row: NamecardSubmissionRecord,
): FudabaGuestSubmissionInput {
    return {
        id: row.id,
        seriesCode: row.series_code ?? row.seriesCode ?? null,
        favoriteIdols: favoriteIdols(row),
        frontImageUrl: row.image1_url,
        backImageUrl: row.image2_url,
        publicationStatus: row.status === 'approved' ? 'published' : row.status,
        createdAt: timestamp(row.created_at),
        revision: row.revision,
    };
}
