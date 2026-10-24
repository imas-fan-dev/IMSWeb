import type {
    FudabaGuestSubmissionDetail,
    FudabaGuestSubmission,
    FudabaGuestSubmissionReceipt,
    FudabaGuestSubmissionWithdrawal,
    FudabaGuestSubmissionMessage,
    FudabaGuestSubmissionError,
    FudabaGuestSubmissionRateLimit,
} from '@imsweb/contracts/fudaba/guest-submissions';
import type {
    CardFavoriteSelectionRecord,
    NamecardSubmissionRecord,
} from '@/ports/repositories';

export type FudabaGuestSubmissionReceiptResponse = FudabaGuestSubmissionReceipt;
export type FudabaGuestSubmissionDetailResponse = FudabaGuestSubmissionDetail;
export type FudabaGuestSubmissionWithdrawalResponse = FudabaGuestSubmissionWithdrawal;

export type GuestSubmissionMessageResponse = FudabaGuestSubmissionMessage;
export type GuestSubmissionRateLimitResponse = FudabaGuestSubmissionRateLimit;
export type GuestSubmissionErrorResponse = FudabaGuestSubmissionError;

function favoriteCharacters(row: NamecardSubmissionRecord): Array<{
    id: number;
    name: string;
    seriesCode: string;
}> {
    return (row.favorite_characters ?? row.favoriteCharacters ?? []).map(
        (character: CardFavoriteSelectionRecord) => ({
            id: character.character_id,
            name: character.name_cn,
            seriesCode: character.agency_code,
        }),
    );
}

function timestamp(value: string | Date | null): string | null {
    if (value === null || typeof value === 'string') return value;
    return value.toISOString();
}

export function toFudabaGuestSubmissionResponse(
    row: NamecardSubmissionRecord,
): FudabaGuestSubmission {
    return {
        id: row.id,
        seriesCode: row.series_code ?? row.seriesCode ?? null,
        favoriteCharacters: favoriteCharacters(row),
        frontImageUrl: row.image1_url,
        backImageUrl: row.image2_url,
        publicationStatus: row.status === 'approved' ? 'published' : row.status,
        createdAt: timestamp(row.created_at),
        revision: row.revision,
    };
}
