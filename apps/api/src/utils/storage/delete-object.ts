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
