import type { UploadedFile, UploadParser } from '@/ports/http';
import { revisionedContentRequest } from '@/utils/validation/request-data';

const MAX_ABOUT_IMAGE_BYTES = 10 * 1024 * 1024;

export interface AboutPageUpdateRequest {
    content: unknown;
    revision: string | null;
}

export interface AboutImageUploadRequest {
    image: UploadedFile;
}

function invalid(message: string): never {
    throw Object.assign(new Error(message), { status: 400 });
}

function oneFile(value: UploadedFile | UploadedFile[] | undefined): UploadedFile | null {
    if (!value || Array.isArray(value)) return null;
    return value;
}

async function parseAboutImageRequest(
    request: Request,
    uploads: UploadParser
): Promise<AboutImageUploadRequest> {
    const parsed = await uploads.parse(request, {
        maxBytes: MAX_ABOUT_IMAGE_BYTES + 64 * 1024,
        fileFields: ['image'],
        maxFiles: 1,
        maxFields: 0,
        maxParts: 1
    });
    const image = oneFile(parsed.files.image);
    if (!image || image.body.byteLength > MAX_ABOUT_IMAGE_BYTES) {
        invalid('必须上传一张不超过 10MB 的图片');
    }
    return { image };
}

export function validateAboutPageUpdateRequest(value: unknown): AboutPageUpdateRequest {
    return revisionedContentRequest(value, '关于页配置');
}

export function parseAboutHeroImageRequest(
    request: Request,
    uploads: UploadParser
): Promise<AboutImageUploadRequest> {
    return parseAboutImageRequest(request, uploads);
}

export function parseAboutMemberAvatarRequest(
    request: Request,
    uploads: UploadParser
): Promise<AboutImageUploadRequest> {
    return parseAboutImageRequest(request, uploads);
}
