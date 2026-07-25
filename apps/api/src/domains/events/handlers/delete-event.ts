import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import { eventRepository, services } from '@/middleware/hono-context';
import { deleteObjectWithCompensation } from '@/utils/storage/delete-object';
import { publicMediaObjectKey } from '@/utils/storage/business-object-keys';
import { positiveInteger } from '@/utils/validation/number';

export async function handleDeleteEvent(c: Context<AppEnvironment>): Promise<Response> {
    const id = positiveInteger(c.req.param('id'));
    if (!id) return c.json({ error: '不存在' }, 404);
    const repository = eventRepository(c);
    const media = await repository.findEventMedia(id);
    if (!media) return c.json({ error: '不存在' }, 404);
    await repository.deleteEvent(id);
    try {
        await deleteObjectWithCompensation(services(c), publicMediaObjectKey(media.image_url));
    } catch (error) {
        console.error('Failed to clean media for committed event deletion', error);
    }
    return c.json({ success: true });
}
