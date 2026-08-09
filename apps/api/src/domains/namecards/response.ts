export type NamecardResponseId = number | string;

export interface PublicNamecardResponse {
    id: NamecardResponseId;
    image1_url: string;
    image2_url: string;
    status: string;
    created_at: string | null;
}

export interface AdminNamecardResponse {
    id: NamecardResponseId;
    image1_url: string;
    image2_url: string;
    status: string;
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
    | { success: true; data: AdminNamecardResponse[] }
    | { success: false };

export type NamecardMutationResponse = { success: true } | { success: false };

export interface NamecardMessageResponse {
    msg: string;
}

export interface NamecardRateLimitResponse {
    error: string;
}

type NamecardRow = { readonly [field: string]: unknown };

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
    return {
        id: responseId(row.id),
        image1_url: responseString(row.image1_url, 'image1_url'),
        image2_url: responseString(row.image2_url, 'image2_url'),
        status: responseString(row.status, 'status'),
        created_at: responseTimestamp(row.created_at)
    };
}

export function toAdminNamecardResponse(row: NamecardRow): AdminNamecardResponse {
    return {
        id: responseId(row.id),
        image1_url: responseString(row.image1_url, 'image1_url'),
        image2_url: responseString(row.image2_url, 'image2_url'),
        status: responseString(row.status, 'status')
    };
}
