export interface ImageInfo {
    format: string;
    width: number;
    height: number;
    contentType: string;
}

export interface ImageProcessor {
    validate(body: Uint8Array, declaredType?: string): Promise<ImageInfo>;
    toWebp(body: Uint8Array, quality?: number): Promise<Uint8Array>;
    thumbnailPng(body: Uint8Array, width: number, height: number): Promise<Uint8Array>;
    resizeJpeg(body: Uint8Array, width: number, height: number): Promise<Uint8Array>;
}

export interface MediaServices {
    images: ImageProcessor;
}
