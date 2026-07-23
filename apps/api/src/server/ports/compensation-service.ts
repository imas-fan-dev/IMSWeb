import type { ObjectStorage } from '@/ports/object-storage';

export interface CompensationService {
    enqueue(kind: string, payload: unknown, error?: unknown): Promise<string>;
    run(storage: ObjectStorage, limit?: number): Promise<void>;
}
