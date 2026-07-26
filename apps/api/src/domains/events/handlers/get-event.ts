import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import { eventRepository, services } from '@/middleware/hono-context';
import { resolvePublicMediaFields } from '@/utils/storage/public-object-url';
import { positiveInteger } from '@/utils/validation/number';

export async function handleGetEvent(c: Context<AppEnvironment>): Promise<Response> {
    const id = positiveInteger(c.req.param('id'));
    const event = id ? await eventRepository(c).findEvent(id) : null;
    if (!event) return c.json({ error: '活动不存在' }, 404);
    const storage = services(c).storage;
    return c.json(storage
        ? await resolvePublicMediaFields(storage, event, ['image_url'])
        : event);
}
