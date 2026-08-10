import type { UploadedFile } from '@/ports/http';
import {
    ImagePixelLimitError,
    type ImageProcessor,
    type ImageValidationOptions,
    type WebpConversionOptions
} from '@/ports/media';
import { validateUploadedImage } from '@/utils/media/image-upload';

const DEFAULT_MAX_INPUT_PIXELS = 40_000_000;
const JPEG_MAX_INPUT_PIXELS = 70_000_000;
const MAX_OUTPUT_PIXELS = 16_000_000;

function inputPixelLimit(filename: string): number {
    return /\.(?:jpe?g|jfif)$/i.test(filename)
        ? JPEG_MAX_INPUT_PIXELS
        : DEFAULT_MAX_INPUT_PIXELS;
}

function badRequest(message: string): Error {
    return Object.assign(new Error(message), { status: 400 });
}

export async function normalizeUploadedImageToWebp(
    file: UploadedFile,
    processor: ImageProcessor,
    quality: number
): Promise<Uint8Array> {
    const maxInputPixels = inputPixelLimit(file.filename);
    const validationOptions: ImageValidationOptions = {
        maxInputPixels,
        fullDecode: false
    };
    const conversionOptions: WebpConversionOptions = {
        maxInputPixels
    };
    const info = await validateUploadedImage(file, processor, validationOptions);
    if (info.width * info.height > DEFAULT_MAX_INPUT_PIXELS) {
        conversionOptions.maxOutputPixels = MAX_OUTPUT_PIXELS;
    }
    try {
        return await processor.toWebp(file.body, quality, conversionOptions);
    } catch (error) {
        if (error instanceof ImagePixelLimitError) {
            throw badRequest(`图片像素过大，最多允许${error.maxPixels / 10_000}万像素`);
        }
        throw badRequest('图片内容损坏或无法解码');
    }
}
