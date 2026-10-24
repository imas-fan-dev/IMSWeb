import type { ImageProcessor } from '@/ports/media';
import type {
    FudabaMediaPreviewGuard,
    FudabaMessagesRepository,
} from '@/ports/repositories/fudaba-messages';

export async function createFudabaTinyPreview(
    images: ImageProcessor,
    body: Uint8Array
): Promise<string | null> {
    for (const width of [32, 24, 16]) {
        const resized = await images.resizeJpeg(
            body,
            width,
            Math.round((width * 2) / 3),
            { maxInputPixels: 100_000_000 }
        );
        const webp = await images.toWebp(resized, 40);
        const preview = `data:image/webp;base64,${Buffer.from(webp).toString('base64')}`;
        if (preview.length <= 2048) return preview;
    }
    return null;
}

export async function saveFudabaTinyPreview(
    repository: FudabaMessagesRepository,
    images: ImageProcessor,
    objectKey: string,
    body: Uint8Array,
    guard: FudabaMediaPreviewGuard
): Promise<boolean> {
    const digest = Buffer.from(
        await crypto.subtle.digest('SHA-256', Uint8Array.from(body))
    ).toString('hex');
    let preview: string | null = null;
    try {
        preview = await createFudabaTinyPreview(images, body);
    } catch {
        /* Existing assets can still use the skeleton fallback. */
    }
    const applied = await repository.saveMediaPreview(
        objectKey,
        digest,
        preview,
        guard
    );
    return applied && preview !== null;
}
