import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import {
    encodeEventCursor,
    eventIdAsDecimal
} from '@/domains/content/events/event-cursor';
import type { EventListQuery } from '@/domains/content/events/request';
import type {
    EventCursorPageResponse,
    EventLegacyPageResponse,
    EventResponse
} from '@/domains/content/events/response';
import { toEventListResponse } from '@/domains/content/events/response';
import { eventRepository, services } from '@/middleware/hono-context';
import type { ValidatedRequestContext } from '@/middleware/request-validation';
import { resolvePublicMediaFields } from '@/utils/storage/public-object-url';

async function publicEventRows(
    c: Context<AppEnvironment>,
    rows: Array<{ [key: string]: unknown }>
): Promise<EventResponse[]> {
    const storage = services(c).storage;
    const resolved = storage
        ? Promise.all(rows.map((row) => resolvePublicMediaFields(storage, row, ['image_url'])))
        : Promise.resolve(rows);
    return (await resolved).map(toEventListResponse);
}

async function listCursorEvents(
    c: Context<AppEnvironment>,
    query: Extract<EventListQuery, { mode: 'cursor' }>
): Promise<Response> {
    const repository = eventRepository(c);
    const { cursor, limit } = query;
    const snapshotId = cursor?.snapshotId ?? await repository.findLatestEventId();
    if (!snapshotId) {
        return c.json({
            items: [],
            pageInfo: { nextCursor: null, hasNextPage: false, snapshotAt: null }
        } satisfies EventCursorPageResponse);
    }

    const rows = await repository.listEventsByCursor(limit + 1, snapshotId, cursor?.afterId);
    const hasNextPage = rows.length > limit;
    const items = await publicEventRows(c, hasNextPage ? rows.slice(0, limit) : rows);
    const lastId = items.length ? eventIdAsDecimal(items.at(-1)?.id) : null;
    if (items.length && !lastId) throw new Error('Event row has an invalid id');

    return c.json({
        items,
        pageInfo: {
            nextCursor: hasNextPage && lastId
                ? encodeEventCursor({ snapshotId, afterId: lastId })
                : null,
            hasNextPage,
            snapshotAt: snapshotId
        }
    } satisfies EventCursorPageResponse);
}

export async function handleListEvents(
    c: ValidatedRequestContext<AppEnvironment, 'query', EventListQuery>
): Promise<Response> {
    const query = c.req.valid('query');
    if (query.mode === 'cursor') return listCursorEvents(c, query);
    const { page, size } = query;
    const total = await eventRepository(c).countEvents();
    const list = await publicEventRows(
        c,
        await eventRepository(c).listEvents(size, (page - 1) * size)
    );
    return c.json({
        list,
        totalPage: Math.ceil(total / size)
    } satisfies EventLegacyPageResponse);
}
