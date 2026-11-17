import { parseFudabaRevision } from '@/domains/community/fudaba/contracts/card';

const SERIES_CODE_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export interface FudabaOfficeFields {
    name: string;
    intro: string;
    city: string;
    address: string;
    latitude: number;
    longitude: number;
    accent: string;
    isOpen: boolean;
    seriesCodes: string[];
}

export interface FudabaOfficeUpdate extends FudabaOfficeFields {
    expectedRevision: number;
}

const OFFICE_FIELDS = [
    'name',
    'intro',
    'city',
    'address',
    'latitude',
    'longitude',
    'accent',
    'isOpen',
    'seriesCodes'
] as const;

function badRequest(message: string): Error {
    return Object.assign(new Error(message), { status: 400 });
}

function object(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw badRequest('请求体必须是对象');
    }
    return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[]): void {
    const expected = new Set(allowed);
    if (
        Object.keys(value).length !== allowed.length ||
        Object.keys(value).some((key) => !expected.has(key))
    ) {
        throw badRequest('请求体字段无效');
    }
}

function text(value: unknown, name: string, maximum: number, required: boolean): string {
    if (typeof value !== 'string') throw badRequest(`${name} 必须是字符串`);
    const normalized = value.trim();
    if (
        (required && !normalized) || normalized.length > maximum ||
        /[\u0000-\u001f\u007f]/.test(normalized)
    ) {
        throw badRequest(`${name} 长度或内容无效`);
    }
    return normalized;
}

function coordinate(value: unknown, name: string, minimum: number, maximum: number): number {
    if (
        typeof value !== 'number' || !Number.isFinite(value) ||
        value < minimum || value > maximum
    ) {
        throw badRequest(`${name} 必须是有效坐标`);
    }
    return value;
}

function seriesCodes(value: unknown): string[] {
    if (!Array.isArray(value) || value.length > 8) {
        throw badRequest('seriesCodes 最多包含 8 个企划标签');
    }
    const result = value.map((entry) =>
        text(entry, 'seriesCode', 40, true)
    );
    if (
        result.some((entry) => !SERIES_CODE_PATTERN.test(entry)) ||
        new Set(result).size !== result.length
    ) {
        throw badRequest('seriesCodes 包含无效或重复企划标签');
    }
    return result;
}

function officeFields(body: Record<string, unknown>): FudabaOfficeFields {
    const accent = text(body.accent, 'accent', 7, true).toLowerCase();
    if (!/^#[0-9a-f]{6}$/.test(accent)) throw badRequest('accent 无效');
    if (typeof body.isOpen !== 'boolean') throw badRequest('isOpen 必须是布尔值');
    return {
        name: text(body.name, 'name', 80, true),
        intro: text(body.intro, 'intro', 2000, false),
        city: text(body.city, 'city', 100, true),
        address: text(body.address, 'address', 240, true),
        latitude: coordinate(body.latitude, 'latitude', -90, 90),
        longitude: coordinate(body.longitude, 'longitude', -180, 180),
        accent,
        isOpen: body.isOpen,
        seriesCodes: seriesCodes(body.seriesCodes)
    };
}

export function parseFudabaOfficeCreate(value: unknown): FudabaOfficeFields {
    const body = object(value);
    exactKeys(body, OFFICE_FIELDS);
    return officeFields(body);
}

export function parseFudabaOfficeUpdate(value: unknown): FudabaOfficeUpdate {
    const body = object(value);
    exactKeys(body, [...OFFICE_FIELDS, 'expectedRevision']);
    return {
        ...officeFields(body),
        expectedRevision: parseFudabaRevision(body.expectedRevision)
    };
}

export function parseFudabaOfficeRevision(value: unknown): number {
    const body = object(value);
    exactKeys(body, ['expectedRevision']);
    return parseFudabaRevision(body.expectedRevision);
}

export function fudabaMutationIdempotencyKey(request: Request): string {
    if (!request.headers.has('Idempotency-Key')) {
        throw badRequest('Idempotency-Key 必填');
    }
    const key = request.headers.get('Idempotency-Key') ?? '';
    if (
        !key || key !== key.trim() || key.length > 200 ||
        /[\u0000-\u001f\u007f]/.test(key)
    ) {
        throw badRequest('Idempotency-Key 无效');
    }
    return key;
}
