import { fudabaOwnerCardView, validFudabaCardId } from '@/domains/fudaba/owner-card';
import type {
    FudabaAdminCardClaimRecord,
    FudabaCardClaimRecord,
    FudabaClaimEnvelopeRecord,
    FudabaRegisteredCardReviewRecord
} from '@/ports/repositories';

interface LegacyCardClaimInput {
    favoriteIdolIds: number[];
    message: string;
    seriesCode: string;
    targetCardId: string | null;
}

interface EnvelopeActionInput {
    decision: 'confirm' | 'decline';
    expectedRevision: number;
}

interface CardReviewInput {
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

function exactKeys(value: Record<string, unknown>, allowed: readonly string[]): void {
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

function revision(value: unknown): number {
    if (!Number.isSafeInteger(value) || Number(value) < 0) {
        throw badRequest('expectedRevision 必须是非负整数');
    }
    return Number(value);
}

function idolIds(value: unknown): number[] {
    if (
        !Array.isArray(value) || value.length < 1 || value.length > 20 ||
        value.some((id) => !Number.isSafeInteger(id) || Number(id) <= 0) ||
        new Set(value).size !== value.length
    ) {
        throw badRequest('favoriteIdolIds 无效');
    }
    return value.map(Number);
}

function seriesCode(value: unknown): string {
    const code = text(value, 'seriesCode', 64);
    if (!code || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(code)) {
        throw badRequest('seriesCode 无效');
    }
    return code;
}

export function parseLegacyCardId(value: string): number {
    if (!/^[1-9]\d*$/.test(value)) throw badRequest('旧名片 ID 无效');
    const id = Number(value);
    if (!Number.isSafeInteger(id)) throw badRequest('旧名片 ID 无效');
    return id;
}

export function parseLegacyCardClaim(value: unknown): LegacyCardClaimInput {
    const body = object(value);
    exactKeys(body, ['targetCardId', 'seriesCode', 'favoriteIdolIds', 'message']);
    const targetCardId = body.targetCardId;
    if (
        targetCardId !== null &&
        (typeof targetCardId !== 'string' || !validFudabaCardId(targetCardId))
    ) {
        throw badRequest('targetCardId 无效');
    }
    return {
        targetCardId,
        seriesCode: seriesCode(body.seriesCode),
        favoriteIdolIds: idolIds(body.favoriteIdolIds),
        message: text(body.message, 'message', 1000)
    };
}

export function parseEnvelopeAction(value: unknown): EnvelopeActionInput {
    const body = object(value);
    exactKeys(body, ['decision', 'expectedRevision']);
    if (body.decision !== 'confirm' && body.decision !== 'decline') {
        throw badRequest('decision 无效');
    }
    return {
        decision: body.decision,
        expectedRevision: revision(body.expectedRevision)
    };
}

export function parseCardReview(value: unknown): CardReviewInput {
    const body = object(value);
    exactKeys(body, ['decision', 'expectedRevision', 'note']);
    if (body.decision !== 'approve' && body.decision !== 'reject') {
        throw badRequest('decision 无效');
    }
    return {
        decision: body.decision,
        expectedRevision: revision(body.expectedRevision),
        note: text(body.note, 'note', 1000)
    };
}

function favoriteIdols(record: FudabaCardClaimRecord) {
    return record.favorite_idols.map((idol) => ({
        id: idol.idol_id,
        name: idol.name_cn,
        seriesCode: idol.agency_code
    }));
}

export function fudabaClaimEnvelopeView(envelope: FudabaClaimEnvelopeRecord) {
    return {
        id: String(envelope.id),
        legacyCardId: envelope.legacy_card_id,
        cardId: String(envelope.legacy_card_id),
        kind: envelope.kind,
        title: envelope.title,
        body: envelope.body,
        actionState: envelope.action_state,
        claimId: envelope.claim_id,
        revision: envelope.revision,
        readAt: envelope.read_at,
        actedAt: envelope.actioned_at,
        createdAt: envelope.created_at
    };
}

export function fudabaCardClaimView(claim: FudabaCardClaimRecord) {
    return {
        id: claim.id,
        legacyCardId: claim.legacy_card_id,
        targetCardId: claim.target_card_id,
        seriesCode: claim.series_code,
        favoriteIdols: favoriteIdols(claim),
        state: claim.state,
        message: claim.message,
        reviewNote: claim.review_note,
        revision: claim.revision,
        createdAt: claim.created_at,
        updatedAt: claim.updated_at,
        reviewedAt: claim.reviewed_at
    };
}

export function fudabaRegisteredCardReviewView(
    card: FudabaRegisteredCardReviewRecord
) {
    const encodedId = encodeURIComponent(card.id);
    return {
        card: {
            ...fudabaOwnerCardView(card),
            frontImageUrl: `/api/admin/community/exchange/card-reviews/${encodedId}/media/front?v=${card.revision}`,
            backImageUrl: `/api/admin/community/exchange/card-reviews/${encodedId}/media/back?v=${card.revision}`
        },
        owner: {
            id: card.owner_account_id,
            displayName: card.owner_display_name
        }
    };
}

export function fudabaAdminCardClaimView(claim: FudabaAdminCardClaimRecord) {
    return {
        ...fudabaCardClaimView(claim),
        claimant: {
            id: claim.claimant_account_id,
            displayName: claim.claimant_display_name
        },
        legacyCard: {
            id: claim.legacy_card_id,
            frontImageUrl: claim.legacy_image1_url,
            backImageUrl: claim.legacy_image2_url
        }
    };
}
