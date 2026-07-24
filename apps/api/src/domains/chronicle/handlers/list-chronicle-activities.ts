import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import {
    chroniclePrefix,
    encodedChronicleMediaUrl,
    readChronicleMeta,
    type ChronicleMeta
} from '@/domains/chronicle/chronicle-records';
import { services } from '@/middleware/hono-context';

export async function handleListChronicleActivities(
    c: Context<AppEnvironment>
): Promise<Response> {
    const storage = services(c).storage;
    if (!storage) throw new Error('Object storage unavailable');
    const activities: Array<Record<string, unknown>> = [];
    for (const entry of await storage.list(chroniclePrefix('meta'))) {
        const id = entry.key.split('/').at(-1)!.replace(/\.json$/, '');
        try {
            const value = await readChronicleMeta(storage, id);
            const meta = value && typeof value === 'object' && !Array.isArray(value)
                ? value as ChronicleMeta
                : {};
            const usedPrefix = `${chroniclePrefix('used', id)}/`;
            const used = (await storage.list(usedPrefix))
                .filter((candidate) => candidate.key.startsWith(usedPrefix));
            activities.push({
                id,
                title: meta.title || `活动 ${id}`,
                date: meta.date || '待定',
                location: meta.location || '待补充',
                cover: used[0]
                    ? encodedChronicleMediaUrl('used', id, used[0].key.split('/').at(-1)!)
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
    return c.json(activities);
}
