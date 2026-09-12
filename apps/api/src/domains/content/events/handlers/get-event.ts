import type { AppEnvironment } from '@/app';
import type { EventIdParams } from '@/domains/content/events/request';
import {
    toEditorialEventResponse,
    toEventResponse,
    type EventErrorResponse,
    type EditorialEventResponse,
    type EventResponse
} from '@/domains/content/events/response';
import { eventRepository, services } from '@/middleware/hono-context';
import type { ValidatedRequestContext } from '@/middleware/request-validation';
import { resolvePublicMediaFields } from '@/utils/storage/public-object-url';

export async function handleGetEvent(
    c: ValidatedRequestContext<AppEnvironment, 'param', EventIdParams>
): Promise<Response> {
    const { id } = c.req.valid('param');
    if (!id) return c.json({ error: '活动不存在' } satisfies EventErrorResponse, 404);
    const editorialRepository = services(c).editorial;
    const editorial = editorialRepository
        ? await editorialRepository.findPublicEvent(id)
        : null;
    const event = editorial || await eventRepository(c).findEvent(id);
    if (!event) return c.json({ error: '活动不存在' } satisfies EventErrorResponse, 404);
    const storage = services(c).storage;
    const response = storage
        ? await resolvePublicMediaFields(storage, event, ['image_url'])
        : event;
    if (editorial) {
        const resolved = await resolveEditorialEventResponse(editorial, storage);
        return c.json(toEditorialEventResponse(resolved) satisfies EditorialEventResponse);
    }
    return c.json(toEventResponse(response) satisfies EventResponse);
}

async function resolveEditorialEventResponse(
    event: Record<string, unknown>,
    storage: ReturnType<typeof services>['storage']
): Promise<Record<string, unknown>> {
    if (!storage) return event;
    return resolvePublicMediaFields(storage, event, ['image_url']);
}
