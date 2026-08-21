import type { ListFudabaPublicMapOfficesInput } from '@/ports/repositories';

const CURSOR_VERSION = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const MAX_CURSOR_LENGTH = 2048;
const MAX_SERIES_FILTERS = 8;
const DEFAULT_MAP_LIMIT = 200;
const MAX_MAP_LIMIT = 500;
const SERIES_CODE_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const OFFICE_SLUG_PATTERN = /^[a-z0-9\u4e00-\u9fa5]+(?:-[a-z0-9\u4e00-\u9fa5]+)*$/;
const DECIMAL_PATTERN = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/;

export interface FudabaOfficeFilters {
    city?: string;
    seriesCodes?: string[];
    isOpen?: boolean;
}

export interface FudabaCardFilters {
    seriesCodes?: string[];
    available?: boolean;
    officeSlug?: string;
}

export interface FudabaOfficeCursor {
    visitorCount: number;
    id: string;
}

export interface FudabaCardCursor {
    createdAt: string;
    id: string;
}

export interface FudabaOfficeQuery {
    filters: FudabaOfficeFilters;
    limit: number;
    after?: FudabaOfficeCursor;
}

export interface FudabaCardQuery {
    filters: FudabaCardFilters;
    limit: number;
    after?: FudabaCardCursor;
}

function badRequest(message: string): Error {
    return Object.assign(new Error(message), { status: 400 });
}

function printableId(value: unknown): value is string {
    return typeof value === 'string' && value.length >= 1 && value.length <= 128 &&
        !/[\u0000-\u001f\u007f]/.test(value);
}

function parseLimit(value: string | null): number {
    return positiveLimit(value, DEFAULT_LIMIT, MAX_LIMIT);
}

function positiveLimit(
    value: string | null,
    defaultValue: number,
    maximum: number
): number {
    if (value === null) return defaultValue;
    if (!/^[1-9]\d*$/.test(value)) {
        throw badRequest(`limit must be an integer between 1 and ${maximum}`);
    }
    const limit = Number(value);
    if (!Number.isSafeInteger(limit) || limit > maximum) {
        throw badRequest(`limit must be an integer between 1 and ${maximum}`);
    }
    return limit;
}

function optionalText(
    value: string | null,
    name: string,
    maxLength: number
): string | undefined {
    if (value === null) return undefined;
    const normalized = value.trim();
    if (!normalized || normalized.length > maxLength || /[\u0000-\u001f\u007f]/.test(normalized)) {
        throw badRequest(`${name} is invalid`);
    }
    return normalized;
}

function optionalBoolean(value: string | null, name: string): boolean | undefined {
    if (value === null) return undefined;
    if (value === 'true') return true;
    if (value === 'false') return false;
    throw badRequest(`${name} must be true or false`);
}

function validateQueryKeys(
    parameters: URLSearchParams,
    allowed: ReadonlySet<string>,
    repeatable: ReadonlySet<string> = new Set()
): void {
    for (const key of parameters.keys()) {
        if (!allowed.has(key)) throw badRequest(`Unsupported query parameter: ${key}`);
        if (!repeatable.has(key) && parameters.getAll(key).length !== 1) {
            throw badRequest(`Query parameter must appear once: ${key}`);
        }
    }
}

function searchParameters(url: string): URLSearchParams {
    try {
        return new URL(url).searchParams;
    } catch {
        throw badRequest('Request URL is invalid');
    }
}

export function assertNoFudabaQuery(url: string): void {
    validateQueryKeys(searchParameters(url), new Set());
}

function encodeCursor(value: object): string {
    return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function decodedCursor(value: string): Record<string, unknown> | null {
    if (
        !value || value.length > MAX_CURSOR_LENGTH ||
        !/^[A-Za-z0-9_-]+$/.test(value)
    ) {
        return null;
    }
    try {
        const bytes = Buffer.from(value, 'base64url');
        if (bytes.toString('base64url') !== value) return null;
        const parsed = JSON.parse(bytes.toString('utf8')) as unknown;
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
            ? parsed as Record<string, unknown>
            : null;
    } catch {
        return null;
    }
}

function sameFilters(actual: unknown, expected: object): boolean {
    return JSON.stringify(actual) === JSON.stringify(expected);
}

function parseSeriesCodes(parameters: URLSearchParams): string[] {
    const result = parameters.getAll('series').map((value) =>
        optionalText(value, 'series', 40)
    );
    if (
        result.length > MAX_SERIES_FILTERS ||
        result.some((seriesCode) => !seriesCode || !SERIES_CODE_PATTERN.test(seriesCode)) ||
        new Set(result).size !== result.length
    ) {
        throw badRequest('series filters are invalid');
    }
    return result as string[];
}

export function encodeFudabaOfficeCursor(
    filters: FudabaOfficeFilters,
    after: FudabaOfficeCursor
): string {
    if (!Number.isSafeInteger(after.visitorCount) || after.visitorCount < 0 ||
        !printableId(after.id)) {
        throw new Error('Invalid Fudaba office cursor state');
    }
    return encodeCursor({
        version: CURSOR_VERSION,
        kind: 'offices',
        filters,
        after
    });
}

export function decodeFudabaOfficeCursor(
    value: string,
    filters: FudabaOfficeFilters
): FudabaOfficeCursor | null {
    const parsed = decodedCursor(value);
    const after = parsed?.after as Record<string, unknown> | undefined;
    if (
        parsed?.version !== CURSOR_VERSION || parsed.kind !== 'offices' ||
        !sameFilters(parsed.filters, filters) || !after ||
        !Number.isSafeInteger(after.visitorCount) || Number(after.visitorCount) < 0 ||
        !printableId(after.id)
    ) {
        return null;
    }
    return { visitorCount: Number(after.visitorCount), id: after.id };
}

export function encodeFudabaCardCursor(
    filters: FudabaCardFilters,
    after: FudabaCardCursor
): string {
    if (!printableId(after.id) || new Date(after.createdAt).toISOString() !== after.createdAt) {
        throw new Error('Invalid Fudaba card cursor state');
    }
    return encodeCursor({
        version: CURSOR_VERSION,
        kind: 'cards',
        filters,
        after
    });
}

export function decodeFudabaCardCursor(
    value: string,
    filters: FudabaCardFilters
): FudabaCardCursor | null {
    const parsed = decodedCursor(value);
    const after = parsed?.after as Record<string, unknown> | undefined;
    if (
        parsed?.version !== CURSOR_VERSION || parsed.kind !== 'cards' ||
        !sameFilters(parsed.filters, filters) || !after ||
        !printableId(after.id) || typeof after.createdAt !== 'string'
    ) {
        return null;
    }
    try {
        if (new Date(after.createdAt).toISOString() !== after.createdAt) return null;
    } catch {
        return null;
    }
    return { createdAt: after.createdAt, id: after.id };
}

export function parseFudabaOfficeQuery(url: string): FudabaOfficeQuery {
    const parameters = searchParameters(url);
    validateQueryKeys(
        parameters,
        new Set(['city', 'series', 'open', 'limit', 'cursor']),
        new Set(['series'])
    );
    const city = optionalText(parameters.get('city'), 'city', 100);
    const seriesCodes = parseSeriesCodes(parameters);
    const isOpen = optionalBoolean(parameters.get('open'), 'open');
    const filters = {
        ...(city ? { city } : {}),
        ...(seriesCodes.length ? { seriesCodes } : {}),
        ...(isOpen === undefined ? {} : { isOpen })
    };
    const cursorValue = parameters.get('cursor');
    const after = cursorValue ? decodeFudabaOfficeCursor(cursorValue, filters) : undefined;
    if (cursorValue && !after) throw badRequest('Invalid Fudaba office cursor');
    return {
        filters,
        limit: parseLimit(parameters.get('limit')),
        ...(after ? { after } : {})
    };
}

export function parseFudabaCardQuery(url: string): FudabaCardQuery {
    const parameters = searchParameters(url);
    validateQueryKeys(
        parameters,
        new Set(['series', 'available', 'office', 'limit', 'cursor']),
        new Set(['series'])
    );
    const seriesCodes = parseSeriesCodes(parameters);
    const available = optionalBoolean(parameters.get('available'), 'available');
    const officeSlug = optionalText(parameters.get('office'), 'office', 120);
    if (officeSlug && !OFFICE_SLUG_PATTERN.test(officeSlug)) {
        throw badRequest('office is invalid');
    }
    const filters = {
        ...(seriesCodes.length ? { seriesCodes } : {}),
        ...(available === undefined ? {} : { available }),
        ...(officeSlug ? { officeSlug } : {})
    };
    const cursorValue = parameters.get('cursor');
    const after = cursorValue ? decodeFudabaCardCursor(cursorValue, filters) : undefined;
    if (cursorValue && !after) throw badRequest('Invalid Fudaba card cursor');
    return {
        filters,
        limit: parseLimit(parameters.get('limit')),
        ...(after ? { after } : {})
    };
}

export function validFudabaOfficeSlug(value: string): boolean {
    return value.length <= 120 && OFFICE_SLUG_PATTERN.test(value);
}

function decimal(value: string, name: string): number {
    if (!DECIMAL_PATTERN.test(value)) throw badRequest(`bbox ${name} is invalid`);
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) throw badRequest(`bbox ${name} is invalid`);
    return parsed;
}

function scaledBoundary(value: string, direction: 'lower' | 'upper'): number {
    const negative = value.startsWith('-');
    const unsigned = negative ? value.slice(1) : value;
    const [integerPart, fraction = ''] = unsigned.split('.');
    const tenths = BigInt(integerPart!) * 10n + BigInt(fraction[0] ?? '0');
    const hasRemainder = /[1-9]/.test(fraction.slice(1));
    if (!negative) {
        return Number(direction === 'lower' && hasRemainder ? tenths + 1n : tenths);
    }
    return Number(
        direction === 'upper' && hasRemainder
            ? -(tenths + 1n)
            : -tenths
    );
}

function bbox(value: string | null): ListFudabaPublicMapOfficesInput['bbox'] {
    if (value === null) throw badRequest('bbox is required');
    const parts = value.split(',');
    if (parts.length !== 4) {
        throw badRequest('bbox must contain west,south,east,north');
    }
    const [west, south, east, north] = [
        decimal(parts[0]!, 'west'),
        decimal(parts[1]!, 'south'),
        decimal(parts[2]!, 'east'),
        decimal(parts[3]!, 'north')
    ];
    if (
        west < -180 || west > 180 || east < -180 || east > 180 ||
        south < -90 || south > 90 || north < -90 || north > 90
    ) {
        throw badRequest('bbox is outside valid coordinate ranges');
    }
    if (west >= east) {
        throw badRequest('bbox must not cross the antimeridian in V1');
    }
    if (south >= north) throw badRequest('bbox south must be less than north');
    return {
        westE1: scaledBoundary(parts[0]!, 'lower'),
        southE1: scaledBoundary(parts[1]!, 'lower'),
        eastE1: scaledBoundary(parts[2]!, 'upper'),
        northE1: scaledBoundary(parts[3]!, 'upper')
    };
}

export function parseFudabaMapQuery(url: string): ListFudabaPublicMapOfficesInput {
    const parameters = searchParameters(url);
    validateQueryKeys(
        parameters,
        new Set(['bbox', 'city', 'series', 'open', 'limit']),
        new Set(['series'])
    );
    const city = optionalText(parameters.get('city'), 'city', 100);
    const seriesCodes = parseSeriesCodes(parameters);
    const isOpen = optionalBoolean(parameters.get('open'), 'open');
    const bounds = bbox(parameters.get('bbox'));
    return {
        bbox: bounds,
        ...(city ? { city } : {}),
        ...(seriesCodes.length ? { seriesCodes } : {}),
        ...(isOpen === undefined ? {} : { isOpen }),
        limit: positiveLimit(parameters.get('limit'), DEFAULT_MAP_LIMIT, MAX_MAP_LIMIT)
    };
}
