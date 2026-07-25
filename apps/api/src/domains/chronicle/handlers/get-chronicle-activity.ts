import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import {
    chroniclePrefix,
    encodedChronicleMediaUrl,
    listChronicleObjects,
    readChronicleMeta,
    safeChronicleSegment,
    type ChronicleMeta
} from '@/domains/chronicle/chronicle-records';
import { services } from '@/middleware/hono-context';

export async function handleGetChronicleActivity(
    c: Context<AppEnvironment>
): Promise<Response> {
    const activityId = safeChronicleSegment(c.req.param('id'), 'activityId');
    const storage = services(c).storage;
    if (!storage) throw new Error('Object storage unavailable');
    let meta: ChronicleMeta = {};
    try {
        const value = await readChronicleMeta(storage, activityId);
        if (value && typeof value === 'object' && !Array.isArray(value)) {
            meta = value as ChronicleMeta;
        }
    } catch {
        // Preserve legacy fallback on malformed metadata.
    }
    const usedPrefix = `${chroniclePrefix('used', activityId)}/`;
    const images = (await listChronicleObjects(storage, 'used', activityId))
        .filter((entry) => entry.key.startsWith(usedPrefix))
        .map((entry) => encodedChronicleMediaUrl(
            'used',
            activityId,
            entry.key.split('/').at(-1)!
        ));
    return c.json({
        id: activityId,
        title: meta.title || `活动 ${activityId}`,
        date: meta.date || '待补充',
        location: meta.location || '待补充',
        images
    });
}
