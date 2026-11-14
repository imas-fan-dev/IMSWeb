import type { CardPageView } from "@/domains/community/fudaba/cards/artwork-view";
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

export function fudabaOwnerCardView(
    card: FudabaCardRecord,
    pages?: readonly CardPageView[],
    pendingPages?: readonly CardPageView[]
): FudabaOwnerCard {
    // 页序就是版面：首页是正面，末页是背面，中间是其余页；单面卡只有正面。
    const livePageCount = pages?.length || card.pages.length;
    return {
        ...(pages && pages.length > 0 ? { pages: [...pages] } : {}),
        ...(pendingPages && pendingPages.length > 0
            ? { pendingPages: [...pendingPages] }
            : {}),
        id: card.id,
        cardNumber: card.card_number,
        producerName: card.producer_name,
        seriesCodes: card.series_codes,
        favoriteCharacters: card.favorite_characters.map(characterView),
        frontImageUrl: cardMediaUrl(card, 'front'),
        backImageUrl: livePageCount > 1 ? cardMediaUrl(card, 'back') : null,
        accent: card.accent,
        bio: card.bio,
        tradeNote: card.trade_note,
        exchangeMode: card.exchange_mode,
        madeOn: card.made_on,
        groupName: card.group_name,
        isGroupCard: card.is_group_card,
        producerReading: card.producer_reading,
        isOriginal: card.is_original,
        madeWithAi: card.made_with_ai,
        visible: card.visible,
        credits: card.credits,
        publicationStatus: card.publication_status,
        reviewStatus: card.review_status,
        reviewReason: card.review_reason,
        reviewSubmittedAt: card.review_submitted_at,
        pendingContent: pendingContentView(card, pendingPages),
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
    card: FudabaCardRecord,
    pendingPages?: readonly CardPageView[]
): FudabaPendingCardContent | null {
    const payload = card.pending_payload;
    if (!payload || card.review_status === null) return null;
    /*
      待审版本自带完整的页面快照；只改文案的修订没有页面行，图与线上一致。
    */
    const submittedPageCount =
        pendingPages?.length || card.pending_pages.length || card.pages.length;
    const mediaUrl = (side: string) => cardMediaUrl(card, side, '&draft=1');
    return {
        producerName: payload.producer_name,
        seriesCodes: payload.series_codes,
        favoriteCharacterIds: payload.favorite_character_ids,
        frontImageUrl: mediaUrl('front'),
        backImageUrl: submittedPageCount > 1 ? mediaUrl('back') : null,
        bio: payload.bio,
        tradeNote: payload.trade_note,
        exchangeMode: payload.exchange_mode,
        madeOn: payload.made_on,
        groupName: payload.group_name,
        isGroupCard: payload.is_group_card,
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
