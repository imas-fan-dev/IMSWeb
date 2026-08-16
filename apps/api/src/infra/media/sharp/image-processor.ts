import sharp from 'sharp';
import {
    ImagePixelLimitError,
    type ImageInfo,
    type ImageInputOptions,
    type ImageProcessor,
    type ImageValidationOptions,
    type WebpConversionOptions
} from '@/ports/media';
import { mimeMatchesImageInfo } from '@/utils/media/image-upload';

const MIME_BY_FORMAT: Record<string, string> = {
    avif: 'image/avif', bmp: 'image/bmp', gif: 'image/gif',
    heif: 'image/heif', jpeg: 'image/jpeg', jpg: 'image/jpeg',
    png: 'image/png', tiff: 'image/tiff', webp: 'image/webp'
};

const DEFAULT_MAX_INPUT_PIXELS = 40_000_000;

function maxInputPixels(options?: ImageInputOptions): number {
    const limit = options?.maxInputPixels ?? DEFAULT_MAX_INPUT_PIXELS;
    if (!Number.isSafeInteger(limit) || limit < 1) throw new Error('Invalid input pixel limit');
    return limit;
}

function inputOptions(limitInputPixels: number) {
    return { failOn: 'error' as const, limitInputPixels };
}

function throwImageError(error: unknown, limit: number): never {
    if (error instanceof Error && error.message.includes('Input image exceeds pixel limit')) {
        throw new ImagePixelLimitError(limit);
    }
    throw error;
}

function scaledDimensions(
    width: number,
    height: number,
    maxOutputPixels: number
): { width: number; height: number } | null {
    if (!Number.isSafeInteger(maxOutputPixels) || maxOutputPixels < 1) {
        throw new Error('Invalid output pixel limit');
    }
    const pixels = width * height;
    if (pixels <= maxOutputPixels) return null;
    const scale = Math.sqrt(maxOutputPixels / pixels);
    return {
        width: Math.max(1, Math.floor(width * scale)),
        height: Math.max(1, Math.floor(height * scale))
    };
}

export class SharpImageProcessor implements ImageProcessor {
    async validate(
        body: Uint8Array,
        declaredType?: string,
        options?: ImageValidationOptions
    ): Promise<ImageInfo> {
        const limit = maxInputPixels(options);
        try {
            const image = sharp(body, inputOptions(limit));
            const metadata = await image.metadata();
            if (!metadata.format || !metadata.width || !metadata.height) throw new Error('无效图片');
            if (options?.fullDecode !== false) await image.clone().toBuffer();
            const contentType = MIME_BY_FORMAT[metadata.format];
            if (!contentType) throw new Error('不支持的图片格式');
            const info = {
                format: metadata.format,
                width: metadata.width,
                height: metadata.height,
                contentType
            };
            if (declaredType && !mimeMatchesImageInfo(declaredType, info)) {
                throw new Error('图片类型与内容不匹配');
            }
            return info;
        } catch (error) {
            throwImageError(error, limit);
        }
    }

    async toWebp(
        body: Uint8Array,
        quality = 85,
        options?: WebpConversionOptions
    ): Promise<Uint8Array> {
        const limit = maxInputPixels(options);
        try {
            const image = sharp(body, inputOptions(limit));
            let dimensions: { width: number; height: number } | null = null;
            if (options?.maxOutputPixels !== undefined) {
                const metadata = await image.metadata();
                dimensions = scaledDimensions(
                    metadata.autoOrient.width,
                    metadata.autoOrient.height,
                    options.maxOutputPixels
                );
            }
            const output = dimensions
                ? image.rotate().resize(dimensions.width, dimensions.height, {
                    fit: 'inside',
                    withoutEnlargement: true
                })
                : image.rotate();
            return new Uint8Array(await output.webp({ quality }).toBuffer());
        } catch (error) {
            throwImageError(error, limit);
        }
    }

    async thumbnailPng(body: Uint8Array, width: number, height: number): Promise<Uint8Array> {
        return new Uint8Array(await sharp(body, inputOptions(DEFAULT_MAX_INPUT_PIXELS))
            .resize(width, height, { fit: 'cover', position: 'center' })
            .png({ quality: 80 }).toBuffer());
    }

    async resizeJpeg(
        body: Uint8Array,
        width: number,
        height: number,
        options?: ImageInputOptions
    ): Promise<Uint8Array> {
        return new Uint8Array(await sharp(body, inputOptions(maxInputPixels(options)))
            .resize({ width, height, fit: 'inside', withoutEnlargement: true })
            .jpeg({ quality: 80 }).toBuffer());
    }
}
