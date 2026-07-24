import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import {
    decodeEventCursor,
    encodeEventCursor,
    eventIdAsDecimal
} from '@/domains/events/event-cursor';
import { eventRepository } from '@/middleware/hono-context';

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 5;
const DEFAULT_CURSOR_LIMIT = 20;
const MAX_PAGE_VALUE = 100;

function boundedPaginationInteger(value: string | undefined, fallback: number): number | null {
    if (value === undefined) return fallback;
    if (!/^[1-9]\d*$/.test(value)) return null;
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed <= MAX_PAGE_VALUE ? parsed : null;
}

async function listCursorEvents(
    c: Context<AppEnvironment>,
    limitValue: string | undefined,
    cursorValue: string | undefined
): Promise<Response> {
    const limit = boundedPaginationInteger(limitValue, DEFAULT_CURSOR_LIMIT);
    if (!limit) return c.json({ error: 'limit must be an integer between 1 and 100' }, 400);

    const repository = eventRepository(c);
    const cursor = cursorValue === undefined ? null : decodeEventCursor(cursorValue);
    if (cursorValue !== undefined && !cursor) return c.json({ error: 'Invalid event cursor' }, 400);

    const snapshotId = cursor?.snapshotId ?? await repository.findLatestEventId();
    if (!snapshotId) {
        return c.json({
            items: [],
            pageInfo: { nextCursor: null, hasNextPage: false, snapshotAt: null }
        });
    }

    const rows = await repository.listEventsByCursor(limit + 1, snapshotId, cursor?.afterId);
    const hasNextPage = rows.length > limit;
    const items = hasNextPage ? rows.slice(0, limit) : rows;
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
    });
}

export async function handleListEvents(c: Context<AppEnvironment>): Promise<Response> {
    const pageValue = c.req.query('page');
    const sizeValue = c.req.query('size');
    const limitValue = c.req.query('limit');
    const cursorValue = c.req.query('cursor');
    const cursorMode = limitValue !== undefined || cursorValue !== undefined;
    if (cursorMode) {
        if (pageValue !== undefined || sizeValue !== undefined) {
            return c.json({ error: 'Cannot mix page/size with limit/cursor' }, 400);
        }
        return listCursorEvents(c, limitValue, cursorValue);
    }

    const page = boundedPaginationInteger(pageValue, DEFAULT_PAGE);
    const size = boundedPaginationInteger(sizeValue, DEFAULT_PAGE_SIZE);
    if (!page) return c.json({ error: 'page must be an integer between 1 and 100' }, 400);
    if (!size) return c.json({ error: 'size must be an integer between 1 and 100' }, 400);
    const total = await eventRepository(c).countEvents();
    const list = await eventRepository(c).listEvents(size, (page - 1) * size);
    return c.json({ list, totalPage: Math.ceil(total / size) });
}
