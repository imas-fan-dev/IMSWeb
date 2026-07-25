import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import {
    encodedChronicleMediaUrl,
    listChronicleObjects
} from '@/domains/chronicle/chronicle-records';
import { services } from '@/middleware/hono-context';

export async function handleListUsedChronicleMedia(
    c: Context<AppEnvironment>
): Promise<Response> {
    const storage = services(c).storage;
    if (!storage) throw new Error('Object storage unavailable');
    const result: Record<string, Array<{ filename: string; url: string }>> = {};
    for (const entry of await listChronicleObjects(storage, 'used')) {
        const parts = entry.key.split('/');
        const activityId = parts.at(-2)!;
        const filename = parts.at(-1)!;
        (result[activityId] ||= []).push({
            filename,
            url: encodedChronicleMediaUrl('used', activityId, filename)
        });
    }
    return c.json(result);
}
