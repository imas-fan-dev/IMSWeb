import type {
    CardIdolSelectionRecord
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
    idolIds?: number[];
    submissionKind?: NamecardSubmissionKind;
}

export interface CardMediaRecord {
    id?: number;
    image1_url: string;
    image2_url: string;
    status?: string;
    revision?: number;
    series_code?: string | null;
    submission_kind?: NamecardSubmissionKind;
    favorite_idols?: CardIdolSelectionRecord[];
    seriesCode?: string | null;
    submissionKind?: NamecardSubmissionKind;
    favoriteIdols?: CardIdolSelectionRecord[];
}

export type NamecardSubmissionStatus =
    | "pending"
    | "approving"
    | "approved"
    | "rejected"
    | "withdrawn";

export interface NamecardSubmissionRecord extends CardMediaRecord {
    id: number;
    status: NamecardSubmissionStatus;
    revision: number;
    series_code?: string | null;
    submission_kind?: NamecardSubmissionKind;
    favorite_idols?: CardIdolSelectionRecord[];
    seriesCode?: string | null;
    submissionKind?: NamecardSubmissionKind;
    favoriteIdols?: CardIdolSelectionRecord[];
    created_at: string | Date | null;
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

export interface NamecardRepository {
    findCardByOrderedHashes(
        hash1: string,
        hash2: string,
    ): Promise<{ id: number } | null>;
    insertPendingCard(input: PendingCardInput): Promise<number>;
    countApprovedCards(): Promise<number>;
    countAdminCards(): Promise<number>;
    listApprovedCards(
        limit: number,
        offset: number,
    ): Promise<NamecardPublicRecord[]>;
    findApprovedCardMedia(id: number): Promise<CardMediaRecord | null>;
    listAdminCards(
        limit: number,
        offset: number,
    ): Promise<NamecardSubmissionRecord[]>;
    beginCardApproval(
        id: number,
        expectedRevision: number,
    ): Promise<NamecardApprovalClaim>;
    completeCardApproval(
        id: number,
        approvingRevision: number,
    ): Promise<NamecardMutationResult>;
    findCardMedia(id: number): Promise<CardMediaRecord | null>;
    deleteCard(
        id: number,
        expectedRevision: number,
    ): Promise<NamecardMutationResult>;
    rejectSubmission(
        id: number,
        expectedRevision: number,
    ): Promise<NamecardMutationResult>;
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
