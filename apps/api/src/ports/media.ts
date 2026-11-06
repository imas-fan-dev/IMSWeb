export interface ImageInfo {
    format: string;
    width: number;
    height: number;
    contentType: string;
}

export interface ImageInputOptions {
    maxInputPixels?: number;
}

export interface ImageValidationOptions extends ImageInputOptions {
    fullDecode?: boolean;
}

export interface WebpConversionOptions extends ImageInputOptions {
    maxOutputPixels?: number;
}

export class ImagePixelLimitError extends Error {
    constructor(readonly maxPixels: number) {
        super(`Input image exceeds ${maxPixels} pixel limit`);
        this.name = 'ImagePixelLimitError';
    }
}

export interface ImageProcessor {
    validate(
        body: Uint8Array,
        declaredType?: string,
        options?: ImageValidationOptions
    ): Promise<ImageInfo>;
    toWebp(
        body: Uint8Array,
        quality?: number,
        options?: WebpConversionOptions
    ): Promise<Uint8Array>;
    thumbnailPng(body: Uint8Array, width: number, height: number): Promise<Uint8Array>;
    resizeJpeg(
        body: Uint8Array,
        width: number,
        height: number,
        options?: ImageInputOptions
    ): Promise<Uint8Array>;
    /**
     * Mean colour of the artwork's most saturated hue family, as `#rrggbb`.
     * Optional so that lightweight image stand-ins keep working; callers must
     * fall back to the series colour when it is missing or returns null.
     */
    dominantColor?(body: Uint8Array): Promise<string | null>;
}

export interface MediaServices {
    images: ImageProcessor;
}
