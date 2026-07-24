import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import { eventRepository, services } from '@/middleware/hono-context';
import { deleteObjectWithCompensation } from '@/utils/storage/delete-object';
import { positiveInteger } from '@/utils/validation/number';

export async function handleDeleteEvent(c: Context<AppEnvironment>): Promise<Response> {
    const id = positiveInteger(c.req.param('id'));
    if (!id) return c.json({ error: '不存在' }, 404);
    const repository = eventRepository(c);
    const media = await repository.findEventMedia(id);
    if (!media) return c.json({ error: '不存在' }, 404);
    await repository.deleteEvent(id);
    const key = media.image_url.replace(/^\/+/, '');
    try {
        await deleteObjectWithCompensation(services(c), key);
    } catch (error) {
        console.error('Failed to clean media for committed event deletion', error);
    }
    return c.json({ success: true });
}
