import type { ImageProcessor } from '@/ports/media';
import type { ObjectStorage } from '@/ports/object-storage';
import {
    namecardMediaObjectKeys,
    namecardThumbnailPublicUrl
} from '@/utils/storage/business-object-keys';
import {
    deleteObjectWithCompensation,
    type ObjectCleanupServices
} from '@/utils/storage/delete-object';

export const NAMECARD_THUMBNAIL_WIDTH = 600;
export const NAMECARD_THUMBNAIL_HEIGHT = 400;
export const NAMECARD_THUMBNAIL_MAX_INPUT_PIXELS = 100_000_000;

interface NamecardMediaWriteServices extends ObjectCleanupServices {
    images: ImageProcessor;
    storage: ObjectStorage;
}

export interface StoredNamecardMedia {
    keys: [string, string];
    url: string;
}

export async function storeProtectedNamecardMedia(
    runtime: NamecardMediaWriteServices,
    filename: string,
    webp: Uint8Array
): Promise<StoredNamecardMedia> {
    const url = `/uploads/namecard/original/${filename}`;
    const keys = namecardMediaObjectKeys(url);
    const thumbnail = await runtime.images.resizeJpeg(
        webp,
        NAMECARD_THUMBNAIL_WIDTH,
        NAMECARD_THUMBNAIL_HEIGHT,
        { maxInputPixels: NAMECARD_THUMBNAIL_MAX_INPUT_PIXELS }
    );
    const written: string[] = [];
    try {
        await runtime.storage.put(keys[0], webp, {
            contentType: 'image/webp',
            protectedAccess: true
        });
        written.push(keys[0]);
        await runtime.storage.put(keys[1], thumbnail, {
            contentType: 'image/jpeg',
            protectedAccess: true
        });
        written.push(keys[1]);
        return { keys, url };
    } catch (error) {
        await Promise.all(written.map((key) =>
            deleteObjectWithCompensation(runtime, key).catch(() => undefined)
        ));
        throw error;
    }
}

export async function publishNamecardMedia(
    storage: ObjectStorage,
    originalUrls: readonly string[]
): Promise<void> {
    if (!storage.publish) throw new Error('Object storage publication is unavailable');
    await Promise.all(originalUrls.flatMap(namecardMediaObjectKeys).map((key) =>
        storage.publish!(key)
    ));
}

export interface NamecardThumbnailEnsureServices {
    images?: ImageProcessor;
    storage: ObjectStorage;
}

export async function ensureNamecardThumbnails(
    runtime: NamecardThumbnailEnsureServices,
    originalUrls: readonly string[]
): Promise<void> {
    for (const originalUrl of originalUrls) {
        const [originalKey, thumbnailKey] = namecardMediaObjectKeys(originalUrl);
        if (await runtime.storage.exists(thumbnailKey)) continue;
        if (!runtime.images) throw new Error('Image processing is unavailable');
        const original = await runtime.storage.get(originalKey);
        if (!original) throw new Error('Namecard original object not found');
        const thumbnail = await runtime.images.resizeJpeg(
            original.body,
            NAMECARD_THUMBNAIL_WIDTH,
            NAMECARD_THUMBNAIL_HEIGHT,
            { maxInputPixels: NAMECARD_THUMBNAIL_MAX_INPUT_PIXELS }
        );
        await runtime.storage.put(thumbnailKey, thumbnail, {
            contentType: 'image/jpeg',
            protectedAccess: true
        });
    }
}

export async function deleteNamecardMedia(
    runtime: ObjectCleanupServices,
    originalUrls: readonly string[]
): Promise<void> {
    await Promise.all(originalUrls.flatMap(namecardMediaObjectKeys).map((key) =>
        deleteObjectWithCompensation(runtime, key)
    ));
}

export async function resolveNamecardThumbnailUrl(
    storage: ObjectStorage,
    originalUrl: string,
    resolvedOriginalUrl: string
): Promise<string> {
    const publicPath = namecardThumbnailPublicUrl(originalUrl);
    const [, key] = namecardMediaObjectKeys(originalUrl);
    try {
        const direct = await storage.createPublicReadUrl?.(key, { publicPath });
        if (direct) return direct;
        return await storage.exists(key) ? publicPath : resolvedOriginalUrl;
    } catch {
        return resolvedOriginalUrl;
    }
}
