import {
    NAMECARD_FAVORITE_CHARACTER_LIMIT,
    NAMECARD_MIDDLE_IMAGE_LIMIT,
    NAMECARD_SERIES_LIMIT
} from '@imsweb/contracts/fudaba/runtime';
import {
    NAMECARD_TAG_LIMIT,
    NAMECARD_TAG_MAX_LENGTH
} from '@imsweb/contracts/namecards/runtime';
import { validFudabaCardId } from '@/domains/community/fudaba/contracts/card';

export interface CardClaimPayloadInput {
    favoriteCharacterIds?: number[];
    groupName?: string | null;
    /** 团体标记：认领/补充时可以提出把这张无主卡标成团体名片。 */
    isGroupCard?: boolean;
    madeOn?: string | null;
    producerName?: string;
    producerReading?: string | null;
    /** 审核通过后再执行的旋转：正反面，以及按页序排列的中间页。 */
    rotations?: { front?: number; back?: number; middles?: number[] };
    seriesCodes?: string[];
}

/** The four fields a visitor without the card may correct. */
export type CardSupplementPayloadInput = Omit<
    CardClaimPayloadInput,
    'madeOn' | 'producerReading'
>;

/** 表单里的标签与审核载荷分开：标签即时生效，不进 pending payload。 */
export interface ParsedClaimPayload<Payload> {
    payload: Payload;
    tags?: string[];
}

export interface LegacyCardClaimInput {
    message: string;
    payload: CardClaimPayloadInput;
    targetCardId: string | null;
    /** 表单标签；即时生效，不写进认领 payload。 */
    tags?: string[];
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

function allowedKeys(value: Record<string, unknown>, allowed: readonly string[]): void {
    const expected = new Set(allowed);
    if (Object.keys(value).some((key) => !expected.has(key))) {
        throw badRequest('请求体包含未知字段');
    }
}

function text(value: unknown, name: string, maximum: number): string {
    if (typeof value !== 'string') throw badRequest(`${name} 必须是字符串`);
    const normalized = value.trim();
    if (normalized.length > maximum || /[\u0000-\u001f\u007f]/.test(normalized)) {
        throw badRequest(`${name} 长度或内容无效`);
    }
    return normalized;
}

function characterIds(value: unknown): number[] {
    if (
        !Array.isArray(value) || value.length > NAMECARD_FAVORITE_CHARACTER_LIMIT ||
        value.some((id) => !Number.isSafeInteger(id) || Number(id) <= 0) ||
        new Set(value).size !== value.length
    ) {
        throw badRequest('favoriteCharacterIds 无效');
    }
    return value.map(Number);
}

function seriesCodes(value: unknown): string[] {
    if (!Array.isArray(value) || value.length < 1 || value.length > NAMECARD_SERIES_LIMIT) {
        throw badRequest('seriesCodes 无效');
    }
    const codes = value.map((entry) => {
        if (typeof entry !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry) || entry.length > 64) {
            throw badRequest('seriesCodes 无效');
        }
        return entry;
    });
    if (new Set(codes).size !== codes.length) throw badRequest('seriesCodes 不能重复');
    return codes;
}

/** A blank string clears the field, so it has to survive as `null`. */
function optionalNullableText(
    value: unknown,
    name: string,
    maximum: number,
    pattern?: RegExp
): string | null {
    if (value === null) return null;
    const normalized = text(value, name, maximum);
    if (!normalized) return null;
    if (pattern && !pattern.test(normalized)) throw badRequest(`${name} 无效`);
    return normalized;
}

const PRODUCER_READING_PATTERN = /^[ぁ-ゖァ-ヺーA-Za-z '-]+$/;
const PRODUCTION_DATE_PATTERN = /^\d{4}(-\d{2}(-\d{2})?)?$/;

/** 表单标签是纯字符串数组；归一化与去重留给标签仓储。 */
function tagNames(value: unknown): string[] {
    if (!Array.isArray(value) || value.length > NAMECARD_TAG_LIMIT) {
        throw badRequest('tags 无效');
    }
    return value.map((entry) => {
        if (typeof entry !== 'string') throw badRequest('tags 无效');
        const name = entry.trim();
        if (name === '' || name.length > NAMECARD_TAG_MAX_LENGTH) {
            throw badRequest('tags 无效');
        }
        return name;
    });
}

/**
 * The wall sends only what the visitor changed. An empty payload would be a
 * revision with nothing in it, which the reviewer could not act on.
 */
function claimPayload(
    value: unknown,
    allowed: readonly string[],
    /** Binding to an existing card sends nothing: that card's data wins. */
    optional = false
): ParsedClaimPayload<CardClaimPayloadInput> {
    const empty = { payload: {} as CardClaimPayloadInput };
    if (value === undefined && optional) return empty;
    const payload = object(value);
    allowedKeys(payload, allowed);
    const contentKeys = Object.keys(payload).filter((key) => key !== 'tags');
    if (contentKeys.length === 0) {
        if (optional) {
            return { payload: {} };
        }
        // 只改标签时由独立标签端点处理；补充/认领必须带上一处资料改动。
        throw badRequest('至少要改动一处资料');
    }
    const parsed: CardClaimPayloadInput = {};
    if ('isGroupCard' in payload) {
        if (typeof payload.isGroupCard !== 'boolean') {
            throw badRequest('isGroupCard 必须是布尔值');
        }
        parsed.isGroupCard = payload.isGroupCard;
    }
    if ('producerName' in payload) {
        const name = text(payload.producerName, 'producerName', 80);
        if (!name) throw badRequest('producerName 不能为空');
        parsed.producerName = name;
    }
    if ('producerReading' in payload) {
        parsed.producerReading = optionalNullableText(
            payload.producerReading,
            'producerReading',
            80,
            PRODUCER_READING_PATTERN
        );
    }
    if ('groupName' in payload) {
        parsed.groupName = optionalNullableText(payload.groupName, 'groupName', 80);
    }
    if ('madeOn' in payload) {
        parsed.madeOn = optionalNullableText(
            payload.madeOn,
            'madeOn',
            10,
            PRODUCTION_DATE_PATTERN
        );
    }
    if ('rotations' in payload) {
        const rotations = object(payload.rotations);
        allowedKeys(rotations, ['front', 'back', 'middles']);
        const turns = (value: unknown): number | undefined => {
            if (value === undefined) return undefined;
            if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 3) {
                throw badRequest('rotations 必须是 0-3 的整数');
            }
            return value;
        };
        /** 中间页是数组元素，不允许缺项，所以这里不接受 undefined。 */
        const middleTurns = (value: unknown): number => {
            const turn = turns(value);
            if (turn === undefined) throw badRequest('中间页旋转格式无效');
            return turn;
        };
        // 中间页按页序排列，与卡片 1..n-2 的槽位一一对应。
        const held = rotations.middles;
        if (
            held !== undefined &&
            (!Array.isArray(held) || held.length > NAMECARD_MIDDLE_IMAGE_LIMIT)
        ) {
            throw badRequest('中间页旋转格式无效');
        }
        const middles: number[] | undefined = Array.isArray(held)
            ? held.map((value: unknown) => middleTurns(value))
            : undefined;
        parsed.rotations = {
            front: turns(rotations.front),
            back: turns(rotations.back),
            ...(middles === undefined ? {} : { middles })
        };
    }
    if ('seriesCodes' in payload) parsed.seriesCodes = seriesCodes(payload.seriesCodes);
    if ('favoriteCharacterIds' in payload) {
        parsed.favoriteCharacterIds = characterIds(payload.favoriteCharacterIds);
    }
    return {
        payload: parsed,
        ...('tags' in payload ? { tags: tagNames(payload.tags) } : {})
    };
}

const CLAIM_PAYLOAD_KEYS = [
    'isGroupCard',
    'rotations',
    'producerName',
    'producerReading',
    'groupName',
    'madeOn',
    'seriesCodes',
    'favoriteCharacterIds',
    'tags',
] as const;
const SUPPLEMENT_PAYLOAD_KEYS = [
    'isGroupCard',
    'rotations',
    'producerName',
    'groupName',
    'seriesCodes',
    'favoriteCharacterIds',
    'tags',
] as const;

export function parseCardSupplementPayload(
    value: unknown
): ParsedClaimPayload<CardSupplementPayloadInput> {
    return claimPayload(value, SUPPLEMENT_PAYLOAD_KEYS);
}

export function parseLegacyCardClaim(value: unknown): LegacyCardClaimInput {
    const body = object(value);
    allowedKeys(body, ['targetCardId', 'payload', 'message']);
    const targetCardId = body.targetCardId;
    if (
        targetCardId !== null &&
        (typeof targetCardId !== 'string' || !validFudabaCardId(targetCardId))
    ) {
        throw badRequest('targetCardId 无效');
    }
    const parsed = claimPayload(body.payload, CLAIM_PAYLOAD_KEYS, true);
    return {
        targetCardId,
        // 认领不要求相对 live 有改动（可能已被他人补充完整），必填缺失由仓储拦。
        payload: parsed.payload,
        ...(parsed.tags === undefined ? {} : { tags: parsed.tags }),
        message: text(body.message, 'message', 1000)
    };
}

export function parseLegacyCardId(value: string): number {
    if (!/^[1-9]\d*$/.test(value)) throw badRequest('旧名片 ID 无效');
    const id = Number(value);
    if (!Number.isSafeInteger(id)) throw badRequest('旧名片 ID 无效');
    return id;
}
