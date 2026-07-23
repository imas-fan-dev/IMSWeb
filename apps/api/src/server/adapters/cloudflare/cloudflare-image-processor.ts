import type { ImageInfo, ImageProcessor } from '@/ports/image-processor';
import { mimeMatchesImageInfo } from '@/shared/image-upload';

const MIME_BY_FORMAT: Record<string, string> = {
    avif: 'image/avif', bmp: 'image/bmp', gif: 'image/gif', heif: 'image/heif',
    jpeg: 'image/jpeg', jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp'
};

function source(body: Uint8Array, contentType = 'application/octet-stream'): ReadableStream<Uint8Array> {
    return new Blob([Uint8Array.from(body).buffer], { type: contentType }).stream();
}

function normalizeFormat(value: string): string {
    return value.toLowerCase().replace(/^image\//, '').replace('x-png', 'png');
}

async function outputBytes(result: ImageTransformationResult): Promise<Uint8Array> {
    return new Uint8Array(await new Response(result.image()).arrayBuffer());
}

export class CloudflareImageProcessor implements ImageProcessor {
    constructor(private readonly images: ImagesBinding) {}

    async validate(body: Uint8Array, declaredType?: string): Promise<ImageInfo> {
        const decoded = await this.images.info(source(body));
        if (!('width' in decoded) || !decoded.width || !decoded.height) throw new Error('无效图片');
        const format = normalizeFormat(decoded.format);
        const contentType = MIME_BY_FORMAT[format];
        if (!contentType) throw new Error('不支持的图片格式');
        const info = { format, width: decoded.width, height: decoded.height, contentType };
        if (declaredType && !mimeMatchesImageInfo(declaredType, info)) {
            throw new Error('图片类型与内容不匹配');
        }
        return info;
    }

    async toWebp(body: Uint8Array, quality = 85): Promise<Uint8Array> {
        return outputBytes(await this.images.input(source(body)).output({
            format: 'image/webp',
            quality
        }));
    }

    async thumbnailPng(body: Uint8Array, width: number, height: number): Promise<Uint8Array> {
        return outputBytes(await this.images.input(source(body))
            .transform({ width, height, fit: 'cover', gravity: 'center' })
            .output({ format: 'image/png', quality: 80 }));
    }

    async resizeJpeg(body: Uint8Array, width: number, height: number): Promise<Uint8Array> {
        return outputBytes(await this.images.input(source(body))
            .transform({ width, height, fit: 'scale-down' })
            .output({ format: 'image/jpeg', quality: 80 }));
    }
}
