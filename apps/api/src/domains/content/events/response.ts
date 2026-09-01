import type { SnapshotPageInfo } from '@imsweb/contracts/common';
import type { EditorialArticleInput } from '@imsweb/contracts/editorial';
import type {
    EventListItemInput,
    EventPageInput,
} from '@imsweb/contracts/events';

export type EventResponse = EventListItemInput;
export type EditorialEventResponse = EditorialArticleInput;
export type EventPageInfoResponse = SnapshotPageInfo;
export type EventCursorPageResponse = EventPageInput;

export interface EventLegacyPageResponse {
    list: EventResponse[];
    totalPage: number;
}

export interface CreateEventResponse {
    success: true;
    id: number;
}

export interface EventMutationResponse {
    success: true;
}

export interface EventErrorResponse {
    error: string;
}

interface EventSourceRecord {
    [field: string]: unknown;
}

function eventRecord(value: unknown): EventSourceRecord {
    if (
        typeof value !== 'object' ||
        value === null ||
        Array.isArray(value)
    ) {
        throw new Error('Event repository returned an invalid row');
    }
    return value as EventSourceRecord;
}

function eventId(value: unknown): number | string {
    if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) return value;
    if (typeof value === 'string' && /^[1-9]\d*$/.test(value)) return value;
    throw new Error('Event repository returned an invalid id');
}

function nullableText(value: unknown, field: string): string | null {
    if (value === undefined || value === null) return null;
    if (typeof value === 'string') return value;
    throw new Error(`Event repository returned an invalid ${field}`);
}

function eventTimestamp(value: unknown): string | null {
    if (value === undefined || value === null) return null;
    if (typeof value === 'string') return value;
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toJSON();
    throw new Error('Event repository returned an invalid created_at');
}

export function toEventResponse(value: unknown): EventResponse {
    const event = eventRecord(value);
    return {
        id: eventId(event.id),
        title: nullableText(event.title, 'title'),
        name: nullableText(event.name, 'name'),
        contact: nullableText(event.contact, 'contact'),
        image_url: nullableText(event.image_url, 'image_url'),
        created_at: eventTimestamp(event.created_at)
    };
}

function coverTransform(value: unknown): NonNullable<EventResponse['cover_transform']> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return { focalX: 0.5, focalY: 0.5, zoom: 1 };
    }
    const record = value as EventSourceRecord;
    const focalX = Number(record.focalX);
    const focalY = Number(record.focalY);
    const zoom = Number(record.zoom);
    if (!Number.isFinite(focalX) || !Number.isFinite(focalY) || !Number.isFinite(zoom)) {
        return { focalX: 0.5, focalY: 0.5, zoom: 1 };
    }
    return { focalX, focalY, zoom };
}

function relatedLinks(value: unknown): Array<{ label: string; url: string }> {
    const candidate = typeof value === 'string'
        ? (() => { try { return JSON.parse(value) as unknown; } catch { return []; } })()
        : value;
    if (!Array.isArray(candidate)) return [];
    return candidate.flatMap((item) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
        const link = item as EventSourceRecord;
        return typeof link.label === 'string' && typeof link.url === 'string'
            ? [{ label: link.label, url: link.url }]
            : [];
    });
}

// articles.title 是 NOT NULL，文章响应因此不接受空标题；旧 events 行没有
// 这条约束，所以只有编辑侧的构造器做这层收敛。
function articleTitle(value: unknown): string {
    const title = nullableText(value, 'title');
    if (title === null) throw new Error('Event repository returned an invalid title');
    return title;
}

function eventKind(value: unknown): 'event' | 'notice' | null {
    const kind = nullableText(value, 'kind');
    if (kind === null || kind === 'event' || kind === 'notice') return kind;
    throw new Error('Event repository returned an invalid kind');
}

function articleStatus(value: unknown): 'draft' | 'published' | 'archived' {
    const status = nullableText(value, 'status') || 'published';
    if (status === 'draft' || status === 'published' || status === 'archived') return status;
    throw new Error('Event repository returned an invalid status');
}

function spotlightCategory(value: unknown): 'activity' | 'fan' | null {
    const category = nullableText(value, 'spotlight_category');
    if (category === null || category === 'activity' || category === 'fan') return category;
    throw new Error('Event repository returned an invalid spotlight_category');
}

export function toEventListResponse(value: unknown): EventResponse {
    const event = eventRecord(value);
    return {
        ...toEventResponse(event),
        summary: nullableText(event.summary, 'summary') || '',
        kind: eventKind(event.kind),
        source_url: nullableText(event.source_url, 'source_url'),
        start_at: eventTimestamp(event.start_at),
        end_at: eventTimestamp(event.end_at),
        venue_name: nullableText(event.venue_name, 'venue_name'),
        event_status: nullableText(event.event_status, 'event_status'),
        cover_transform: coverTransform(event.cover_transform)
    };
}

export function toEditorialEventResponse(value: unknown): EditorialEventResponse {
    const event = eventRecord(value);
    const body = event.body_json;
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
        throw new Error('Event repository returned an invalid body_json');
    }
    const revision = Number(event.revision);
    if (!Number.isSafeInteger(revision) || revision < 0) {
        throw new Error('Event repository returned an invalid revision');
    }
    return {
        ...toEventResponse(event),
        title: articleTitle(event.title),
        article_id: eventId(event.article_id),
        cover_url: nullableText(event.cover_url, 'cover_url'),
        summary: nullableText(event.summary, 'summary') || '',
        body_json: body,
        body_html: nullableText(event.body_html, 'body_html') || '',
        status: articleStatus(event.status),
        revision,
        kind: eventKind(event.kind),
        start_at: eventTimestamp(event.start_at),
        end_at: eventTimestamp(event.end_at),
        timezone: nullableText(event.timezone, 'timezone'),
        venue_name: nullableText(event.venue_name, 'venue_name'),
        address: nullableText(event.address, 'address'),
        registration_url: nullableText(event.registration_url, 'registration_url'),
        event_status: nullableText(event.event_status, 'event_status'),
        source_url: nullableText(event.source_url, 'source_url'),
        related_links: relatedLinks(event.related_links),
        cover_transform: coverTransform(event.cover_transform),
        spotlight_category: spotlightCategory(event.spotlight_category),
        spotlight_order: event.spotlight_order === undefined || event.spotlight_order === null
            ? null
            : Number(event.spotlight_order),
        published_at: eventTimestamp(event.published_at)
    };
}
