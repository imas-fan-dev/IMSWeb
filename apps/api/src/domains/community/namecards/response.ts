import type { FudabaCardClaimState } from '@/ports/repositories';
import type { NamecardDiffRecord, NamecardDiffSide } from '@/ports/repositories/namecards';
import type { CardFavoriteSelectionRecord } from '@/ports/repositories';
import type { NamecardCredit } from '@imsweb/contracts/fudaba';
import { namecardThumbnailPublicUrl } from '@/utils/storage/business-object-keys';
import type {
    AdminNamecard,
    AdminNamecardDiff,
    AdminNamecardFeedback,
    AdminNamecardFeedbackAuditListResponse as AdminNamecardFeedbackAuditContractResponse,
    AdminNamecardFeedbackListResponse as AdminNamecardFeedbackListContractResponse,
    AdminNamecardLockAuditListResponse as AdminNamecardLockAuditContractResponse,
    NamecardFeedbackResponse as NamecardFeedbackReplyContract,
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
export type AdminNamecardDiffResponse = AdminNamecardDiff;
/** Artwork routes answer with a bare 404: the page either exists or it does not. */
export const NAMECARD_MEDIA_NOT_FOUND = 'Not Found';

export type { NamecardDetailResponse, NamecardEmptyResponse, NamecardErrorResponse, NamecardListErrorResponse, NamecardMutationResponse };
export type NamecardPageResponse = NamecardPage;
export type AdminNamecardListResponse = AdminNamecardListContractResponse;
export type AdminNamecardFeedbackResponse = AdminNamecardFeedback;
export type AdminNamecardFeedbackListResponse =
    AdminNamecardFeedbackListContractResponse;
export type NamecardFeedbackResponse = NamecardFeedbackReplyContract;
export type AdminNamecardLockAuditListResponse = AdminNamecardLockAuditContractResponse;
export type AdminNamecardFeedbackAuditListResponse =
    AdminNamecardFeedbackAuditContractResponse;

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
    return (value as NamecardCredit[])
        .filter((entry) => typeof entry?.displayName === 'string')
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

/**
 * Thumbnails only exist for the canonical asset layout. Editor uploads are
 * served by the card media route, which has no thumbnail variant, so the
 * original page stands in rather than failing the whole response.
 */
function namecardThumbnailUrl(imageUrl: string): string {
    try {
        return namecardThumbnailPublicUrl(imageUrl);
    } catch {
        return imageUrl;
    }
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
        hasOwner: typeof row.owner_account_id === 'string',
        seriesCode: responseSeriesCode(row.series_code),
        favoriteCharacters: responseFavoriteCharacters(row.favorite_characters),
        claimStatus: responseClaimStatus(row.claim_status),
        viewerClaimState: responseViewerClaimState(row.viewer_claim_state),
        image1_url: image1Url,
        image2_url: image2Url,
        image1_thumbnail_url: namecardThumbnailUrl(image1Url),
        image2_thumbnail_url: image2Url === null ? null : namecardThumbnailUrl(image2Url),
        status: responseString(row.status, 'status'),
        created_at: responseTimestamp(row.created_at)
    };
    return Object.assign(response, {
        claimerName: responseClaimerName(row.claimer_name)
    });
}


type NamecardDiffSideResponse = AdminNamecardDiffResponse['live'];

function diffSide(side: NamecardDiffSide): NamecardDiffSideResponse {
    return {
        producerName: side.producerName,
        producerReading: side.producerReading,
        groupName: side.groupName,
        madeOn: side.madeOn,
        // Legacy rows carry empty strings; the diff contract speaks `null` for "not filled in".
        bio: side.bio?.trim() ? side.bio : null,
        tradeNote: side.tradeNote?.trim() ? side.tradeNote : null,
        isOriginal: side.isOriginal,
        madeWithAi: side.madeWithAi,
        visible: side.visible,
        exchangeMode: side.exchangeMode,
        seriesCodes: side.seriesCodes,
        credits: responseCredits(side.credits),
        favoriteCharacters: responseFavoriteCharacters(
            side.favoriteCharacters.map((character) => ({
                character_id: character.character_id,
                agency_code: character.agency_code,
                name_cn: character.name_cn,
                display_order: character.display_order
            }))
        ),
        frontImageUrl: side.frontImageUrl,
        backImageUrl: side.backImageUrl,
        middleImageUrls: side.middleImageUrls
    };
}

export function toAdminNamecardDiffResponse(
    record: NamecardDiffRecord
): AdminNamecardDiffResponse {
    return {
        id: record.id,
        status: record.status,
        publicationStatus: record.publicationStatus,
        reviewStatus: record.reviewStatus,
        revision: record.revision,
        ownerAccountId: record.ownerAccountId,
        ownerDisplayName: record.ownerDisplayName,
        lockReason: record.lockReason,
        reviewReason: record.reviewReason,
        live: diffSide(record.live),
        pending: record.pending ? diffSide(record.pending) : null
    };
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
        reviewReason: responseOptionalString(row.reviewReason),
        pageCount:
            1 +
            (row.image2_url ? 1 : 0) +
            responseStringList(row.middle_image_urls).length
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
