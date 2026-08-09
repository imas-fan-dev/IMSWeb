import type { AppEnvironment } from '@/app';
import type { ChronicleActivityParams } from '@/domains/chronicle/request';
import type { ChronicleActivityResponse } from '@/domains/chronicle/response';
import {
    chroniclePrefix,
    encodedChronicleMediaUrl,
    listChronicleObjects,
    readChronicleMeta,
    type ChronicleMeta
} from '@/domains/chronicle/chronicle-records';
import { services } from '@/middleware/hono-context';
import type { ValidatedRequestContext } from '@/middleware/request-validation';
import { resolvePublicObjectUrl } from '@/utils/storage/public-object-url';

export async function handleGetChronicleActivity(
    c: ValidatedRequestContext<AppEnvironment, 'param', ChronicleActivityParams>
): Promise<Response> {
    const { activityId } = c.req.valid('param');
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
    const images = await Promise.all((await listChronicleObjects(storage, 'used', activityId))
        .filter((entry) => entry.key.startsWith(usedPrefix))
        .map((entry) => {
            const fallback = encodedChronicleMediaUrl(
                'used',
                activityId,
                entry.key.split('/').at(-1)!
            );
            return resolvePublicObjectUrl(storage, entry.key, fallback);
        }));
    return c.json({
        id: activityId,
        title: meta.title || `活动 ${activityId}`,
        date: meta.date || '待补充',
        location: meta.location || '待补充',
        images
    } satisfies ChronicleActivityResponse);
}
