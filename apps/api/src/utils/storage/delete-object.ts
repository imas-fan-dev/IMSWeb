import type { CompensationService, ObjectStorage } from '@/ports/object-storage';

export interface ObjectCleanupServices {
    compensation?: CompensationService;
    storage?: ObjectStorage;
}

export async function deleteObjectWithCompensation(
    runtime: ObjectCleanupServices,
    key: string
): Promise<void> {
    if (!runtime.storage) return;
    try {
        await runtime.storage.delete(key);
    } catch (error) {
        if (!runtime.compensation) throw error;
        await runtime.compensation.enqueue('delete-object', { key }, error);
    }
}

export async function protectObjectWithCompensation(
    runtime: ObjectCleanupServices,
    key: string
): Promise<void> {
    if (!runtime.storage?.protect) throw new Error('Object protection is unavailable');
    const objectId = await runtime.storage.currentObjectId?.(key);
    try {
        if (objectId && runtime.storage.protectIfObjectId) {
            await runtime.storage.protectIfObjectId(key, objectId);
        } else {
            await runtime.storage.protect(key);
        }
    } catch (error) {
        if (
            !runtime.compensation || !objectId ||
            !runtime.storage.protectIfObjectId
        ) {
            throw error;
        }
        await runtime.compensation.enqueue(
            'protect-object',
            { key, objectId },
            error
        );
    }
}

export async function deleteOwnedObjectWithCompensation(
    runtime: ObjectCleanupServices,
    key: string,
    ownerToken: string
): Promise<void> {
    if (!runtime.storage) return;
    try {
        if (runtime.storage.deleteIfOwned) {
            await runtime.storage.deleteIfOwned(key, ownerToken);
            return;
        }
        await runtime.storage.delete(key);
    } catch (error) {
        if (!runtime.compensation) throw error;
        await runtime.compensation.enqueue('delete-object', { key }, error);
    }
}
