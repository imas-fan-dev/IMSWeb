import { parseFudabaRevision } from '@/domains/community/fudaba/contracts/card';

export interface FudabaCardFields {
    accent: string;
    available: boolean;
    bio: string;
    displayName: string;
    favoriteIdolIds: number[];
    producerName: string;
    seriesCode: string;
    tradeNote: string;
}

export interface FudabaCardUpdate extends FudabaCardFields {
    expectedRevision: number;
}

export interface FudabaCardPlacementSubmission {
    positionX: number;
    positionY: number;
    rotation: number;
    zIndex: number;
    expectedRevision: number | null;
}

const CARD_FIELDS = [
    'producerName',
    'displayName',
    'seriesCode',
    'favoriteIdolIds',
    'accent',
    'bio',
    'tradeNote',
    'available'
] as const;
const MAX_PLACEMENT_REVISION = 2_147_483_647;

function badRequest(message: string): Error {
    return Object.assign(new Error(message), { status: 400 });
}

function text(
    value: unknown,
    name: string,
    maximum: number,
    required = false
): string {
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

function booleanValue(value: unknown): boolean {
    if (value === true || value === 'true') return true;
    if (value === false || value === 'false') return false;
    throw badRequest('available 必须是布尔值');
}

function favoriteIdolIds(value: unknown): number[] {
    let parsed = value;
    if (typeof value === 'string') {
        try {
            parsed = JSON.parse(value);
        } catch {
            throw badRequest('favoriteIdolIds 无效');
        }
    }
    if (
        !Array.isArray(parsed) || parsed.length < 1 || parsed.length > 20 ||
        parsed.some((id) => !Number.isSafeInteger(id) || Number(id) <= 0) ||
        new Set(parsed).size !== parsed.length
    ) {
        throw badRequest('favoriteIdolIds 无效');
    }
    return parsed.map(Number);
}

function cardFields(value: Record<string, unknown>): FudabaCardFields {
    const seriesCode = text(value.seriesCode, 'seriesCode', 64, true);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(seriesCode)) {
        throw badRequest('seriesCode 无效');
    }
    const accent = text(value.accent, 'accent', 7, true);
    if (!/^#[0-9a-fA-F]{6}$/.test(accent)) throw badRequest('accent 无效');
    return {
        producerName: text(value.producerName, 'producerName', 80, true),
        displayName: text(value.displayName, 'displayName', 120, true),
        seriesCode,
        favoriteIdolIds: favoriteIdolIds(value.favoriteIdolIds),
        accent,
        bio: text(value.bio, 'bio', 2000),
        tradeNote: text(value.tradeNote, 'tradeNote', 1000),
        available: booleanValue(value.available)
    };
}

function object(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw badRequest('请求体必须是对象');
    }
    return value as Record<string, unknown>;
}

function allowedKeys(value: Record<string, unknown>, allowed: readonly string[]): void {
    const expected = new Set(allowed);
    if (Object.keys(value).some((key) => !expected.has(key))) {
        throw badRequest('请求体包含未知字段');
    }
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

function finiteNumber(
    value: unknown,
    name: string,
    minimum: number,
    maximum: number
): number {
    if (
        typeof value !== 'number' || !Number.isFinite(value) ||
        value < minimum || value > maximum
    ) {
        throw badRequest(`${name} 必须是 ${minimum} 到 ${maximum} 之间的数字`);
    }
    return value;
}

function zIndex(value: unknown): number {
    if (
        typeof value !== 'number' || !Number.isSafeInteger(value) ||
        value < 1 || value > 999
    ) {
        throw badRequest('zIndex 必须是 1 到 999 之间的整数');
    }
    return value;
}

function placementRevision(value: unknown): number {
    if (
        typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 ||
        value > MAX_PLACEMENT_REVISION
    ) {
        throw badRequest(
            `expectedRevision 必须是 0 到 ${MAX_PLACEMENT_REVISION} 之间的整数`
        );
    }
    return value;
}

export function parseFudabaCardCreateFields(
    fields: Record<string, string>
): FudabaCardFields {
    allowedKeys(fields, CARD_FIELDS);
    return cardFields(fields);
}

export function parseFudabaCardUpdate(value: unknown): FudabaCardUpdate {
    const body = object(value);
    allowedKeys(body, [...CARD_FIELDS, 'expectedRevision']);
    return {
        ...cardFields(body),
        expectedRevision: parseFudabaRevision(body.expectedRevision)
    };
}

export function parseFudabaDelete(value: unknown): number {
    const body = object(value);
    allowedKeys(body, ['expectedRevision']);
    return parseFudabaRevision(body.expectedRevision);
}

export function parseFudabaCardPlacement(
    value: unknown
): FudabaCardPlacementSubmission {
    const body = object(value);
    exactKeys(body, ['x', 'y', 'rotation', 'zIndex', 'expectedRevision']);
    return {
        positionX: finiteNumber(body.x, 'x', 0, 100),
        positionY: finiteNumber(body.y, 'y', 0, 100),
        rotation: finiteNumber(body.rotation, 'rotation', -12, 12),
        zIndex: zIndex(body.zIndex),
        expectedRevision: body.expectedRevision === null
            ? null
            : placementRevision(body.expectedRevision)
    };
}

export function parseFudabaCardPlacementRemoval(value: unknown): number {
    const body = object(value);
    exactKeys(body, ['expectedRevision']);
    return placementRevision(body.expectedRevision);
}
