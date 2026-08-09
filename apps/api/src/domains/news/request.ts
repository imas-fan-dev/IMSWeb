import {
    decodeDescendingIdCursor,
    type DescendingIdCursor
} from '@/utils/validation/descending-id-cursor';
import {
    boundedPositiveInteger,
    canonicalPositiveInteger
} from '@/utils/validation/number';
import {
    invalidRequest,
    requestRecord
} from '@/utils/validation/request-data';

const DEFAULT_CURSOR_LIMIT = 20;
const MAX_CURSOR_LIMIT = 100;

export interface NewsIdParams {
    id: number;
}

export type NewsListQuery =
    | { mode: 'legacy' }
    | { mode: 'cursor'; limit: number; cursor: DescendingIdCursor | null };

export function validateNewsIdParams(value: unknown): NewsIdParams {
    const params = requestRecord(value, '资讯 ID 无效');
    const id = canonicalPositiveInteger(params.id);
    if (!id) invalidRequest('资讯 ID 无效');
    return { id };
}

export function validateNewsListQuery(value: unknown): NewsListQuery {
    const query = requestRecord(value, '资讯分页参数无效');
    if (query.limit === undefined && query.cursor === undefined) return { mode: 'legacy' };
    const limit = query.limit === undefined
        ? DEFAULT_CURSOR_LIMIT
        : boundedPositiveInteger(query.limit, MAX_CURSOR_LIMIT);
    if (!limit) invalidRequest('limit must be an integer between 1 and 100');
    const cursor = query.cursor === undefined
        ? null
        : typeof query.cursor === 'string'
            ? decodeDescendingIdCursor(query.cursor)
            : null;
    if (query.cursor !== undefined && !cursor) invalidRequest('Invalid news cursor');
    return { mode: 'cursor', limit, cursor };
}
