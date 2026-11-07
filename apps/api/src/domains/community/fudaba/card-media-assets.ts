import { publicUploadsPath } from '@imsweb/contracts/paths';
import type { ImageProcessor } from '@/ports/media';
import type { ObjectStorage } from '@/ports/object-storage';
import { namecardMediaObjectKeys } from '@/utils/storage/business-object-keys';
import {
    deleteObjectWithCompensation,
    type ObjectCleanupServices
} from '@/utils/storage/delete-object';


interface NamecardMediaWriteServices extends ObjectCleanupServices {
    images: ImageProcessor;
    storage: ObjectStorage;
}

export interface StoredNamecardMedia {
    keys: [string, string];
    url: string;
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

export async function deleteNamecardMedia(
    runtime: ObjectCleanupServices,
    originalUrls: readonly string[]
): Promise<void> {
    await Promise.all(originalUrls.flatMap(namecardMediaObjectKeys).map((key) =>
        deleteObjectWithCompensation(runtime, key)
    ));
}
