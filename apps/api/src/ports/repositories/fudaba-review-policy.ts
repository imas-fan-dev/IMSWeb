import type { FudabaCardCredit, FudabaPendingCardPayload } from '@/ports/repositories/fudaba';

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

/** Every live field a submission is compared against when it may be a no-op. */
export interface CardSubmissionSnapshot {
    producerName: string | null;
    producerReading: string | null;
    bio: string | null;
    tradeNote: string | null;
    groupName: string | null;
    madeOn: string | null;
    exchangeMode: string;
    isOriginal: boolean;
    madeWithAi: boolean;
    visible: boolean;
    seriesCodes: readonly string[];
    favoriteCharacterIds: readonly number[];
    credits: readonly FudabaCardCredit[];
}

/** Ordered artwork keys, front first and the back page last. */
export function sameArtworkOrder(left: readonly string[], right: readonly string[]): boolean {
    return left.length === right.length && left.every((key, index) => key === right[index]);
}

/**
 * `true` when both lists hold exactly the same pages in a different order, i.e.
 * the owner only moved existing artwork around and no page content changed.
 */
export function isArtworkReorder(left: readonly string[], right: readonly string[]): boolean {
    if (left.length !== right.length || sameArtworkOrder(left, right)) return false;
    const counts = new Map<string, number>();
    for (const key of left) counts.set(key, (counts.get(key) ?? 0) + 1);
    for (const key of right) {
        const remaining = counts.get(key);
        if (!remaining) return false;
        counts.set(key, remaining - 1);
    }
    return [...counts.values()].every((remaining) => remaining === 0);
}

function sameList(left: readonly string[], right: readonly string[]): boolean {
    return left.length === right.length && left.every((value, index) => value === right[index]);
}

function sameCredit(left: FudabaCardCredit, right: FudabaCardCredit): boolean {
    return (
        text(left.displayName) === text(right.displayName) &&
        text(left.url ?? null) === text(right.url ?? null) &&
        sameList(left.roles, right.roles)
    );
}

/**
 * `true` when a submission reproduces the approved copy field by field. Owners
 * who reopen the editor and save again — or change their mind while a revision
 * waits — must not queue (or keep) a revision nobody has to review.
 */
export function sameCardSubmission(
    current: CardSubmissionSnapshot,
    next: FudabaPendingCardPayload
): boolean {
    const credits = next.credits ?? [];
    return (
        text(current.producerName) === text(next.producer_name) &&
        text(current.producerReading) === text(next.producer_reading) &&
        text(current.bio) === text(next.bio) &&
        text(current.tradeNote) === text(next.trade_note) &&
        text(current.groupName) === text(next.group_name) &&
        text(current.madeOn) === text(next.made_on) &&
        text(current.exchangeMode) === text(next.exchange_mode) &&
        current.isOriginal === next.is_original &&
        current.madeWithAi === next.made_with_ai &&
        current.visible === next.visible &&
        sameList(current.seriesCodes, next.series_codes ?? []) &&
        sameList(
            current.favoriteCharacterIds.map(String),
            (next.favorite_character_ids ?? []).map(String)
        ) &&
        current.credits.length === credits.length &&
        current.credits.every((credit, index) => sameCredit(credit, credits[index]))
    );
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
