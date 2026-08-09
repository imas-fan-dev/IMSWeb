import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import type {
    ChronicleActivityListResponse,
    ChronicleActivitySummaryResponse
} from '@/domains/chronicle/response';
import {
    chroniclePrefix,
    encodedChronicleMediaUrl,
    listChronicleObjects,
    readChronicleMeta,
    type ChronicleMeta
} from '@/domains/chronicle/chronicle-records';
import { services } from '@/middleware/hono-context';
import { resolvePublicObjectUrl } from '@/utils/storage/public-object-url';

export async function handleListChronicleActivities(
    c: Context<AppEnvironment>
): Promise<Response> {
    const storage = services(c).storage;
    if (!storage) throw new Error('Object storage unavailable');
    const activities: ChronicleActivitySummaryResponse[] = [];
    for (const entry of await listChronicleObjects(storage, 'meta')) {
        const id = entry.key.split('/').at(-1)!.replace(/\.json$/, '');
        try {
            const value = await readChronicleMeta(storage, id);
            const meta = value && typeof value === 'object' && !Array.isArray(value)
                ? value as ChronicleMeta
                : {};
            const usedPrefix = `${chroniclePrefix('used', id)}/`;
            const used = (await listChronicleObjects(storage, 'used', id))
                .filter((candidate) => candidate.key.startsWith(usedPrefix));
            const cover = used[0]
                ? encodedChronicleMediaUrl('used', id, used[0].key.split('/').at(-1)!)
                : null;
            activities.push({
                id,
                title: meta.title || `活动 ${id}`,
                date: meta.date || '待定',
                location: meta.location || '待补充',
                cover: used[0] && cover
                    ? await resolvePublicObjectUrl(storage, used[0].key, cover)
                    : null
            });
        } catch {
            // Skip malformed metadata.
        }
    }
    activities.sort((left, right) => {
        const a = String(left.date);
        const b = String(right.date);
        if (a === '待定') return b === '待定' ? 0 : 1;
        if (b === '待定') return -1;
        return a.localeCompare(b);
    });
    return c.json(activities satisfies ChronicleActivityListResponse);
}
