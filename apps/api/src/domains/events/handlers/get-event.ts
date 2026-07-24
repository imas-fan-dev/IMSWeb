import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import { eventRepository } from '@/middleware/hono-context';
import { positiveInteger } from '@/utils/validation/number';

export async function handleGetEvent(c: Context<AppEnvironment>): Promise<Response> {
    const id = positiveInteger(c.req.param('id'));
    const event = id ? await eventRepository(c).findEvent(id) : null;
    return event ? c.json(event) : c.json({ error: '活动不存在' }, 404);
}
