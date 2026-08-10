import {
    publicUploadKey,
    thumbnailDimension,
    thumbnailKey
} from '@/domains/media/media-access';
import {
    invalidRequest,
    requestRecord
} from '@/utils/validation/request-data';
import { publicMediaObjectKey } from '@/utils/storage/business-object-keys';

export interface ThumbnailTargetRequest {
    key: string;
    namecardUrl?: string;
}

export interface ThumbnailQueryRequest {
    url: string;
    width: number;
    height: number;
    target: ThumbnailTargetRequest | null;
}

export interface NamecardMediaParams {
    filename: string;
    url: string;
    key: string;
}

export interface PublicUploadPathRequest {
    pathname: string;
    key: string;
}

function queryText(value: unknown): string | undefined {
    if (typeof value === 'string') return value;
    return Array.isArray(value) && typeof value[0] === 'string' ? value[0] : undefined;
}

export function validateThumbnailQuery(value: unknown): ThumbnailQueryRequest {
    const query = requestRecord(value, '缩略图参数无效');
    const url = queryText(query.url) ?? '';
    return {
        url,
        width: thumbnailDimension(queryText(query.width)),
        height: thumbnailDimension(queryText(query.height)),
        target: thumbnailKey(url)
    };
}

export function validateNamecardMediaParams(value: unknown): NamecardMediaParams {
    const params = requestRecord(value, '名片文件名无效');
    if (
        typeof params.filename !== 'string' ||
        !params.filename ||
        /[\\/\u0000-\u001f\u007f]/.test(params.filename)
    ) {
        invalidRequest('名片文件名无效');
    }
    const url = `/uploads/namecard/original/${params.filename}`;
    let key: string;
    try {
        key = publicMediaObjectKey(url);
    } catch {
        invalidRequest('名片文件名无效');
    }
    return {
        filename: params.filename,
        url,
        key
    };
}

export function parsePublicUploadPathRequest(
    requestUrl: string
): PublicUploadPathRequest | null {
    const pathname = new URL(requestUrl).pathname;
    const key = publicUploadKey(pathname);
    return key ? { pathname, key } : null;
}
