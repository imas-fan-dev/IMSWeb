import type {
    CardFavoriteSelectionRecord,
    FudabaCardCredit
} from '@/ports/repositories/fudaba';

export type NamecardSubmissionKind = 'guest' | 'legacy';

export interface PendingCardInput {
    image1Url: string;
    image2Url: string;
    hash1: string;
    hash2: string;
    ip: string;
    withdrawalTokenHash: string;
    seriesCode?: string | null;
    characterIds?: number[];
    submissionKind?: NamecardSubmissionKind;
    producerName?: string | null;
    displayName?: string | null;
    bio?: string | null;
    accent?: string | null;
}

export interface CardMediaRecord {
    id?: number;
    image1_url: string;
    image2_url: string | null;
    status?: string;
    revision?: number;
    series_code?: string | null;
    submission_kind?: NamecardSubmissionKind;
    favorite_characters?: CardFavoriteSelectionRecord[];
    seriesCode?: string | null;
    submissionKind?: NamecardSubmissionKind;
    favoriteCharacters?: CardFavoriteSelectionRecord[];
    /** Fudaba row id; the public detail deep-links the owner editor with it. */
    cardId?: string;
    card_number?: number;
    producer_name?: string | null;
    producer_reading?: string | null;
    group_name?: string | null;
    made_on?: string | null;
    bio?: string | null;
    trade_note?: string | null;
    is_original?: boolean;
    made_with_ai?: boolean;
    exchange_mode?: 'auto' | 'manual' | 'none';
    accent?: string | null;
    owner_account_id?: string | null;
    series_codes?: string[];
    middle_image_urls?: string[];
    credits?: FudabaCardCredit[];
}

export interface NamecardDiffSide {
    producerName: string | null;
    producerReading: string | null;
    groupName: string | null;
    madeOn: string | null;
    bio: string | null;
    tradeNote: string | null;
    isOriginal: boolean;
    madeWithAi: boolean;
    visible: boolean;
    exchangeMode: 'auto' | 'manual' | 'none';
    seriesCodes: string[];
    credits: FudabaCardCredit[];
    favoriteCharacters: CardFavoriteSelectionRecord[];
    frontImageUrl: string;
    backImageUrl: string | null;
    middleImageUrls: string[];
}

export interface NamecardDiffRecord {
    id: number;
    status: NamecardSubmissionStatus;
    /** The lifecycle column verbatim; `status` is its legacy projection. */
    publicationStatus: NamecardLifecycleStatus;
    reviewStatus: 'pending' | 'rejected' | 'locked' | null;
    revision: number;
    ownerAccountId: string | null;
    ownerDisplayName: string | null;
    lockReason: string | null;
    reviewReason: string | null;
    live: NamecardDiffSide;
    pending: NamecardDiffSide | null;
}

export type NamecardLifecycleStatus =
    | 'draft'
    | 'pending'
    | 'approving'
    | 'published'
    | 'hidden'
    | 'rejected'
    | 'withdrawn'
    | 'locked';

export interface NamecardAdminContent {
    producerName: string;
    producerReading: string | null;
    groupName: string | null;
    madeOn: string | null;
    bio: string;
    tradeNote: string;
    isOriginal: boolean;
    madeWithAi: boolean;
    visible: boolean;
    exchangeMode: 'auto' | 'manual' | 'none';
    seriesCodes: readonly string[];
    favoriteCharacterIds: readonly number[];
    credits: readonly FudabaCardCredit[];
}

export interface NamecardAdminUpdateInput {
    cardNumber: number;
    expectedRevision: number;
    reason: string | null;
    /** Omitted keeps the current owner, `null` removes it. */
    ownerAccountId?: string | null;
    status: NamecardLifecycleStatus;
    reviewStatus: 'pending' | 'rejected' | 'locked' | null;
    content: NamecardAdminContent;
    /** `#<index>` tokens over the current live pages, in their new order. */
    mediaOrder: readonly string[];
    updatedAt: Date;
}

/** One line of the notification sent to the owner after an admin edit. */
export interface NamecardAdminFieldChange {
    label: string;
    before: string | null;
    after: string | null;
}

export type NamecardAdminUpdateResult =
    | {
          status: 'updated';
          revision: number;
          changedFields: NamecardAdminFieldChange[];
          ownerChange: {
              previousAccountId: string | null;
              nextAccountId: string | null;
          } | null;
      }
    | { status: 'conflict'; revision: number }
    | { status: 'not-found' }
    | { status: 'reason-required' }
    | { status: 'invalid-media'; message: string }
    | { status: 'invalid-owner'; message: string };

/** Removal only reports the row; the caller never needs the deleted card. */
export type NamecardAdminDeleteResult =
    | { status: 'updated'; revision: number }
    | { status: 'conflict'; revision: number }
    | { status: 'not-found' };

export type NamecardSubmissionStatus =
    | "pending"
    | "approving"
    | "approved"
    | "rejected"
    | "withdrawn"
    | "hidden"
    | "locked";

export interface NamecardSubmissionRecord extends CardMediaRecord {
    id: number;
    status: NamecardSubmissionStatus;
    revision: number;
    series_code?: string | null;
    submission_kind?: NamecardSubmissionKind;
    favorite_characters?: CardFavoriteSelectionRecord[];
    seriesCode?: string | null;
    submissionKind?: NamecardSubmissionKind;
    favoriteCharacters?: CardFavoriteSelectionRecord[];
    created_at: string | Date | null;
    /** Set while the card is `locked`; cleared by the unlock transition. */
    lockReason?: string | null;
    /** Verdict on the submitted revision, independent of `status`. */
    reviewStatus?: 'pending' | 'rejected' | 'locked' | null;
    reviewReason?: string | null;
}

export interface NamecardPublicRecord extends NamecardSubmissionRecord {
    status: 'approved';
}

export interface NamecardSubmissionWithHashesRecord
    extends NamecardSubmissionRecord {
    hash1: string;
    hash2: string;
}

export type NamecardEditResult =
    | { status: "updated"; card: NamecardSubmissionRecord }
    | { status: "conflict"; revision: number }
    | { status: "not-found" };

export type NamecardApprovalClaim =
    | { status: "claimed" | "resumed"; card: NamecardSubmissionRecord }
    | { status: "conflict"; revision: number }
    | { status: "withdrawn"; revision: number }
    | { status: "not-found" };

export type NamecardMutationResult =
    | { status: "updated"; card: NamecardSubmissionRecord }
    | { status: "conflict"; revision: number }
    | { status: "withdrawn"; revision: number }
    | { status: "not-found" };

export interface NamecardAdminFilter {
    query: string | null;
    status: string | null;
    origins: string[];
}

export interface NamecardRepository {
    findCardByOrderedHashes(
        hash1: string,
        hash2: string,
    ): Promise<{ id: number } | null>;
    insertPendingCard(input: PendingCardInput): Promise<number>;
    countApprovedCards(): Promise<number>;
    countAdminCards(filter?: NamecardAdminFilter): Promise<number>;
    listApprovedCards(
        limit: number,
        offset: number,
    ): Promise<NamecardPublicRecord[]>;
    findApprovedCardMedia(id: number): Promise<CardMediaRecord | null>;
    findCardDiff(cardNumber: number): Promise<NamecardDiffRecord | null>;
    /**
     * Object key backing one artwork page, for the moderator preview. `draft`
     * prefers the submitted revision and falls back to the live object.
     */
    findCardMediaKey(
        cardNumber: number,
        side: string,
        draft: boolean
    ): Promise<string | null>;
    /** The key of a page the public wall is allowed to serve. */
    findPublishedCardMediaKey(
        cardNumber: number,
        side: string
    ): Promise<string | null>;
    listAdminCards(
        limit: number,
        offset: number,
        filter?: NamecardAdminFilter,
    ): Promise<NamecardSubmissionRecord[]>;
    beginCardApproval(
        id: number,
        expectedRevision: number,
    ): Promise<NamecardApprovalClaim>;
    completeCardApproval(
        id: number,
        approvingRevision: number,
    ): Promise<NamecardMutationResult>;
    /** Returns a card to `pending` when approval aborts before completion. */
    /** Rewrites an approved upload's media into the canonical namecard layout. */
    attachCanonicalMedia(
        cardId: string,
        frontObjectKey: string,
        backObjectKey: string
    ): Promise<void>;
    findCardMedia(id: number): Promise<CardMediaRecord | null>;
    /**
     * Backoffice moderation state: the card leaves every public surface but
     * keeps its row and media so the decision can be revisited.
     */
    lockCard(
        id: number,
        expectedRevision: number,
        reason: string,
    ): Promise<NamecardMutationResult>;
    /**
     * Backoffice management: rewrites the live card, its owner and both review
     * columns in one transaction, and tells the owner what changed.
     */
    updateCardAsAdmin(input: NamecardAdminUpdateInput): Promise<NamecardAdminUpdateResult>;
    /**
     * Sets `deleted_at`, which hides the card from every surface and every API.
     * Only a database operator can bring the row back.
     */
    deleteCardAsAdmin(
        cardNumber: number,
        expectedRevision: number,
    ): Promise<NamecardAdminDeleteResult>;
    /** Returns a locked card to `pending` and notifies its owner. */
    unlockCard(
        id: number,
        expectedRevision: number,
    ): Promise<NamecardMutationResult>;
    rejectSubmission(
        id: number,
        expectedRevision: number,
        reason?: string | null,
    ): Promise<NamecardMutationResult>;
    /** Marks a submission as breaking the rules without touching a live card. */
    flagSubmission(
        id: number,
        expectedRevision: number,
        reason: string,
    ): Promise<NamecardMutationResult>;
    listNamecardNotifications(
        recipientAccountId: string,
        limit: number,
    ): Promise<{
        items: Array<{
            id: string;
            kind: string;
            card_number: number | string | null;
            title: string;
            body: string;
            read_at: Date | string | null;
            created_at: Date | string;
        }>;
        unread: number;
    }>;
    markNamecardNotificationsRead(
        recipientAccountId: string,
        ids: readonly string[] | null,
    ): Promise<number>;
    purgeTerminalCards(
        cutoff: Date,
    ): Promise<Array<{ id: number; image1_url: string; image2_url: string | null }>>;
    findSubmissionByTokenHash(
        id: number,
        tokenHash: string,
    ): Promise<NamecardSubmissionRecord | null>;
    withdrawSubmission(
        id: number,
        tokenHash: string,
        expectedRevision: number,
    ): Promise<NamecardMutationResult>;
    findSubmissionWithHashesByTokenHash(
        id: number,
        tokenHash: string,
    ): Promise<NamecardSubmissionWithHashesRecord | null>;
    replaceSubmissionImage(
        id: number,
        tokenHash: string,
        expectedRevision: number,
        side: "front" | "back",
        imageUrl: string,
        hash: string,
    ): Promise<NamecardEditResult>;
    resubmitSubmission(
        id: number,
        tokenHash: string,
        expectedRevision: number,
    ): Promise<NamecardEditResult>;
    findCardByMediaUrl(url: string): Promise<CardMediaRecord | null>;
}

export interface ReactionRepository {
    findApprovedCard(id: number): Promise<{ id: number } | null>;
    listReactions(
        cardId: number,
    ): Promise<Array<{ emoji: string; count: number }>>;
    incrementReaction(cardId: number, emoji: string): Promise<void>;
    decrementAndPruneReaction(cardId: number, emoji: string): Promise<void>;
}
