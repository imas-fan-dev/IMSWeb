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
    producer_reading?: unknown;
    producer_name?: unknown;
    origin?: unknown;
    lockReason?: unknown;
    reviewStatus?: unknown;
    reviewReason?: unknown;
    claim_status?: unknown;
    viewer_claim_state?: unknown;
    claimer_name?: unknown;
    cardId?: unknown;
    card_number?: unknown;
    group_name?: unknown;
    made_on?: unknown;
    is_original?: unknown;
    made_with_ai?: unknown;
    bio?: unknown;
    trade_note?: unknown;
    exchange_mode?: unknown;
    accent?: unknown;
    series_codes?: unknown;
    credits?: unknown;
    middle_image_urls?: unknown;
    owner_account_id?: unknown;
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

function responseBoolean(value: unknown): boolean {
    return value === true;
}

function responseExchangeMode(
    value: unknown
): PublicNamecardResponse['exchangeMode'] {
    return value === 'auto' || value === 'manual' ? value : 'none';
}

function responseStringList(value: unknown): string[] {
    return Array.isArray(value)
        ? value.filter((entry): entry is string => typeof entry === 'string')
        : [];
}

function responseCredits(value: unknown): PublicNamecardResponse['credits'] {
    if (!Array.isArray(value)) return [];
    return (value as Array<Record<string, unknown>>)
        .filter((entry) => typeof entry.displayName === 'string')
        .map((entry) => ({
            accountId: typeof entry.accountId === 'string' ? entry.accountId : null,
            displayName: String(entry.displayName),
            url: typeof entry.url === 'string' ? entry.url : null,
            roles: responseCreditRoles(entry.roles)
        }));
}

function responseCreditRoles(
    value: unknown
): PublicNamecardResponse['credits'][number]['roles'] {
    const roles = Array.isArray(value)
        ? value.filter((role): role is 'design' | 'illustration' | 'other' =>
            role === 'design' || role === 'illustration' || role === 'other')
        : [];
    return roles.length ? roles : ['other'];
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

export function toPublicNamecardResponse(
    row: NamecardRow,
    viewerAccountId: string | null = null
): PublicNamecardResponse {
    const image1Url = responseString(row.image1_url, 'image1_url');
    const image2Url = responseOptionalString(row.image2_url);
    const response = {
        id: responseId(row.id),
        cardId:
            typeof row.cardId === 'string' && row.cardId
                ? row.cardId
                : String(responseId(row.id)),
        cardNumber: responseId(row.card_number ?? row.id),
        revision: responseRevision(row.revision ?? 0),
        producerName: responseOptionalString(row.producer_name),
        producerReading: responseOptionalString(row.producer_reading),
        groupName: responseOptionalString(row.group_name),
        madeOn: responseOptionalString(row.made_on),
        isOriginal: responseBoolean(row.is_original),
        madeWithAi: responseBoolean(row.made_with_ai),
        bio: responseOptionalString(row.bio),
        tradeNote: responseOptionalString(row.trade_note),
        exchangeMode: responseExchangeMode(row.exchange_mode),
        accent: responseOptionalString(row.accent),
        seriesCodes: responseStringList(row.series_codes),
        credits: responseCredits(row.credits),
        middleImageUrls: responseStringList(row.middle_image_urls),
        canEdit:
            typeof row.owner_account_id === 'string' &&
            row.owner_account_id === viewerAccountId,
        seriesCode: responseSeriesCode(row.series_code),
        favoriteCharacters: responseFavoriteCharacters(row.favorite_characters),
        claimStatus: responseClaimStatus(row.claim_status),
        viewerClaimState: responseViewerClaimState(row.viewer_claim_state),
        image1_url: image1Url,
        image2_url: image2Url,
        image1_thumbnail_url: namecardThumbnailPublicUrl(image1Url),
        image2_thumbnail_url:
            image2Url === null ? null : namecardThumbnailPublicUrl(image2Url),
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
        image2_url: responseOptionalString(row.image2_url),
        status: responseString(row.status, 'status'),
        revision: responseRevision(row.revision),
        producerReading: responseOptionalString(row.producer_reading),
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
