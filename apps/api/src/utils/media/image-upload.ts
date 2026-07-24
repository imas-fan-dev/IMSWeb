import type { UploadedFile } from '@/ports/http';
import type { ImageInfo, ImageProcessor } from '@/ports/media';

interface ImageTypeRule {
    mimes: readonly string[];
    formats: readonly string[];
}

const IMAGE_TYPES: Record<string, ImageTypeRule> = {
    '.png': { mimes: ['image/png', 'image/x-png'], formats: ['png'] },
    '.jpg': { mimes: ['image/jpeg', 'image/jpg', 'image/pjpeg'], formats: ['jpeg', 'jpg'] },
    '.jpeg': { mimes: ['image/jpeg', 'image/jpg', 'image/pjpeg'], formats: ['jpeg', 'jpg'] },
    '.jfif': { mimes: ['image/jpeg', 'image/jpg', 'image/pjpeg'], formats: ['jpeg', 'jpg'] },
    '.gif': { mimes: ['image/gif'], formats: ['gif'] },
    '.webp': { mimes: ['image/webp'], formats: ['webp'] },
    '.bmp': { mimes: ['image/bmp', 'image/x-ms-bmp'], formats: ['bmp'] },
    '.avif': { mimes: ['image/avif'], formats: ['avif', 'heif'] }
};

function badRequest(message: string): Error {
    return Object.assign(new Error(message), { status: 400 });
}

export function normalizedImageMime(value: string): string {
    return value.split(';', 1)[0]!.trim().toLowerCase();
}

export function mimeMatchesImageInfo(declaredType: string, info: ImageInfo): boolean {
    const declared = normalizedImageMime(declaredType);
    const actualFormat = info.format.toLowerCase();
    return Object.values(IMAGE_TYPES).some((rule) =>
        rule.formats.includes(actualFormat) && rule.mimes.includes(declared)
    );
}

export async function validateUploadedImage(
    file: UploadedFile,
    processor: ImageProcessor
): Promise<ImageInfo> {
    const extension = /(?:\.[^.]+)$/.exec(file.filename)?.[0].toLowerCase() ?? '';
    const expected = IMAGE_TYPES[extension];
    if (!expected) throw badRequest('图片格式不支持');
    const declared = normalizedImageMime(file.contentType);
    if (!expected.mimes.includes(declared)) {
        throw badRequest('图片扩展名与 MIME 类型不匹配');
    }

    let info: ImageInfo;
    try {
        info = await processor.validate(file.body);
    } catch {
        throw badRequest('图片内容损坏或无法解码');
    }
    if (!expected.formats.includes(info.format.toLowerCase())) {
        throw badRequest('图片内容与文件格式不匹配');
    }
    return info;
}
