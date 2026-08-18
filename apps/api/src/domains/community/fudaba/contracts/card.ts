import type { FudabaCardRecord } from '@/ports/repositories';

function badRequest(message: string): Error {
    return Object.assign(new Error(message), { status: 400 });
}

export function validFudabaCardId(value: string): boolean {
    return value.length >= 1 && value.length <= 128 &&
        !/[\u0000-\u001f\u007f/\\]/.test(value);
}

export function parseFudabaRevision(value: unknown): number {
    const revision = typeof value === 'string' && /^\d+$/.test(value)
        ? Number(value)
        : value;
    if (!Number.isSafeInteger(revision) || Number(revision) < 0) {
        throw badRequest('expectedRevision 必须是非负整数');
    }
    return Number(revision);
}

export function fudabaOwnerCardView(card: FudabaCardRecord): Record<string, unknown> {
    return {
        id: card.id,
        producerName: card.producer_name,
        displayName: card.display_name,
        seriesCode: card.series_code,
        favoriteIdol: card.favorite_idol,
        favoriteIdols: card.favorite_idols.map(idolView),
        frontImageUrl: `/api/community/exchange/me/cards/${encodeURIComponent(card.id)}/media/front?v=${card.revision}`,
        backImageUrl: `/api/community/exchange/me/cards/${encodeURIComponent(card.id)}/media/back?v=${card.revision}`,
        accent: card.accent,
        bio: card.bio,
        tradeNote: card.trade_note,
        available: card.available,
        mediaRightsStatus: card.media_rights_status,
        publicationStatus: card.publication_status,
        revision: card.revision,
        createdAt: card.created_at,
        updatedAt: card.updated_at
    };
}

function idolView(
    idol: FudabaCardRecord['favorite_idols'][number]
): Record<string, unknown> {
    return {
        id: idol.idol_id,
        name: idol.name_cn,
        seriesCode: idol.agency_code
    };
}
