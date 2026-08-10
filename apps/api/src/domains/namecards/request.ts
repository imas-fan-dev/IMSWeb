import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import { services } from '@/middleware/hono-context';
import type { UploadedFile } from '@/ports/http';
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
