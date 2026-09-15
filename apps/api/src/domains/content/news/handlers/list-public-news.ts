import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import type { NewsListQuery } from '@/domains/content/news/request';
import type {
    NewsCursorPageResponse,
    PublicNewsItemResponse,
    PublicNewsListResponse
} from '@/domains/content/news/response';
import { newsRepository, services } from '@/middleware/hono-context';
import type { ValidatedRequestContext } from '@/middleware/request-validation';
import { resolvePublicMediaFields } from '@/utils/storage/public-object-url';
import {
    descendingIdAsDecimal,
    encodeDescendingIdCursor
} from '@/utils/validation/descending-id-cursor';

async function publicNewsRows(
    c: Context<AppEnvironment>,
    rows: PublicNewsItemResponse[]
): Promise<PublicNewsItemResponse[]> {
    const storage = services(c).storage;
    return storage
        ? Promise.all(rows.map((row) => resolvePublicMediaFields(storage, row, ['thumbnail'])))
        : rows;
}

async function listCursorNews(
    c: Context<AppEnvironment>,
    query: Extract<NewsListQuery, { mode: 'cursor' }>
): Promise<Response> {
    const { cursor, limit } = query;
    const repository = newsRepository(c);
    const snapshotId = cursor?.snapshotId ?? await repository.findLatestPublicNewsId();
    if (!snapshotId) {
        return c.json({
            items: [],
            pageInfo: { nextCursor: null, hasNextPage: false, snapshotAt: null }
        } satisfies NewsCursorPageResponse);
    }

    const rows = await repository.listPublicNewsByCursor(
        limit + 1,
        snapshotId,
        cursor?.afterId
    ) as PublicNewsItemResponse[];
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
    } satisfies NewsCursorPageResponse);
}

export async function handleListPublicNews(
    c: ValidatedRequestContext<AppEnvironment, 'query', NewsListQuery>
): Promise<Response> {
    const query = c.req.valid('query');
    if (query.mode === 'cursor') return listCursorNews(c, query);
    try {
        const rows = await newsRepository(c).listPublicNews() as PublicNewsItemResponse[];
        const response = await publicNewsRows(c, rows);
        return c.json(response satisfies PublicNewsListResponse);
    } catch {
        return c.json([] satisfies PublicNewsListResponse, 500);
    }
}
