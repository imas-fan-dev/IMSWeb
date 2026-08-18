import type { UploadedFile } from '@/ports/http';
import type { ListedObject, ObjectStorage } from '@/ports/object-storage';
import type { RuntimeServices } from '@/ports/runtime-services';
import { deleteObjectWithCompensation } from '@/utils/storage/delete-object';

export interface ChronicleRecord {
    filename: string;
    uploader?: string;
    time?: string;
    status?: string;
    idempotencyKey?: string;
    [key: string]: unknown;
}

export interface ChronicleMeta {
    records?: ChronicleRecord[];
    title?: string;
    date?: string;
    location?: string;
    [key: string]: unknown;
}

export function safeChronicleSegment(value: unknown, label: string): string {
    const segment = String(value ?? '');
    if (
        !segment || segment !== segment.trim() || segment === '.' || segment === '..' ||
        segment.length > 180 || /[\u0000-\u001f\u007f\\/<>:"|?*]/.test(segment)
    ) {
        throw Object.assign(new Error(`${label} is invalid`), { status: 400 });
    }
    return segment;
}

export function chroniclePrefix(bucket: string, activityId = '', filename = ''): string {
    const roots: Record<string, string> = {
        upload: 'chronicle/media/pending',
        used: 'chronicle/media/published',
        meta: 'chronicle/metadata',
        '.trash': 'chronicle/trash'
    };
    const root = roots[bucket];
    if (!root) throw new Error('invalid Chronicle object namespace');
    return [root, activityId, filename].filter(Boolean).join('/');
}

export async function listChronicleObjects(
    storage: ObjectStorage,
    bucket: string,
    activityId = ''
): Promise<ListedObject[]> {
    const prefix = `${chroniclePrefix(bucket, activityId).replace(/\/$/, '')}/`;
    return (await storage.list(prefix)).filter((object) => object.key.startsWith(prefix));
}

function metaKey(activityId: string): string {
    return chroniclePrefix('meta', '', `${activityId}.json`);
}

export function recordsFromChronicleMeta(meta: unknown): ChronicleRecord[] {
    if (Array.isArray(meta)) return meta as ChronicleRecord[];
    if (meta && typeof meta === 'object' && Array.isArray((meta as ChronicleMeta).records)) {
        return (meta as ChronicleMeta).records!;
    }
    return [];
}

export function withChronicleRecords(meta: unknown, records: ChronicleRecord[]): unknown {
    return Array.isArray(meta) ? records : {
        ...(meta && typeof meta === 'object' ? meta : {}),
        records
    };
}

export async function readChronicleMeta(
    storage: ObjectStorage,
    activityId: string
): Promise<unknown> {
    return (await readMetaSnapshot(storage, activityId)).value;
}

async function readMetaSnapshot(
    storage: ObjectStorage,
    activityId: string
): Promise<{ value: unknown; etag: string | null }> {
    const object = await storage.get(metaKey(activityId));
    if (!object) return { value: { records: [] }, etag: null };
    return {
        value: JSON.parse(new TextDecoder().decode(object.body)) as unknown,
        etag: object.etag
    };
}

export async function mutateChronicleMeta(
    storage: ObjectStorage,
    activityId: string,
    mutation: (current: unknown) => unknown
): Promise<void> {
    for (let attempt = 0; attempt < 12; attempt += 1) {
        const current = await readMetaSnapshot(storage, activityId);
        const next = mutation(current.value);
        const body = new TextEncoder().encode(JSON.stringify(next, null, 2));
        const options = { contentType: 'application/json; charset=utf-8' };
        if (!storage.putIfUnchanged) {
            await storage.put(metaKey(activityId), body, options);
            return;
        }
        if (await storage.putIfUnchanged(metaKey(activityId), current.etag, body, options)) return;
    }
    throw Object.assign(new Error('编年史元数据并发冲突'), { status: 409 });
}

export function chronicleFiles(
    value: UploadedFile | UploadedFile[] | undefined
): UploadedFile[] {
    return value ? Array.isArray(value) ? value : [value] : [];
}

export function encodedChronicleMediaUrl(
    bucket: string,
    activityId: string,
    filename: string
): string {
    return `/assets/images/eventchronicle/events/${bucket}/${encodeURIComponent(activityId)}/${encodeURIComponent(filename)}`;
}

export async function cleanupCommittedChronicleObject(
    runtime: RuntimeServices,
    key: string
): Promise<void> {
    try {
        await deleteObjectWithCompensation(runtime, key);
    } catch (error) {
        console.error('Failed to clean media for committed Chronicle mutation', error);
    }
}
