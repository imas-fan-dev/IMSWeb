import { namecardThumbnailPublicUrl } from '@/utils/storage/business-object-keys';

export type NamecardResponseId = number | string;

export interface PublicNamecardResponse {
    id: NamecardResponseId;
    image1_url: string;
    image2_url: string;
    image1_thumbnail_url: string;
    image2_thumbnail_url: string;
    status: string;
    created_at: string | null;
}

export interface AdminNamecardResponse {
    id: NamecardResponseId;
    image1_url: string;
    image2_url: string;
    status: string;
    revision: number;
}

export interface NamecardSubmissionResponse {
    id: NamecardResponseId;
    image1_url: string;
    image2_url: string;
    status: 'pending' | 'approving' | 'approved' | 'rejected' | 'withdrawn';
    created_at: string | null;
    revision: number;
}

export interface NamecardSubmissionReceiptResponse {
    msg: string;
    submission: Pick<NamecardSubmissionResponse, 'id' | 'status' | 'revision'>;
    withdrawalToken: string;
}

export interface NamecardSubmissionDetailResponse {
    submission: NamecardSubmissionResponse;
}

export interface NamecardWithdrawalResponse {
    success: true;
    submission: NamecardSubmissionResponse;
}

export interface NamecardResubmitResponse {
    success: true;
    submission: NamecardSubmissionResponse;
}

export interface NamecardDetailResponse {
    image1_url: string;
    image2_url: string;
}

export type NamecardEmptyResponse = { readonly [field: string]: never };

export interface NamecardPageResponse {
    list: PublicNamecardResponse[];
    total: number;
    totalPage: number;
}

export interface NamecardListErrorResponse {
    msg: string;
}

export type AdminNamecardListResponse =
    | {
        success: true;
        data: AdminNamecardResponse[];
        pageInfo: {
            page: number;
            pageSize: number;
            total: number;
            totalPages: number;
            hasNextPage: boolean;
        };
    }
    | { success: false };

export type NamecardMutationResponse =
    | { success: true; revision?: number }
    | { success: false; error?: string; revision?: number };

export interface NamecardMessageResponse {
    msg: string;
}

export interface NamecardRateLimitResponse {
    error: string;
}

export interface NamecardErrorResponse {
    error: string;
    revision?: number;
}

interface NamecardRow {
    id?: unknown;
    image1_url?: unknown;
    image2_url?: unknown;
    status?: unknown;
    created_at?: unknown;
    revision?: unknown;
}

function responseId(value: unknown): NamecardResponseId {
    if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) return value;
    if (typeof value === 'string' && /^[1-9]\d*$/.test(value)) return value;
    throw new Error('Namecard response has an invalid id');
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

export function toPublicNamecardResponse(row: NamecardRow): PublicNamecardResponse {
    const image1Url = responseString(row.image1_url, 'image1_url');
    const image2Url = responseString(row.image2_url, 'image2_url');
    return {
        id: responseId(row.id),
        image1_url: image1Url,
        image2_url: image2Url,
        image1_thumbnail_url: namecardThumbnailPublicUrl(image1Url),
        image2_thumbnail_url: namecardThumbnailPublicUrl(image2Url),
        status: responseString(row.status, 'status'),
        created_at: responseTimestamp(row.created_at)
    };
}

export function toAdminNamecardResponse(row: NamecardRow): AdminNamecardResponse {
    return {
        id: responseId(row.id),
        image1_url: responseString(row.image1_url, 'image1_url'),
        image2_url: responseString(row.image2_url, 'image2_url'),
        status: responseString(row.status, 'status'),
        revision: responseRevision(row.revision)
    };
}

function responseRevision(value: unknown): number {
    if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return value;
    throw new Error('Namecard response has an invalid revision');
}

export function toNamecardSubmissionResponse(row: NamecardRow): NamecardSubmissionResponse {
    const status = responseString(row.status, 'status');
    if (!['pending', 'approving', 'approved', 'rejected', 'withdrawn'].includes(status)) {
        throw new Error('Namecard response has an invalid status');
    }
    return {
        id: responseId(row.id),
        image1_url: responseString(row.image1_url, 'image1_url'),
        image2_url: responseString(row.image2_url, 'image2_url'),
        status: status as NamecardSubmissionResponse['status'],
        created_at: responseTimestamp(row.created_at),
        revision: responseRevision(row.revision)
    };
}
