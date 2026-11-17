import { publicUploadKey } from "@/domains/delivery/media/media-access";

export interface PublicUploadPathRequest {
    pathname: string;
    key: string;
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
