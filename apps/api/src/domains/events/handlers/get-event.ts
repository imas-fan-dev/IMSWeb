import type { AppEnvironment } from '@/app';
import type { EventIdParams } from '@/domains/events/request';
import {
    toEventResponse,
    type EventErrorResponse,
    type EventResponse
} from '@/domains/events/response';
import { eventRepository, services } from '@/middleware/hono-context';
import type { ValidatedRequestContext } from '@/middleware/request-validation';
import { resolvePublicMediaFields } from '@/utils/storage/public-object-url';

export async function handleGetEvent(
    c: ValidatedRequestContext<AppEnvironment, 'param', EventIdParams>
): Promise<Response> {
    const { id } = c.req.valid('param');
    if (!id) return c.json({ error: '活动不存在' } satisfies EventErrorResponse, 404);
    const event = await eventRepository(c).findEvent(id);
    if (!event) return c.json({ error: '活动不存在' } satisfies EventErrorResponse, 404);
    const storage = services(c).storage;
    const response = storage
        ? await resolvePublicMediaFields(storage, event, ['image_url'])
        : event;
    return c.json(toEventResponse(response) satisfies EventResponse);
}
