export interface EventResponse {
    id: number | string;
    title: string | null;
    name: string | null;
    contact: string | null;
    image_url: string | null;
    created_at: string | null;
    summary?: string;
    kind?: string | null;
    source_url?: string | null;
    start_at?: string | null;
    end_at?: string | null;
    venue_name?: string | null;
    event_status?: string | null;
}

export interface EditorialEventResponse extends EventResponse {
    article_id: number | string;
    cover_url: string | null;
    summary: string;
    body_json: object;
    body_html: string;
    status: string;
    revision: number;
    kind: string | null;
    start_at: string | null;
    end_at: string | null;
    timezone: string | null;
    venue_name: string | null;
    address: string | null;
    registration_url: string | null;
    event_status: string | null;
    source_url: string | null;
    spotlight_category?: string | null;
    spotlight_order?: number | null;
    published_at: string | null;
}

export interface EventPageInfoResponse {
    nextCursor: string | null;
    hasNextPage: boolean;
    snapshotAt: string | null;
}

export interface EventCursorPageResponse {
    items: EventResponse[];
    pageInfo: EventPageInfoResponse;
}

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

function eventRecord(value: unknown): { [key: string]: unknown } {
    if (
        typeof value !== 'object' ||
        value === null ||
        Array.isArray(value)
    ) {
        throw new Error('Event repository returned an invalid row');
    }
    return value as { [key: string]: unknown };
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

export function toEventListResponse(value: unknown): EventResponse {
    const event = eventRecord(value);
    return {
        ...toEventResponse(event),
        summary: nullableText(event.summary, 'summary') || '',
        kind: nullableText(event.kind, 'kind'),
        source_url: nullableText(event.source_url, 'source_url'),
        start_at: eventTimestamp(event.start_at),
        end_at: eventTimestamp(event.end_at),
        venue_name: nullableText(event.venue_name, 'venue_name'),
        event_status: nullableText(event.event_status, 'event_status')
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
        article_id: eventId(event.article_id),
        cover_url: nullableText(event.cover_url, 'cover_url'),
        summary: nullableText(event.summary, 'summary') || '',
        body_json: body,
        body_html: nullableText(event.body_html, 'body_html') || '',
        status: nullableText(event.status, 'status') || 'published',
        revision,
        kind: nullableText(event.kind, 'kind'),
        start_at: nullableText(event.start_at, 'start_at'),
        end_at: nullableText(event.end_at, 'end_at'),
        timezone: nullableText(event.timezone, 'timezone'),
        venue_name: nullableText(event.venue_name, 'venue_name'),
        address: nullableText(event.address, 'address'),
        registration_url: nullableText(event.registration_url, 'registration_url'),
        event_status: nullableText(event.event_status, 'event_status'),
        source_url: nullableText(event.source_url, 'source_url'),
        spotlight_category: nullableText(event.spotlight_category, 'spotlight_category'),
        spotlight_order: event.spotlight_order === undefined || event.spotlight_order === null
            ? null
            : Number(event.spotlight_order),
        published_at: eventTimestamp(event.published_at)
    };
}
