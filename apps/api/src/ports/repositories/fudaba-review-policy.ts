import type {
    FudabaCardCredit,
    FudabaPendingCardPayload
} from '@/ports/repositories/fudaba';

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
export const CARD_REVIEW_EXEMPT_FIELDS = [
    'exchange_mode',
    'group_name',
    'is_original',
    'made_on',
    'made_with_ai',
    'visible'
] as const;

export type CardReviewExemptField = (typeof CARD_REVIEW_EXEMPT_FIELDS)[number];

/** Payload fields that still need a reviewer: the card's visible content. */
type CardReviewField = Exclude<keyof FudabaPendingCardPayload, CardReviewExemptField>;

/** Fields `requiresCardReview` actually compares. */
type ComparedReviewField =
    | 'bio'
    | 'credits'
    | 'favorite_character_ids'
    | 'producer_name'
    | 'producer_reading'
    | 'series_codes'
    | 'trade_note';

// Compile-time guard: a new payload field must be compared or declared exempt.
type MissingComparison = Exclude<CardReviewField, ComparedReviewField>;
const CARD_REVIEW_FIELDS_COVERED: MissingComparison extends never ? true : MissingComparison = true;
void CARD_REVIEW_FIELDS_COVERED;

/** The live (already approved) values a submitted edit is compared against. */
export interface CardReviewSnapshot {
    producerName: string | null;
    /** Ordered series of the live revision. */
    seriesCodes: readonly string[];
    favoriteCharacterIds: readonly number[];
    bio: string | null;
    tradeNote: string | null;
    madeOn: string | null;
    groupName: string | null;
    producerReading: string | null;
    isOriginal: boolean;
    madeWithAi: boolean;
    visible: boolean;
    credits: readonly FudabaCardCredit[];
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

/** Credits are content: a changed name, link or role needs a reviewer. */
function sameCredits(
    left: readonly FudabaCardCredit[],
    right: readonly FudabaCardCredit[]
): boolean {
    if (left.length !== right.length) return false;
    return left.every((credit, index) => {
        const other = right[index];
        return (
            (credit.accountId ?? null) === (other.accountId ?? null) &&
            text(credit.displayName) === text(other.displayName) &&
            text(credit.url) === text(other.url) &&
            credit.roles.length === other.roles.length &&
            credit.roles.every((role, position) => role === other.roles[position])
        );
    });
}

function sameSet(left: readonly string[], right: readonly string[]): boolean {
    if (left.length !== right.length) return false;
    const sorted = [...right].sort();
    return [...left].sort().every((value, position) => value === sorted[position]);
}

function requiresCardReview(
    current: CardReviewSnapshot,
    next: FudabaPendingCardPayload
): boolean {
    if (text(current.producerName) !== text(next.producer_name)) return true;
    // Reordering the series is a presentation change, not a content change.
    if (!sameSet(current.seriesCodes, next.series_codes)) return true;
    if (text(current.bio) !== text(next.bio)) return true;
    if (text(current.tradeNote) !== text(next.trade_note)) return true;
    if (text(current.producerReading) !== text(next.producer_reading)) return true;
    if (!sameCredits(current.credits ?? [], next.credits ?? [])) return true;
    return !sameIds(current.favoriteCharacterIds, next.favorite_character_ids ?? []);
}

export const fudabaReviewPolicy: FudabaReviewPolicy = { requiresCardReview };
