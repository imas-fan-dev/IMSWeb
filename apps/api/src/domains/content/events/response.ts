import type { SnapshotPageInfo } from '@imsweb/contracts/common';
import type {
    EventListItemInput,
    EventPageInput,
} from '@imsweb/contracts/events';

export type EventResponse = EventListItemInput;
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
