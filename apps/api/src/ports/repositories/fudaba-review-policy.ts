import type { FudabaPendingCardPayload } from '@/ports/repositories/fudaba';

/**
 * Card fields an owner may change without sending the card back to review.
 *
 * When a new field qualifies, add it here **and** write it in the review-exempt
 * branch of `updateCardMetadataForOwner` (`SqlFudabaRepository`); everything that
 * is not listed here is treated as content and needs a reviewer.
 *
 * The reviewed set is deliberately small: artwork, the producer name, the bio,
 * the originality flag and the exchange note. Everything else — readings,
 * series, characters, credits, dates, flags and visibility — publishes at once.
 */
export const CARD_REVIEW_EXEMPT_FIELDS = [
    'credits',
    'exchange_mode',
    'favorite_character_ids',
    'group_name',
    'made_on',
    'made_with_ai',
    'producer_reading',
    'series_codes',
    'visible'
] as const;

export type CardReviewExemptField = (typeof CARD_REVIEW_EXEMPT_FIELDS)[number];

/** Payload fields that still need a reviewer: the card's visible content. */
type CardReviewField = Exclude<keyof FudabaPendingCardPayload, CardReviewExemptField>;

/** Fields `requiresCardReview` actually compares. */
type ComparedReviewField = 'bio' | 'is_original' | 'producer_name' | 'trade_note';

// Compile-time guard: a new payload field must be compared or declared exempt.
type MissingComparison = Exclude<CardReviewField, ComparedReviewField>;
const CARD_REVIEW_FIELDS_COVERED: MissingComparison extends never ? true : MissingComparison = true;
void CARD_REVIEW_FIELDS_COVERED;

/** The live (already approved) values a submitted edit is compared against. */
export interface CardReviewSnapshot {
    producerName: string | null;
    bio: string | null;
    tradeNote: string | null;
    isOriginal: boolean;
}

function text(value: string | null | undefined): string {
    return (value ?? '').trim();
}

/**
 * `true` when the submitted fields contain a content change, i.e. the card has to
 * go through review. Changes limited to `CARD_REVIEW_EXEMPT_FIELDS` return
 * `false` and are applied to the live row right away.
 */
export interface FudabaReviewPolicy {
    requiresCardReview(
        current: CardReviewSnapshot,
        next: FudabaPendingCardPayload
    ): boolean;
}

function requiresCardReview(
    current: CardReviewSnapshot,
    next: FudabaPendingCardPayload
): boolean {
    if (text(current.producerName) !== text(next.producer_name)) return true;
    if (text(current.bio) !== text(next.bio)) return true;
    if (text(current.tradeNote) !== text(next.trade_note)) return true;
    return current.isOriginal !== next.is_original;
}

export const fudabaReviewPolicy: FudabaReviewPolicy = { requiresCardReview };
