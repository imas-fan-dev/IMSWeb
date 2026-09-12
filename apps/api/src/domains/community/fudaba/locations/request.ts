import { parseFudabaRevision } from '@/domains/community/fudaba/contracts/card';

export const FUDABA_OWNER_LATITUDE_MIN = -60;
export const FUDABA_OWNER_LATITUDE_MAX = 60;

export interface FudabaOwnerLocationSubmission {
    latitudeE1: number;
    longitudeE1: number;
    expectedRevision: number | null;
}

function badRequest(message: string): Error {
    return Object.assign(new Error(message), { status: 400 });
}

function object(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw badRequest('请求体必须是对象');
    }
    return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): void {
    const actual = Object.keys(value);
    const allowed = new Set(expected);
    if (
        actual.length !== expected.length ||
        actual.some((key) => !allowed.has(key))
    ) {
        throw badRequest('请求体字段无效');
    }
}

function coordinate(value: unknown, name: string, minimum: number, maximum: number): number {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum) {
        throw badRequest(`${name} 必须是有效坐标`);
    }
    return Math.round(value * 10);
}

export function parseFudabaOwnerLocation(
    value: unknown
): FudabaOwnerLocationSubmission {
    const body = object(value);
    exactKeys(body, ['latitude', 'longitude', 'expectedRevision']);
    return {
        latitudeE1: coordinate(
            body.latitude,
            'latitude',
            FUDABA_OWNER_LATITUDE_MIN,
            FUDABA_OWNER_LATITUDE_MAX
        ),
        longitudeE1: coordinate(body.longitude, 'longitude', -180, 180),
        expectedRevision: body.expectedRevision === null
            ? null
            : parseFudabaRevision(body.expectedRevision)
    };
}

export function parseFudabaLocationWithdrawal(value: unknown): number {
    const body = object(value);
    exactKeys(body, ['expectedRevision']);
    return parseFudabaRevision(body.expectedRevision);
}
