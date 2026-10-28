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

const cardMediaUrl = (card: FudabaCardRecord, side: string, query = '') =>
    exchangePath(
        `/me/cards/${encodeURIComponent(card.id)}/media/${side}?v=${card.revision}${query}`
    );

export function fudabaOwnerCardView(card: FudabaCardRecord): FudabaOwnerCard {
    return {
        id: card.id,
        cardNumber: card.card_number,
        producerName: card.producer_name,
        seriesCodes: card.series_codes,
        favoriteCharacters: card.favorite_characters.map(characterView),
        frontImageUrl: cardMediaUrl(card, 'front'),
        middleImageUrls: card.middle_object_keys.map((_key, index) =>
            cardMediaUrl(card, `middle-${index + 1}`)
        ),
        backImageUrl: card.back_object_key === null ? null : cardMediaUrl(card, 'back'),
        accent: card.accent,
        bio: card.bio,
        tradeNote: card.trade_note,
        exchangeMode: card.exchange_mode,
        madeOn: card.made_on,
        groupName: card.group_name,
        producerReading: card.producer_reading,
        isOriginal: card.is_original,
        madeWithAi: card.made_with_ai,
        visible: card.visible,
        credits: card.credits,
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
    const mediaUrl = (side: string) => cardMediaUrl(card, side, '&draft=1');
    return {
        producerName: payload.producer_name,
        seriesCodes: payload.series_codes,
        favoriteCharacterIds: payload.favorite_character_ids,
        frontImageUrl: mediaUrl('front'),
        middleImageUrls: card.pending_middle_object_keys.map((_key, index) =>
            mediaUrl(`middle-${index + 1}`)
        ),
        backImageUrl:
            (card.pending_back_object_key ?? card.back_object_key) === null
                ? null
                : mediaUrl('back'),
        bio: payload.bio,
        tradeNote: payload.trade_note,
        exchangeMode: payload.exchange_mode,
        madeOn: payload.made_on,
        groupName: payload.group_name,
        producerReading: payload.producer_reading,
        isOriginal: payload.is_original,
        madeWithAi: payload.made_with_ai,
        visible: payload.visible,
        credits: payload.credits
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
