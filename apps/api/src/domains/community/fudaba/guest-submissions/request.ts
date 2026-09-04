import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import { services } from '@/middleware/hono-context';
import type { UploadedFile } from '@/ports/http';
import type { ValidatedRequestInput } from '@/middleware/request-validation';
import { canonicalPositiveInteger } from '@/utils/validation/number';
import { invalidRequest, requestRecord } from '@/utils/validation/request-data';

const MAX_UPLOAD_BYTES = 6 * 1024 * 1024 + 128 * 1024;
const FUDABA_WITHDRAWAL_TOKEN_HEADER = 'X-Fudaba-Guest-Submission-Token';

const OPTIONAL_PROFILE_FIELDS = [
    'producerName',
    'displayName',
    'bio',
    'accent',
] as const;
const UPLOAD_METADATA_FIELDS = [
    'seriesCode',
    'favoriteIdolIds',
    ...OPTIONAL_PROFILE_FIELDS,
] as const;

export interface GuestSubmissionIdParams {
    id: number;
}

export interface GuestSubmissionMediaParams extends GuestSubmissionIdParams {
    side: 'front' | 'back';
}

export interface GuestSubmissionWithdrawalRequest {
    expectedRevision: number;
}

export interface UploadGuestSubmissionRequest {
    images: UploadedFile[];
    seriesCode: string;
    favoriteIdolIds: number[];
    producerName: string | null;
    displayName: string | null;
    bio: string | null;
    accent: string | null;
}

export type GuestSubmissionParamContext = Context<
    AppEnvironment,
    string,
    ValidatedRequestInput<'param', GuestSubmissionIdParams>
>;

export type GuestSubmissionMediaContext = Context<
    AppEnvironment,
    string,
    ValidatedRequestInput<'param', GuestSubmissionMediaParams>
>;

export type GuestSubmissionWithdrawalContext = Context<
    AppEnvironment,
    string,
    ValidatedRequestInput<'param', GuestSubmissionIdParams> &
        ValidatedRequestInput<'json', GuestSubmissionWithdrawalRequest>
>;

function validateSubmissionId(value: unknown, field: string): GuestSubmissionIdParams {
    const params = requestRecord(value, '名片 ID 无效');
    const id = canonicalPositiveInteger(params[field]);
    if (!id) invalidRequest('名片 ID 无效');
    return { id };
}

export function validateFudabaGuestSubmissionIdParams(
    value: unknown,
): GuestSubmissionIdParams {
    return validateSubmissionId(value, 'submissionId');
}

export function validateFudabaGuestSubmissionMediaParams(
    value: unknown,
): GuestSubmissionMediaParams {
    const params = requestRecord(value, '名片媒体参数无效');
    const { id } = validateSubmissionId(params, 'submissionId');
    if (params.side !== 'front' && params.side !== 'back') {
        invalidRequest('名片媒体参数无效');
    }
    return { id, side: params.side as 'front' | 'back' };
}

function expectedRevision(value: unknown, field: string): GuestSubmissionWithdrawalRequest {
    const body = requestRecord(value, `${field} is required`);
    const revision = Number(body[field]);
    if (!Number.isSafeInteger(revision) || revision < 0) {
        invalidRequest(`${field} must be a non-negative integer`);
    }
    return { expectedRevision: revision };
}

export function validateFudabaGuestSubmissionWithdrawalRequest(
    value: unknown,
): GuestSubmissionWithdrawalRequest {
    return expectedRevision(value, 'expectedRevision');
}

export function guestSubmissionWithdrawalToken(request: Request): string | null {
    const value = request.headers.get(FUDABA_WITHDRAWAL_TOKEN_HEADER);
    return value && /^[a-f0-9]{64}$/i.test(value) ? value.toLowerCase() : null;
}

function uploadedFiles(
    value: UploadedFile | UploadedFile[] | undefined,
): UploadedFile[] {
    if (!value) return [];
    return Array.isArray(value) ? value : [value];
}

function optionalProfileText(
    fields: Record<string, string>,
    key: (typeof OPTIONAL_PROFILE_FIELDS)[number],
    label: string,
    maximumLength: number,
): string | null {
    const value = fields[key];
    if (value === undefined) return null;
    if (typeof value !== 'string' || /[\u0000-\u001f\u007f]/.test(value)) {
        invalidRequest(`${label}无效`);
    }
    const normalized = value.trim();
    if (normalized.length > maximumLength) invalidRequest(`${label}无效`);
    return normalized || null;
}

function optionalAccent(fields: Record<string, string>): string | null {
    const value = fields.accent;
    if (value === undefined) return null;
    const normalized = value.trim();
    if (!/^#[0-9a-fA-F]{6}$/.test(normalized)) invalidRequest('主题色无效');
    return normalized;
}

function uploadMetadata(fields: Record<string, string>): Omit<
    UploadGuestSubmissionRequest,
    'images'
> {
    if (
        Object.keys(fields).some(
            (key) => !(UPLOAD_METADATA_FIELDS as readonly string[]).includes(key),
        )
    ) {
        invalidRequest('名片投稿字段无效');
    }
    const seriesCode = fields.seriesCode?.trim() ?? '';
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(seriesCode)) {
        invalidRequest('主企划无效');
    }
    let favoriteIdolIds: unknown;
    try {
        favoriteIdolIds = JSON.parse(fields.favoriteIdolIds ?? '');
    } catch {
        invalidRequest('担当偶像无效');
    }
    if (
        !Array.isArray(favoriteIdolIds) ||
        favoriteIdolIds.length < 1 ||
        favoriteIdolIds.length > 20 ||
        favoriteIdolIds.some((id) => !Number.isSafeInteger(id) || id <= 0) ||
        new Set(favoriteIdolIds).size !== favoriteIdolIds.length
    ) {
        invalidRequest('担当偶像无效');
    }
    return {
        seriesCode,
        favoriteIdolIds: favoriteIdolIds as number[],
        producerName: optionalProfileText(fields, 'producerName', '制作人昵称', 80),
        displayName: optionalProfileText(fields, 'displayName', '名片名称', 120),
        bio: optionalProfileText(fields, 'bio', '简介', 2000),
        accent: optionalAccent(fields),
    };
}

export async function parseUploadGuestSubmissionRequest(
    c: Context<AppEnvironment>,
): Promise<UploadGuestSubmissionRequest> {
    const uploads = services(c).uploads;
    if (!uploads) throw new Error('Upload parser unavailable');
    const parsed = await uploads.parse(c.req.raw, {
        maxBytes: MAX_UPLOAD_BYTES,
        fileFields: ['images'],
        maxFiles: 2,
        maxFields: UPLOAD_METADATA_FIELDS.length,
        maxParts: 2 + UPLOAD_METADATA_FIELDS.length,
    });
    return {
        images: uploadedFiles(parsed.files.images),
        ...uploadMetadata(parsed.fields),
    };
}
