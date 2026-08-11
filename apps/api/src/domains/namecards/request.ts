import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import { services } from '@/middleware/hono-context';
import type { UploadedFile } from '@/ports/http';
import type { ValidatedRequestInput } from '@/middleware/request-validation';
import {
    canonicalPositiveInteger,
    positiveInteger
} from '@/utils/validation/number';
import {
    invalidRequest,
    requestRecord
} from '@/utils/validation/request-data';

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 25;
const MAX_UPLOAD_BYTES = 6 * 1024 * 1024 + 128 * 1024;

export interface NamecardIdParams {
    id: number;
}

export interface CompatibleNamecardIdParams {
    id: number;
}

export interface NamecardListQuery {
    page: number;
    size: number;
}

export interface AdminNamecardListQuery {
    page: number;
}

export interface ExpectedRevisionRequest {
    expected_revision: number;
}

export interface ExpectedRevisionQuery {
    expected_revision: number | null;
}

export type NamecardParamContext<Params extends NamecardIdParams | CompatibleNamecardIdParams> =
    Context<AppEnvironment, string, ValidatedRequestInput<'param', Params>>;

export type NamecardMutationContext = Context<
    AppEnvironment,
    string,
    ValidatedRequestInput<'param', CompatibleNamecardIdParams>
    & ValidatedRequestInput<'json', ExpectedRevisionRequest>
>;

export type NamecardDeleteContext = Context<
    AppEnvironment,
    string,
    ValidatedRequestInput<'param', CompatibleNamecardIdParams>
    & ValidatedRequestInput<'query', ExpectedRevisionQuery>
>;

export type NamecardWithdrawalContext = Context<
    AppEnvironment,
    string,
    ValidatedRequestInput<'param', NamecardIdParams>
    & ValidatedRequestInput<'json', ExpectedRevisionRequest>
>;

export interface UploadNamecardRequest {
    images: UploadedFile[];
}

function legacyPaginationValue(value: unknown, fallback: number): number {
    return Number.parseInt((value || '') as string, 10) || fallback;
}

export function validateNamecardIdParams(value: unknown): NamecardIdParams {
    const params = requestRecord(value, '名片 ID 无效');
    const id = canonicalPositiveInteger(params.id);
    if (!id) invalidRequest('名片 ID 无效');
    return { id };
}

export function validateCompatibleNamecardIdParams(value: unknown): CompatibleNamecardIdParams {
    const params = requestRecord(value, '名片 ID 无效');
    return { id: positiveInteger(params.id) || 0 };
}

export function validateNamecardListQuery(value: unknown): NamecardListQuery {
    const query = requestRecord(value, '名片分页参数无效');
    return {
        page: legacyPaginationValue(query.page, DEFAULT_PAGE),
        size: legacyPaginationValue(query.size, DEFAULT_PAGE_SIZE)
    };
}

export function validateAdminNamecardListQuery(value: unknown): AdminNamecardListQuery {
    const query = requestRecord(value, '名片分页参数无效');
    return { page: legacyPaginationValue(query.page, DEFAULT_PAGE) };
}

export function validateExpectedRevisionRequest(value: unknown): ExpectedRevisionRequest {
    const body = requestRecord(value, 'expected_revision is required');
    const revision = Number(body.expected_revision);
    if (!Number.isSafeInteger(revision) || revision < 0) {
        invalidRequest('expected_revision must be a non-negative integer');
    }
    return { expected_revision: revision };
}

export function validateExpectedRevisionQuery(value: unknown): ExpectedRevisionQuery {
    const query = requestRecord(value, 'expected_revision is required');
    if (query.expected_revision === undefined) {
        return { expected_revision: null };
    }
    const revision = typeof query.expected_revision === 'string' && /^\d+$/.test(query.expected_revision)
        ? Number(query.expected_revision)
        : Number.NaN;
    if (!Number.isSafeInteger(revision)) {
        invalidRequest('expected_revision must be a non-negative integer');
    }
    return { expected_revision: revision };
}

export function withdrawalToken(request: Request): string | null {
    const value = request.headers.get('X-Namecard-Withdrawal-Token');
    return value && /^[a-f0-9]{64}$/i.test(value) ? value.toLowerCase() : null;
}

function uploadedFiles(value: UploadedFile | UploadedFile[] | undefined): UploadedFile[] {
    if (!value) return [];
    return Array.isArray(value) ? value : [value];
}

export async function parseUploadNamecardRequest(
    c: Context<AppEnvironment>
): Promise<UploadNamecardRequest> {
    const uploads = services(c).uploads;
    if (!uploads) throw new Error('Upload parser unavailable');
    const parsed = await uploads.parse(c.req.raw, {
        maxBytes: MAX_UPLOAD_BYTES,
        fileFields: ['images'],
        maxFiles: 2,
        maxFields: 4,
        maxParts: 6
    });
    return { images: uploadedFiles(parsed.files.images) };
}
