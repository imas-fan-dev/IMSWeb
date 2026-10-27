import { exchangePath } from '@imsweb/contracts/paths';
import type {
    FudabaCharacterSelection,
    FudabaOwnerCard,
    FudabaPendingCardContent
} from '@imsweb/contracts/fudaba';
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

export function fudabaOwnerCardView(card: FudabaCardRecord): FudabaOwnerCard {
    return {
        id: card.id,
        producerName: card.producer_name,
        displayName: card.display_name,
        seriesCode: card.series_code,
        favoriteCharacter: card.favorite_character,
        favoriteCharacters: card.favorite_characters.map(characterView),
        frontImageUrl: exchangePath(`/me/cards/${encodeURIComponent(card.id)}/media/front?v=${card.revision}`),
        backImageUrl: exchangePath(`/me/cards/${encodeURIComponent(card.id)}/media/back?v=${card.revision}`),
        accent: card.accent,
        bio: card.bio,
        tradeNote: card.trade_note,
        available: card.available,
        publicationStatus: card.publication_status,
        reviewStatus: card.review_status,
        reviewReason: card.review_reason,
        reviewSubmittedAt: card.review_submitted_at,
        pendingContent: pendingContentView(card),
        revision: card.revision,
        createdAt: card.created_at,
        updatedAt: card.updated_at
    };
}

/**
 * The submitted revision, when there is one. It is served by the same media
 * route with `draft=1` so it cannot be confused with the live images.
 */
function pendingContentView(
    card: FudabaCardRecord
): FudabaPendingCardContent | null {
    const payload = card.pending_payload;
    if (!payload || card.review_status === null) return null;
    const mediaUrl = (side: 'front' | 'back') =>
        exchangePath(
            `/me/cards/${encodeURIComponent(card.id)}/media/${side}?v=${card.revision}&draft=1`
        );
    return {
        producerName: payload.producer_name,
        displayName: payload.display_name,
        seriesCode: payload.series_code,
        favoriteCharacter: payload.favorite_character,
        favoriteCharacterIds: payload.favorite_character_ids,
        frontImageUrl: mediaUrl('front'),
        backImageUrl: mediaUrl('back'),
        accent: payload.accent,
        bio: payload.bio,
        tradeNote: payload.trade_note,
        available: payload.available
    };
}

function characterView(
    character: FudabaCardRecord['favorite_characters'][number]
): FudabaCharacterSelection {
    return {
        id: character.character_id,
        name: character.name_cn,
        seriesCode: character.agency_code
    };
}
