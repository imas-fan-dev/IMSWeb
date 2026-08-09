import type { AppEnvironment } from '@/app';
import type { EventIdParams } from '@/domains/events/request';
import type {
    EventErrorResponse,
    EventMutationResponse
} from '@/domains/events/response';
import { eventRepository, services } from '@/middleware/hono-context';
import type { ValidatedRequestContext } from '@/middleware/request-validation';
import { deleteObjectWithCompensation } from '@/utils/storage/delete-object';
import { publicMediaObjectKey } from '@/utils/storage/business-object-keys';

export async function handleDeleteEvent(
    c: ValidatedRequestContext<AppEnvironment, 'param', EventIdParams>
): Promise<Response> {
    const { id } = c.req.valid('param');
    const repository = eventRepository(c);
    const media = await repository.findEventMedia(id);
    if (!media) return c.json({ error: '不存在' } satisfies EventErrorResponse, 404);
    await repository.deleteEvent(id);
    try {
        await deleteObjectWithCompensation(services(c), publicMediaObjectKey(media.image_url));
    } catch (error) {
        console.error('Failed to clean media for committed event deletion', error);
    }
    return c.json({ success: true } satisfies EventMutationResponse);
}
