import type { FudabaCardClaimState } from '@/ports/repositories';
import type { CardFavoriteSelectionRecord } from '@/ports/repositories';
import { namecardThumbnailPublicUrl } from '@/utils/storage/business-object-keys';
import type {
    AdminNamecard,
    AdminNamecardListResponse as AdminNamecardListContractResponse,
    Namecard,
    NamecardEmptyResponse,
    NamecardErrorResponse,
    NamecardFavoriteCharacterInput,
    NamecardListErrorResponse,
    NamecardMutationResponse,
    NamecardPage,
    NamecardDetailResponse,
} from '@imsweb/contracts/namecards';

export type NamecardResponseId = number;

export type NamecardFavoriteCharacterResponse = NamecardFavoriteCharacterInput;
export type PublicNamecardResponse = Namecard;
export type AdminNamecardResponse = AdminNamecard;
export type { NamecardDetailResponse, NamecardEmptyResponse, NamecardErrorResponse, NamecardListErrorResponse, NamecardMutationResponse };
export type NamecardPageResponse = NamecardPage;
export type AdminNamecardListResponse = AdminNamecardListContractResponse;

interface NamecardRow {
    id?: unknown;
    image1_url?: unknown;
    image2_url?: unknown;
    status?: unknown;
    created_at?: unknown;
    revision?: unknown;
    series_code?: unknown;
    favorite_characters?: unknown;
    display_name?: unknown;
    producer_name?: unknown;
    origin?: unknown;
    lockReason?: unknown;
    reviewStatus?: unknown;
    reviewReason?: unknown;
    claim_status?: unknown;
    viewer_claim_state?: unknown;
    claimer_name?: unknown;
}

function responseId(value: unknown): NamecardResponseId {
    const id = typeof value === 'string' ? Number(value) : value;
    if (typeof id === 'number' && Number.isSafeInteger(id) && id > 0) return id;
    throw new Error('Namecard response has an invalid id');
}

function responseOptionalString(value: unknown): string | null {
    return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

function responseString(value: unknown, field: string): string {
    if (typeof value === 'string') return value;
    throw new Error(`Namecard response has an invalid ${field}`);
}

function responseTimestamp(value: unknown): string | null {
    if (value === null) return null;
    if (typeof value === 'string') return value;
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
    throw new Error('Namecard response has an invalid created_at');
}

function responseSeriesCode(value: unknown): string | null {
    return typeof value === 'string' && value ? value : null;
}

function responseFavoriteCharacters(value: unknown): NamecardFavoriteCharacterResponse[] {
    if (!Array.isArray(value)) return [];
    return (value as CardFavoriteSelectionRecord[]).map((character) => ({
        id: character.character_id,
        name: character.name_cn,
        seriesCode: character.agency_code
    }));
}

function responseClaimStatus(value: unknown): PublicNamecardResponse['claimStatus'] {
    return value === 'claimed' || value === 'pending' ? value : 'unclaimed';
}

function responseViewerClaimState(value: unknown): FudabaCardClaimState | null {
    return value === 'pending' || value === 'approving' || value === 'approved' ||
        value === 'rejected' || value === 'cancelled'
        ? value
        : null;
}

function responseClaimerName(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const name = value.trim();
    return name ? name : null;
}

export function toPublicNamecardResponse(row: NamecardRow): PublicNamecardResponse {
    const image1Url = responseString(row.image1_url, 'image1_url');
    const image2Url = responseString(row.image2_url, 'image2_url');
    const response = {
        id: responseId(row.id),
        seriesCode: responseSeriesCode(row.series_code),
        favoriteCharacters: responseFavoriteCharacters(row.favorite_characters),
        claimStatus: responseClaimStatus(row.claim_status),
        viewerClaimState: responseViewerClaimState(row.viewer_claim_state),
        image1_url: image1Url,
        image2_url: image2Url,
        image1_thumbnail_url: namecardThumbnailPublicUrl(image1Url),
        image2_thumbnail_url: namecardThumbnailPublicUrl(image2Url),
        status: responseString(row.status, 'status'),
        created_at: responseTimestamp(row.created_at)
    };
    return Object.assign(response, {
        claimerName: responseClaimerName(row.claimer_name)
    });
}

export function toAdminNamecardResponse(row: NamecardRow): AdminNamecardResponse {
    return {
        id: responseId(row.id),
        image1_url: responseString(row.image1_url, 'image1_url'),
        image2_url: responseString(row.image2_url, 'image2_url'),
        status: responseString(row.status, 'status'),
        revision: responseRevision(row.revision),
        displayName: responseOptionalString(row.display_name),
        producerName: responseOptionalString(row.producer_name),
        origin: responseOptionalString(row.origin) ?? 'legacy',
        lockReason: responseOptionalString(row.lockReason),
        reviewStatus: responseReviewStatus(row.reviewStatus),
        reviewReason: responseOptionalString(row.reviewReason)
    };
}

function responseReviewStatus(
    value: unknown
): 'pending' | 'rejected' | 'locked' | null {
    return value === 'pending' || value === 'rejected' || value === 'locked'
        ? value
        : null;
}

function responseRevision(value: unknown): number {
    if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return value;
    throw new Error('Namecard response has an invalid revision');
}
