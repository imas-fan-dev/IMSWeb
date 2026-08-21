import { parseFudabaRevision } from '@/domains/community/fudaba/contracts/card';
import type { FudabaLocationReviewState } from '@/ports/repositories';

const DEFAULT_REVIEW_LIMIT = 50;
const MAX_REVIEW_LIMIT = 200;

export interface FudabaLocationReviewSubmission {
    decision: 'publish' | 'reject';
    expectedRevision: number;
    reviewNote: string;
}

export interface CardReviewInput {
    decision: 'approve' | 'reject';
    expectedRevision: number;
    note: string;
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

function allowedKeys(value: Record<string, unknown>, allowed: readonly string[]): void {
    const expected = new Set(allowed);
    if (Object.keys(value).some((key) => !expected.has(key))) {
        throw badRequest('请求体包含未知字段');
    }
}

function validateQueryKeys(
    parameters: URLSearchParams,
    allowed: ReadonlySet<string>
): void {
    for (const key of parameters.keys()) {
        if (!allowed.has(key)) throw badRequest(`Unsupported query parameter: ${key}`);
        if (parameters.getAll(key).length !== 1) {
            throw badRequest(`Query parameter must appear once: ${key}`);
        }
    }
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

function reviewNote(value: unknown): string {
    if (typeof value !== 'string') throw badRequest('note 必须是字符串');
    const note = value.trim();
    if (note.length > 1000 || /[\u0000-\u001f\u007f]/.test(note)) {
        throw badRequest('note 长度或内容无效');
    }
    return note;
}

function searchParameters(url: string): URLSearchParams {
    try {
        return new URL(url).searchParams;
    } catch {
        throw badRequest('Request URL is invalid');
    }
}

export function parseFudabaLocationReviewQuery(url: string): {
    reviewState: FudabaLocationReviewState;
    limit: number;
} {
    const parameters = searchParameters(url);
    validateQueryKeys(parameters, new Set(['state', 'limit']));
    const state = parameters.get('state') ?? 'pending';
    if (!['pending', 'published', 'rejected'].includes(state)) {
        throw badRequest('state must be pending, published, or rejected');
    }
    return {
        reviewState: state as FudabaLocationReviewState,
        limit: positiveLimit(
            parameters.get('limit'),
            DEFAULT_REVIEW_LIMIT,
            MAX_REVIEW_LIMIT
        )
    };
}

export function parseFudabaLocationReview(
    value: unknown
): FudabaLocationReviewSubmission {
    const body = object(value);
    exactKeys(body, ['decision', 'expectedRevision', 'note']);
    if (body.decision !== 'publish' && body.decision !== 'reject') {
        throw badRequest('decision must be publish or reject');
    }
    const note = reviewNote(body.note);
    if (body.decision === 'reject' && !note) {
        throw badRequest('reject 必须填写 note');
    }
    return {
        decision: body.decision,
        expectedRevision: parseFudabaRevision(body.expectedRevision),
        reviewNote: note
    };
}

export function parseCardReview(value: unknown): CardReviewInput {
    const body = object(value);
    allowedKeys(body, ['decision', 'expectedRevision', 'note']);
    if (body.decision !== 'approve' && body.decision !== 'reject') {
        throw badRequest('decision 无效');
    }
    if (!Number.isSafeInteger(body.expectedRevision) || Number(body.expectedRevision) < 0) {
        throw badRequest('expectedRevision 必须是非负整数');
    }
    return {
        decision: body.decision,
        expectedRevision: Number(body.expectedRevision),
        note: reviewNote(body.note)
    };
}
