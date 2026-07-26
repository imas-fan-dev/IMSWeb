import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import { newsRepository, services } from '@/middleware/hono-context';
import { resolvePublicMediaFields } from '@/utils/storage/public-object-url';
import {
    decodeDescendingIdCursor,
    descendingIdAsDecimal,
    encodeDescendingIdCursor
} from '@/utils/validation/descending-id-cursor';

const DEFAULT_CURSOR_LIMIT = 20;
const MAX_CURSOR_LIMIT = 100;

async function publicNewsRows(
    c: Context<AppEnvironment>,
    rows: Record<string, unknown>[]
): Promise<Record<string, unknown>[]> {
    const storage = services(c).storage;
    return storage
        ? Promise.all(rows.map((row) => resolvePublicMediaFields(storage, row, ['thumbnail'])))
        : rows;
}

function boundedLimit(value: string | undefined): number | null {
    if (value === undefined) return DEFAULT_CURSOR_LIMIT;
    if (!/^[1-9]\d*$/.test(value)) return null;
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed <= MAX_CURSOR_LIMIT ? parsed : null;
}

async function listCursorNews(
    c: Context<AppEnvironment>,
    limitValue: string | undefined,
    cursorValue: string | undefined
): Promise<Response> {
    const limit = boundedLimit(limitValue);
    if (!limit) return c.json({ error: 'limit must be an integer between 1 and 100' }, 400);

    const cursor = cursorValue === undefined ? null : decodeDescendingIdCursor(cursorValue);
    if (cursorValue !== undefined && !cursor) return c.json({ error: 'Invalid news cursor' }, 400);

    const repository = newsRepository(c);
    const snapshotId = cursor?.snapshotId ?? await repository.findLatestPublicNewsId();
    if (!snapshotId) {
        return c.json({
            items: [],
            pageInfo: { nextCursor: null, hasNextPage: false, snapshotAt: null }
        });
    }

    const rows = await repository.listPublicNewsByCursor(
        limit + 1,
        snapshotId,
        cursor?.afterId
    );
    const hasNextPage = rows.length > limit;
    const items = await publicNewsRows(c, hasNextPage ? rows.slice(0, limit) : rows);
    const lastId = items.length ? descendingIdAsDecimal(items.at(-1)?.id) : null;
    if (items.length && !lastId) throw new Error('News row has an invalid id');

    return c.json({
        items,
        pageInfo: {
            nextCursor: hasNextPage && lastId
                ? encodeDescendingIdCursor({ snapshotId, afterId: lastId })
                : null,
            hasNextPage,
            snapshotAt: snapshotId
        }
    });
}

export async function handleListPublicNews(c: Context<AppEnvironment>): Promise<Response> {
    const limitValue = c.req.query('limit');
    const cursorValue = c.req.query('cursor');
    if (limitValue !== undefined || cursorValue !== undefined) {
        return listCursorNews(c, limitValue, cursorValue);
    }
    try {
        return c.json(await publicNewsRows(c, await newsRepository(c).listPublicNews()));
    } catch {
        return c.json([], 500);
    }
}
