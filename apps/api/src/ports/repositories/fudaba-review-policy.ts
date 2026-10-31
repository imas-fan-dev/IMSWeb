import type { FudabaPendingCardPayload } from '@/ports/repositories/fudaba';

/**
 * Card fields an owner may change without sending the card back to review.
 *
 * When a new field qualifies, add it here **and** write it in the review-exempt
 * branch of `updateCardMetadataForOwner` (`SqlFudabaRepository`); everything that
 * is not listed here is treated as content and needs a reviewer.
 *
 * Only put fields here that are safe to publish immediately: visibility flags,
 * exchange preferences, contact channels. Anything a visitor reads as the card's
 * content belongs in the reviewed set.
 */
export const CARD_REVIEW_EXEMPT_FIELDS = ['available'] as const;

export type CardReviewExemptField = (typeof CARD_REVIEW_EXEMPT_FIELDS)[number];

/**
 * Payload fields that decide whether the submission needs a reviewer. Keep this
 * in sync with the comparisons in `requiresCardReview`: the coverage assertion
 * below fails to compile while a payload field is neither compared nor listed in
 * `CARD_REVIEW_EXEMPT_FIELDS`.
 */
const CARD_REVIEWED_FIELDS = [
    'display_name',
    'producer_name',
    'series_code',
    'favorite_character',
    'favorite_character_ids',
    'accent',
    'bio',
    'trade_note'
] as const satisfies readonly Exclude<keyof FudabaPendingCardPayload, CardReviewExemptField>[];

type MissingReviewedField = Exclude<
    Exclude<keyof FudabaPendingCardPayload, CardReviewExemptField>,
    (typeof CARD_REVIEWED_FIELDS)[number]
>;

// Compile-time guard: a new payload field must be compared or declared exempt.
const CARD_REVIEW_FIELDS_COVERED: MissingReviewedField extends never ? true : MissingReviewedField = true;
void CARD_REVIEW_FIELDS_COVERED;

/** The live (already approved) values a submitted edit is compared against. */
export interface CardReviewSnapshot {
    displayName: string | null;
    producerName: string | null;
    seriesCode: string | null;
    favoriteCharacter: string | null;
    favoriteCharacterIds: readonly number[];
    accent: string | null;
    bio: string | null;
    tradeNote: string | null;
}

function text(value: string | null | undefined): string {
    return (value ?? '').trim();
}

function sameIds(left: readonly number[], right: readonly number[]): boolean {
    if (left.length !== right.length) return false;
    const sorted = [...left].sort((a, b) => a - b);
    const other = [...right].sort((a, b) => a - b);
    return sorted.every((value, index) => value === other[index]);
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
    if (text(current.displayName) !== text(next.display_name)) return true;
    if (text(current.producerName) !== text(next.producer_name)) return true;
    if (text(current.seriesCode) !== text(next.series_code)) return true;
    if (text(current.favoriteCharacter) !== text(next.favorite_character)) return true;
    if (text(current.accent) !== text(next.accent)) return true;
    if (text(current.bio) !== text(next.bio)) return true;
    if (text(current.tradeNote) !== text(next.trade_note)) return true;
    return !sameIds(current.favoriteCharacterIds, next.favorite_character_ids ?? []);
}

export const fudabaReviewPolicy: FudabaReviewPolicy = { requiresCardReview };
