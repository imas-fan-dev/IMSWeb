import { parseFudabaRevision } from '@/domains/community/fudaba/contracts/card';

export type FudabaCardCreditRole = 'design' | 'illustration' | 'other';

/** One designer / illustrator credited for the artwork. */
export interface FudabaCardCredit {
    accountId: string | null;
    displayName: string;
    url: string | null;
    roles: FudabaCardCreditRole[];
}

export type FudabaExchangeMode = 'auto' | 'manual' | 'none';

export interface FudabaCardFields {
    bio: string;
    credits: FudabaCardCredit[];
    exchangeMode: FudabaExchangeMode;
    favoriteCharacterIds: number[];
    /** 所属团体; absent until the owner fills it in. */
    groupName: string | null;
    producerReading: string | null;
    isOriginal: boolean;
    /** `YYYY` / `YYYY-MM` / `YYYY-MM-DD`; absent when unknown. */
    madeOn: string | null;
    madeWithAi: boolean;
    producerName: string;
    seriesCodes: string[];
    tradeNote: string;
    /** 显示状态: whether other visitors see the card at all. */
    visible: boolean;
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
    'seriesCodes',
    'favoriteCharacterIds',
    'bio',
    'tradeNote',
    'exchangeMode',
    'madeOn',
    'groupName',
    'producerReading',
    'isOriginal',
    'madeWithAi',
    'visible',
    'credits'
] as const;

const EXCHANGE_MODES: readonly FudabaExchangeMode[] = ['auto', 'manual', 'none'];
const CREDIT_ROLES: readonly FudabaCardCreditRole[] = ['design', 'illustration', 'other'];
// The bound is structural, not a list of agencies: the catalogue grows.
const SERIES_LIMIT = 64;
const CREDIT_LIMIT = 8;
const CREDIT_ROLE_LIMIT = 3;
const PRODUCTION_YEAR_MIN = 2002;
const PRODUCTION_YEAR_MAX = 2099;
const PRODUCTION_DATE = /^\d{4}(-\d{2}(-\d{2})?)?$/;
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

function booleanValue(value: unknown, name: string): boolean {
    if (value === true || value === 'true') return true;
    if (value === false || value === 'false') return false;
    throw badRequest(`${name} 必须是布尔值`);
}

/** Missing or blank means the owner did not declare a value. */
function nullableText(value: unknown, name: string, maximum: number): string | null {
    if (value === undefined || value === null || value === '') return null;
    const normalized = text(value, name, maximum);
    return normalized.length > 0 ? normalized : null;
}

/** Producer name reading: the sort key, so kana and Latin letters only. */
const PRODUCER_READING = /^[ぁ-ゖァ-ヺーA-Za-z ]+$/;

function producerReading(value: unknown): string | null {
    const reading = nullableText(value, 'producerReading', 80);
    if (reading === null) return null;
    if (!PRODUCER_READING.test(reading)) {
        throw badRequest('制作人名读法只能使用日文假名与英文字母');
    }
    return reading;
}

function exchangeMode(value: unknown): FudabaExchangeMode {
    const mode = value === undefined ? 'manual' : value;
    if (typeof mode !== 'string' || !EXCHANGE_MODES.includes(mode as FudabaExchangeMode)) {
        throw badRequest('exchangeMode 无效');
    }
    return mode as FudabaExchangeMode;
}

function productionDate(value: unknown): string | null {
    const madeOn = nullableText(value, 'madeOn', 10);
    if (madeOn === null) return null;
    const year = Number(madeOn.slice(0, 4));
    if (
        !PRODUCTION_DATE.test(madeOn) || !Number.isInteger(year) ||
        year < PRODUCTION_YEAR_MIN || year > PRODUCTION_YEAR_MAX
    ) {
        throw badRequest('madeOn 无效');
    }
    return madeOn;
}

function creditRoles(value: unknown): FudabaCardCreditRole[] {
    let parsed = value;
    if (typeof value === 'string') {
        try {
            parsed = JSON.parse(value);
        } catch {
            throw badRequest('credits 无效');
        }
    }
    if (
        !Array.isArray(parsed) || parsed.length < 1 || parsed.length > CREDIT_ROLE_LIMIT ||
        parsed.some((role) => !CREDIT_ROLES.includes(role as FudabaCardCreditRole)) ||
        new Set(parsed).size !== parsed.length
    ) {
        throw badRequest('credits 角色无效');
    }
    return parsed as FudabaCardCreditRole[];
}

function creditUrl(value: unknown): string | null {
    const url = nullableText(value, 'credits.url', 300);
    if (url === null) return null;
    if (!/^https?:\/\/[^\s]+$/.test(url) || /[\u0000-\u001f\u007f]/.test(url)) {
        throw badRequest('credits.url 无效');
    }
    return url;
}

function credits(value: unknown): FudabaCardCredit[] {
    let parsed = value;
    if (typeof value === 'string') {
        try {
            parsed = JSON.parse(value);
        } catch {
            throw badRequest('credits 无效');
        }
    }
    if (parsed === undefined || parsed === null) return [];
    if (!Array.isArray(parsed) || parsed.length > CREDIT_LIMIT) {
        throw badRequest('credits 无效');
    }
    return parsed.map((entry, index) => {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
            throw badRequest(`credits[${index}] 无效`);
        }
        const record = entry as Record<string, unknown>;
        const accountId = nullableText(record.accountId, 'credits.accountId', 64);
        return {
            accountId,
            displayName: text(record.displayName, 'credits.displayName', 80, true),
            url: creditUrl(record.url),
            roles: creditRoles(record.roles)
        };
    });
}

function favoriteCharacterIds(value: unknown): number[] {
    let parsed = value;
    if (typeof value === 'string') {
        try {
            parsed = JSON.parse(value);
        } catch {
            throw badRequest('favoriteCharacterIds 无效');
        }
    }
    if (
        !Array.isArray(parsed) || parsed.length < 1 || parsed.length > 20 ||
        parsed.some((id) => !Number.isSafeInteger(id) || Number(id) <= 0) ||
        new Set(parsed).size !== parsed.length
    ) {
        throw badRequest('favoriteCharacterIds 无效');
    }
    return parsed.map(Number);
}

function seriesCodeList(value: unknown): string[] {
    let parsed: unknown = value;
    if (typeof parsed === 'string') {
        try {
            parsed = JSON.parse(parsed);
        } catch {
            throw badRequest('seriesCodes 无效');
        }
    }
    if (!Array.isArray(parsed)) throw badRequest('seriesCodes 无效');
    const codes = (parsed as unknown[]).map((code) => text(code, 'seriesCodes', 64, true));
    if (
        codes.length === 0 ||
        codes.length > SERIES_LIMIT ||
        new Set(codes).size !== codes.length ||
        codes.some((code) => !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(code))
    ) {
        throw badRequest('seriesCodes 无效');
    }
    return codes;
}

function cardFields(value: Record<string, unknown>): FudabaCardFields {
    const seriesCodes = seriesCodeList(value.seriesCodes);
    return {
        producerName: text(value.producerName, 'producerName', 80, true),
        seriesCodes,
        favoriteCharacterIds: favoriteCharacterIds(value.favoriteCharacterIds),
        bio: text(value.bio, 'bio', 2000),
        tradeNote: text(value.tradeNote, 'tradeNote', 1000),
        exchangeMode: exchangeMode(value.exchangeMode),
        madeOn: productionDate(value.madeOn),
        groupName: nullableText(value.groupName, 'groupName', 80),
        producerReading: producerReading(value.producerReading),
        isOriginal: booleanValue(value.isOriginal ?? false, 'isOriginal'),
        madeWithAi: booleanValue(value.madeWithAi ?? false, 'madeWithAi'),
        visible: booleanValue(value.visible ?? true, 'visible'),
        credits: credits(value.credits)
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
