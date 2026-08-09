import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import { decodeEventCursor, type EventCursor } from '@/domains/events/event-cursor';
import { services } from '@/middleware/hono-context';
import type { UploadedFile } from '@/ports/http';
import {
    invalidRequest,
    requestRecord
} from '@/utils/validation/request-data';
import {
    boundedPositiveInteger,
    canonicalPositiveInteger
} from '@/utils/validation/number';
import { trimmedText } from '@/utils/validation/text';

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 5;
const DEFAULT_CURSOR_LIMIT = 20;
const MAX_PAGE_VALUE = 100;
const MAX_EVENT_IMAGE_BYTES = 3 * 1024 * 1024;

export interface EventIdParams {
    id: number;
}

export type EventListQuery =
    | { mode: 'legacy'; page: number; size: number }
    | { mode: 'cursor'; limit: number; cursor: EventCursor | null };

export interface CreateEventRequest {
    title: string;
    name: string;
    contact: string;
    image: UploadedFile;
}

function pageValue(value: unknown, fallback: number, field: string): number {
    if (value === undefined) return fallback;
    const parsed = boundedPositiveInteger(value, MAX_PAGE_VALUE);
    if (!parsed) invalidRequest(`${field} must be an integer between 1 and 100`);
    return parsed;
}

export function validateEventIdParams(value: unknown): EventIdParams {
    const params = requestRecord(value, '活动 ID 无效');
    const id = canonicalPositiveInteger(params.id);
    if (!id) invalidRequest('活动 ID 无效');
    return { id };
}

export function validateEventListQuery(value: unknown): EventListQuery {
    const query = requestRecord(value, '活动分页参数无效');
    const cursorMode = query.limit !== undefined || query.cursor !== undefined;
    if (!cursorMode) {
        return {
            mode: 'legacy',
            page: pageValue(query.page, DEFAULT_PAGE, 'page'),
            size: pageValue(query.size, DEFAULT_PAGE_SIZE, 'size')
        };
    }
    if (query.page !== undefined || query.size !== undefined) {
        invalidRequest('Cannot mix page/size with limit/cursor');
    }
    const limit = pageValue(query.limit, DEFAULT_CURSOR_LIMIT, 'limit');
    const cursor = query.cursor === undefined
        ? null
        : typeof query.cursor === 'string'
            ? decodeEventCursor(query.cursor)
            : null;
    if (query.cursor !== undefined && !cursor) invalidRequest('Invalid event cursor');
    return { mode: 'cursor', limit, cursor };
}

export function validateEventFields(value: unknown): Omit<CreateEventRequest, 'image'> {
    const fields = requestRecord(value, '活动信息格式无效');
    const title = trimmedText(fields.title, { maximumLength: 160 });
    const name = trimmedText(fields.name, { maximumLength: 160 });
    const contact = trimmedText(fields.contact, { maximumLength: 500 });
    if (!title) invalidRequest('活动标题必须为 1-160 个字符');
    if (!name) invalidRequest('主办方或活动名必须为 1-160 个字符');
    if (!contact) invalidRequest('联系方式必须为 1-500 个字符');
    return { title, name, contact };
}

export async function parseCreateEventRequest(
    c: Context<AppEnvironment>
): Promise<CreateEventRequest> {
    const runtime = services(c);
    if (!runtime.uploads) throw new Error('Upload parser unavailable');
    const parsed = await runtime.uploads.parse(c.req.raw, {
        maxBytes: MAX_EVENT_IMAGE_BYTES + 64 * 1024,
        fileFields: ['image'],
        maxFiles: 1,
        maxFields: 8,
        maxParts: 9
    });
    const candidate = parsed.files.image;
    const image = candidate && !Array.isArray(candidate) ? candidate : null;
    if (!image || image.body.byteLength > MAX_EVENT_IMAGE_BYTES) {
        invalidRequest('必须上传一张图片');
    }
    return { ...validateEventFields(parsed.fields), image };
}
