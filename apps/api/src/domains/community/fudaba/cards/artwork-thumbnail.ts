import type { ImageProcessor } from '@/ports/media';
import type { ObjectStorage } from '@/ports/object-storage';
import { fudabaCardMediaThumbnailKey } from '@/utils/storage/business-object-keys';

export interface ArtworkThumbnailRuntime {
    images?: ImageProcessor | undefined;
    storage?: ObjectStorage | undefined;
}

/** The wall and the consoles draw cards a few hundred pixels wide. */
export const ARTWORK_THUMBNAIL_WIDTH = 600;
export const ARTWORK_THUMBNAIL_HEIGHT = 400;
export const ARTWORK_THUMBNAIL_MAX_INPUT_PIXELS = 100_000_000;

export interface StoredArtworkThumbnail {
    key: string;
    ownerToken: string;
}

/**
 * Writes the 600px copy next to the original. A failure only costs the small
 * file: every reader falls back to the original, so the upload still stands.
 */
export async function storeArtworkThumbnail(
    runtime: ArtworkThumbnailRuntime,
    input: {
        key: string;
        body: Uint8Array;
        ownerToken: string;
        accountId: string;
        side: string;
    }
): Promise<StoredArtworkThumbnail | null> {
    const thumbnailKey = fudabaCardMediaThumbnailKey(input.key);
    if (thumbnailKey === input.key || !runtime.images || !runtime.storage) return null;
    try {
        const thumbnail = await runtime.images.resizeJpeg(
            input.body,
            ARTWORK_THUMBNAIL_WIDTH,
            ARTWORK_THUMBNAIL_HEIGHT,
            { maxInputPixels: ARTWORK_THUMBNAIL_MAX_INPUT_PIXELS }
        );
        await runtime.storage.put(thumbnailKey, thumbnail, {
            contentType: 'image/jpeg',
            protectedAccess: true,
            ownerToken: input.ownerToken,
            metadata: {
                kind: 'fudaba-card-thumbnail',
                side: input.side,
                account: input.accountId
            }
        });
        return { key: thumbnailKey, ownerToken: input.ownerToken };
    } catch {
        return null;
    }
}
