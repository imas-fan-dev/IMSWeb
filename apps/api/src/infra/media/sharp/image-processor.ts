import sharp from 'sharp';
import type { ImageInfo, ImageProcessor } from '@/ports/media';
import { mimeMatchesImageInfo } from '@/utils/media/image-upload';

const MIME_BY_FORMAT: Record<string, string> = {
    avif: 'image/avif', bmp: 'image/bmp', gif: 'image/gif',
    heif: 'image/heif', jpeg: 'image/jpeg', jpg: 'image/jpeg',
    png: 'image/png', tiff: 'image/tiff', webp: 'image/webp'
};

const INPUT_OPTIONS = {
    failOn: 'error' as const,
    limitInputPixels: 40_000_000
};

export class SharpImageProcessor implements ImageProcessor {
    async validate(body: Uint8Array, declaredType?: string): Promise<ImageInfo> {
        const image = sharp(body, INPUT_OPTIONS);
        const metadata = await image.metadata();
        if (!metadata.format || !metadata.width || !metadata.height) throw new Error('无效图片');
        await image.clone().toBuffer();
        const contentType = MIME_BY_FORMAT[metadata.format];
        if (!contentType) throw new Error('不支持的图片格式');
        const info = { format: metadata.format, width: metadata.width, height: metadata.height, contentType };
        if (declaredType && !mimeMatchesImageInfo(declaredType, info)) {
            throw new Error('图片类型与内容不匹配');
        }
        return info;
    }

    async toWebp(body: Uint8Array, quality = 85): Promise<Uint8Array> {
        return new Uint8Array(await sharp(body, INPUT_OPTIONS).webp({ quality }).toBuffer());
    }

    async thumbnailPng(body: Uint8Array, width: number, height: number): Promise<Uint8Array> {
        return new Uint8Array(await sharp(body, INPUT_OPTIONS)
            .resize(width, height, { fit: 'cover', position: 'center' })
            .png({ quality: 80 }).toBuffer());
    }

    async resizeJpeg(body: Uint8Array, width: number, height: number): Promise<Uint8Array> {
        return new Uint8Array(await sharp(body, INPUT_OPTIONS)
            .resize({ width, height, fit: 'inside', withoutEnlargement: true })
            .jpeg({ quality: 80 }).toBuffer());
    }
}
