import type {
    CardFavoriteSelectionRecord
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
    image2_url: string;
    status?: string;
    revision?: number;
    series_code?: string | null;
    submission_kind?: NamecardSubmissionKind;
    favorite_characters?: CardFavoriteSelectionRecord[];
    seriesCode?: string | null;
    submissionKind?: NamecardSubmissionKind;
    favoriteCharacters?: CardFavoriteSelectionRecord[];
}

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
    ): Promise<Array<{ id: number; image1_url: string; image2_url: string }>>;
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
