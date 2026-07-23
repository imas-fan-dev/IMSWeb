import type { RuntimeServices } from '@/ports/runtime-services';

export async function deleteObjectWithCompensation(
    runtime: RuntimeServices,
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
