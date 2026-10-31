import type { NamecardMediaParams } from "@imsweb/contracts/media";
import { publicUploadsPath } from "@imsweb/contracts/paths";
import { publicUploadKey } from "@/domains/delivery/media/media-access";
import { invalidRequest } from "@/utils/validation/request-data";
import {
    namecardThumbnailObjectKey,
    publicMediaObjectKey,
} from "@/utils/storage/business-object-keys";

export interface NamecardMediaRequest {
    filename: string;
    url: string;
    key: string;
}

export interface PublicUploadPathRequest {
    pathname: string;
    key: string;
}

function namecardFilename(params: NamecardMediaParams): string {
    if (
        typeof params.filename !== "string" ||
        !params.filename ||
        /[\\/\u0000-\u001f\u007f]/.test(params.filename)
    ) {
        invalidRequest("名片文件名无效");
    }
    return params.filename;
}

export function validateNamecardMediaParams(
    value: NamecardMediaParams,
): NamecardMediaRequest {
    const filename = namecardFilename(value);
    const url = publicUploadsPath(`/namecard/original/${filename}`);
    let key: string;
    try {
        key = publicMediaObjectKey(url);
    } catch {
        invalidRequest("名片文件名无效");
    }
    return { filename, url, key };
}

export function validateNamecardThumbnailMediaParams(
    value: NamecardMediaParams,
): NamecardMediaRequest {
    const filename = namecardFilename(value);
    const suffix = ".jpg";
    if (
        !filename.toLowerCase().endsWith(suffix) ||
        filename.length === suffix.length
    ) {
        invalidRequest("名片文件名无效");
    }
    const originalFilename = filename.slice(0, -suffix.length);
    return {
        filename,
        url: publicUploadsPath(`/namecard/original/${originalFilename}`),
        key: namecardThumbnailObjectKey(originalFilename),
    };
}

export function parsePublicUploadPathRequest(
    requestUrl: string,
): PublicUploadPathRequest | null {
    let pathname: string;
    try {
        pathname = new URL(requestUrl).pathname;
    } catch {
        return null;
    }
    const key = publicUploadKey(pathname);
    return key ? { pathname, key } : null;
}
