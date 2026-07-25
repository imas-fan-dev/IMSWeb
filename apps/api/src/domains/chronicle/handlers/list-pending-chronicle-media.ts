import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import {
    encodedChronicleMediaUrl,
    listChronicleObjects,
    readChronicleMeta,
    recordsFromChronicleMeta
} from '@/domains/chronicle/chronicle-records';
import { services } from '@/middleware/hono-context';

export async function handleListPendingChronicleMedia(
    c: Context<AppEnvironment>
): Promise<Response> {
    const storage = services(c).storage;
    if (!storage) throw new Error('Object storage unavailable');
    const result: Record<string, Array<Record<string, unknown>>> = {};
    for (const entry of await listChronicleObjects(storage, 'meta')) {
        const activityId = entry.key.split('/').at(-1)!.replace(/\.json$/, '');
        try {
            const records = recordsFromChronicleMeta(await readChronicleMeta(storage, activityId))
                .filter((record) => record.status === 'pending')
                .map((record) => ({
                    filename: record.filename,
                    url: encodedChronicleMediaUrl('upload', activityId, record.filename),
                    uploader: record.uploader,
                    time: record.time
                }));
            if (records.length) result[activityId] = records;
        } catch {
            // Skip malformed legacy metadata.
        }
    }
    return c.json(result);
}
