import type {
    CardFavoriteSelectionRecord,
    FudabaCardCredit,
    FudabaCardPageWrite,
    NamecardFeedbackReason
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
    credits?: FudabaCardCredit[];
}

export interface NamecardDiffSide {
    producerName: string | null;
    producerReading: string | null;
    groupName: string | null;
    /** 省略即保持当前值；只有显式传布尔才改变团体标记。 */
    isGroupCard?: boolean;
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
    /** 省略即保持当前值；只有显式传布尔才改变团体标记。 */
    isGroupCard?: boolean;
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
    /** Backoffice operator, stored on the audit rows this edit produces. */
    actor?: string | null;
    /** Omitted keeps the current owner, `null` removes it. */
    ownerAccountId?: string | null;
    status: NamecardLifecycleStatus;
    reviewStatus: 'pending' | 'rejected' | 'locked' | null;
    content: NamecardAdminContent;
    /** `#<index>` tokens over the current live pages, in their new order. */
    mediaOrder: readonly string[];
    /** 旋转后的新对象键；给定后覆盖对应位置的旧键（后台旋转即时生效）。 */
    nextFrontObjectKey?: string;
    nextBackObjectKey?: string | null;
    /** 旋转写出的页面（对象已落盘），用于同步统一布局的页面行。 */
    pages?: FudabaCardPageWrite[];
    /** Version-status-only update: ignore content/media/owner fields. */
    versionOnly?: boolean;
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
    /** The queued revision has to be resolved in the review queue first. */
    | { status: 'blocked'; message: string }
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
    /** 团体名片：制作人名称为空时由团体名称派生。 */
    is_group_card?: boolean;
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

/** Filters shared by both audit tables. */
export interface NamecardAuditFilter {
    /** Owner display name or account id. */
    owner: string | null;
    /** Backoffice username that handled the record. */
    handler: string | null;
    page: number;
    pageSize: number;
}

/** Every lock decision is kept, so the table filters by the action too. */
export type NamecardLockAuditAction = 'locked' | 'unlocked' | 'flagged';

export interface NamecardLockAuditFilter extends NamecardAuditFilter {
    reason: string | null;
    action: NamecardLockAuditAction | null;
}

export interface NamecardFeedbackAuditFilter extends NamecardAuditFilter {
    /** Reporter display name or account id. */
    reporter: string | null;
    outcome: 'accepted' | 'rejected' | null;
}

export interface NamecardLockAuditRecord {
    id: number;
    cardNumber: number;
    producerName: string | null;
    ownerAccountId: string | null;
    ownerName: string | null;
    action: NamecardLockAuditAction;
    /** The lock reason; an unlock entry carries whatever the operator typed. */
    reason: string | null;
    handledBy: string | null;
    occurredAt: string;
}

export interface NamecardFeedbackAuditRecord {
    id: number;
    cardNumber: number;
    producerName: string | null;
    ownerAccountId: string | null;
    ownerName: string | null;
    reporterAccountId: string;
    reporterName: string;
    reason: NamecardFeedbackReason;
    outcome: 'accepted' | 'rejected';
    handledBy: string | null;
    handledAt: string | null;
}

/** One page plus the lifetime totals the tables annotate names with. */
export interface NamecardLockAuditPage {
    rows: NamecardLockAuditRecord[];
    total: number;
    ownerTotals: Record<string, number>;
}

export interface NamecardFeedbackAuditPage {
    rows: NamecardFeedbackAuditRecord[];
    total: number;
    ownerTotals: Record<string, number>;
    reporterTotals: Record<string, number>;
}

export interface PublicProfileRecord {
    uid: number;
    page_slug: string | null;
    account_id: string;
    display_name: string;
    avatar_object_key: string | null;
    avatar_external_url: string | null;
    home_city: string | null;
    bio: string;
    updated_at: number;
}

export interface PlatformAccountLinkRecord {
    kind_id: string;
    name: string;
    group_key: "game" | "social" | "showcase" | "link" | "game-platform";
    value: string;
    username: string | null;
    base_url: string | null;
    color: string | null;
    icon: string | null;
    icon_object_key: string | null;
}

/** The catalogue row the backoffice edits. */
export interface PlatformAccountKindRecord {
    id: string;
    name: string;
    group_key: "game" | "social" | "link";
    pattern: string;
    base_url: string | null;
    color: string | null;
    icon: string | null;
    display_order: number;
    enabled: boolean;
    /** Game handles are stored in capitals. */
    uppercase: boolean;
    /** Uploaded mark; null means fall back to the bundled/CDN icon. */
    icon_object_key: string | null;
    /** Bumped on every edit so the icon URL can be cache-busted. */
    updated_at: string;
}

export interface PlatformAccountEntryRecord {
    kind_id: string;
    value: string;
    username: string | null;
}

export interface NamecardAdminFilter {
    query: string | null;
    status: string | null;
    origins: string[];
}

/** 交换入口：单卡分享、从墙上发起、快速交换页、扫码。 */
export type NamecardExchangeSourceRecord =
    | 'card-share'
    | 'card-request'
    | 'quick'
    | 'scan';

export type NamecardExchangeStatusRecord =
    | 'pending'
    | 'completed'
    | 'declined'
    | 'expired';

export type NamecardExchangeSkipReasonRecord =
    | 'already-owned'
    | 'owned-by-target'
    | 'unavailable';

/** 某张名片没能参与交换的原因；整次交换仍然可以成功。 */
export interface NamecardExchangeSkipRecord {
    cardNumber: number;
    side: 'target' | 'initiator';
    reason: NamecardExchangeSkipReasonRecord;
}

export interface NamecardExchangeRecord {
    id: string;
    client_exchange_id: string;
    source: NamecardExchangeSourceRecord;
    status: NamecardExchangeStatusRecord;
    initiator_account_id: string;
    target_account_id: string;
    target_card_numbers: number[];
    initiator_card_numbers: number[];
    skipped: NamecardExchangeSkipRecord[];
    created_at: string | Date;
    resolved_at: string | Date | null;
}

/**
 * 名片册里留存的那份只读投影。原卡还在时前端读实时投影，原卡删除后只剩它，
 * 所以字段与公开名片保持一致，只是不带认领与互动状态。
 */
export interface NamecardCollectionSnapshotRecord {
    producerName: string | null;
    producerReading: string | null;
    groupName: string | null;
    madeOn: string | null;
    bio: string | null;
    tradeNote: string | null;
    isOriginal: boolean;
    madeWithAi: boolean;
    exchangeMode: 'auto' | 'manual' | 'none';
    accent: string | null;
    seriesCodes: string[];
    credits: FudabaCardCredit[];
}

export interface NamecardCollectionEntryRecord {
    card_number: number;
    obtained_at: string | Date;
    hidden_at: string | Date | null;
    /** 原卡仍在时带实时投影，否则为 null。 */
    card: NamecardPublicRecord | null;
    snapshot: NamecardCollectionSnapshotRecord;
}

export interface NamecardExchangeCommitInput {
    id: string;
    clientExchangeId: string;
    source: NamecardExchangeSourceRecord;
    initiatorAccountId: string;
    targetAccountId: string;
    targetCardNumbers: number[];
    giveCardNumbers: number[];
    /** 扫码交换在提交时一并消费二维码。 */
    scanSessionId: string | null;
    at: string;
}

export interface NamecardExchangeCommitResult {
    exchange: NamecardExchangeRecord;
    /** 同一次 `clientExchangeId` 的重复提交。 */
    idempotent: boolean;
    targetMissingCount: number;
}

export type NamecardExchangeDecisionRecord =
    | { status: 'completed' | 'declined' }
    | { status: 'not-found' }
    | { status: 'expired' };

export interface NamecardScanSessionRecord {
    id: string;
    account_id: string;
    card_numbers: number[];
    expires_at: string | Date;
    consumed_at: string | Date | null;
}

export interface NamecardRepository {
    findCardByOrderedHashes(
        hash1: string,
        hash2: string,
    ): Promise<{ id: number } | null>;
    insertPendingCard(input: PendingCardInput): Promise<number>;
    countApprovedCards(): Promise<number>;
    /** Someone's public page: their profile row, or null when they are gone. */
    /** Resolves by uid, vanity slug, or the account id older links carry. */
    findPublicProfile(handle: string): Promise<PublicProfileRecord | null>;
    /** Enabled platform handles this account published, in catalogue order. */
    listPlatformAccountLinks(accountId: string): Promise<PlatformAccountLinkRecord[]>;
    listPlatformAccountKinds(): Promise<PlatformAccountKindRecord[]>;
    /** The backoffice owns the catalogue; creating and editing share one call. */
    upsertPlatformAccountKind(input: PlatformAccountKindRecord): Promise<void>;
    deletePlatformAccountKind(id: string): Promise<boolean>;
    /** Replaces the uploaded mark; null clears it. */
    setPlatformAccountKindIcon(id: string, key: string | null): Promise<boolean>;
    listPlatformAccountEntries(accountId: string): Promise<PlatformAccountEntryRecord[]>;
    upsertPlatformAccountEntry(input: {
        accountId: string;
        kindId: string;
        value: string;
        username?: string | null;
        at: string;
    }): Promise<void>;
    deletePlatformAccountEntry(accountId: string, kindId: string): Promise<number>;
    countOwnedPublishedCards(accountId: string): Promise<number>;
    listOwnedPublishedCards(
        accountId: string,
        limit: number,
        offset: number,
    ): Promise<NamecardPublicRecord[]>;
    /* ---- 名片册与交换（docs/architecture/namecard-exchange.md） ---- */
    /** 幂等锚点：同一次提交重试时先查这里。 */
    findExchangeByClientId(
        clientExchangeId: string,
    ): Promise<NamecardExchangeRecord | null>;
    /** 一次交换的全部落库动作在同一个事务里完成。 */
    commitExchange(
        input: NamecardExchangeCommitInput,
    ): Promise<NamecardExchangeCommitResult>;
    decideExchange(input: {
        exchangeId: string;
        accountId: string;
        decision: 'accept' | 'decline';
        at: string;
    }): Promise<NamecardExchangeDecisionRecord>;
    listExchanges(input: {
        accountId: string;
        limit: number;
        offset: number;
    }): Promise<{ rows: NamecardExchangeRecord[]; total: number }>;
    listCollection(input: {
        accountId: string;
        limit: number;
        offset: number;
    }): Promise<{ rows: NamecardCollectionEntryRecord[]; total: number }>;
    /** 隐藏或恢复名片册里的一条；false 表示这一条不存在。 */
    setCollectionHidden(input: {
        accountId: string;
        cardNumber: number;
        hidden: boolean;
        at: string;
    }): Promise<boolean>;
    /** 我有、仍可交换、且对方名片册里还没有的张数。 */
    countMissingCollectionCards(input: {
        /** 名片属于谁。 */
        cardOwnerId: string;
        /** 已经收着这些名片的另一方。 */
        otherAccountId: string;
    }): Promise<number>;
    /** 快速交换清单：只有持有者勾选的卡，读取时再过滤一次可用性。 */
    listQuickExchangeCards(accountId: string): Promise<NamecardPublicRecord[]>;
    replaceQuickExchangeCards(input: {
        accountId: string;
        cardNumbers: number[];
    }): Promise<void>;
    /** 选卡界面需要的全部可交换名片，带 `selected` 标记由调用方合并。 */
    listExchangeCandidates(accountId: string): Promise<NamecardPublicRecord[]>;
    /** 固定不变的分享短链；卡片没有短链时补一条。 */
    ensureExchangeLink(cardId: string): Promise<string>;
    findCardByExchangeSlug(slug: string): Promise<NamecardPublicRecord | null>;
    /** 快速交换页：按 uid、主页路径或账号 ID 找到对方与他的可交换名片。 */
    findExchangeTarget(handle: string): Promise<{
        profile: PublicProfileRecord;
        cards: NamecardPublicRecord[];
    } | null>;
    createScanSession(input: {
        id: string;
        tokenHash: string;
        accountId: string;
        cardNumbers: number[];
        expiresAt: string;
    }): Promise<void>;
    findScanSession(tokenHash: string): Promise<NamecardScanSessionRecord | null>;

    countAdminCards(filter?: NamecardAdminFilter): Promise<number>;
    listApprovedCards(
        limit: number,
        offset: number,
    ): Promise<NamecardPublicRecord[]>;
    /** One published card by its wall number, with the same projection the list uses. */
    findApprovedCard(cardNumber: number): Promise<NamecardPublicRecord | null>;
    findCardDiff(cardNumber: number): Promise<NamecardDiffRecord | null>;
    /** 管理窗编辑的那一套页面（有待审图时取待审那套）的对象键。 */
    findAdminCardArtwork(cardNumber: number): Promise<{
        cardId: string;
        staged: boolean;
        frontObjectKey: string;
        backObjectKey: string | null;
        middleObjectKeys: string[];
    } | null>;
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
    /** 统一布局下某一面（live 队列）的对象 key；未迁移的卡返回 null。 */
    findPublishedCardPageKey(
        cardNumber: number,
        pageId: string
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
    findCardMedia(id: number): Promise<CardMediaRecord | null>;
    /**
     * Backoffice moderation state: the card leaves every public surface but
     * keeps its row and media so the decision can be revisited.
     */
    lockCard(
        id: number,
        expectedRevision: number,
        reason: string,
        actor?: string | null,
    ): Promise<NamecardMutationResult>;
    /**
     * Backoffice management: rewrites the live card, its owner and both review
     * columns in one transaction, and tells the owner what changed.
     */
    updateCardAsAdmin(input: NamecardAdminUpdateInput): Promise<NamecardAdminUpdateResult>;
    /** Every card that is locked right now, newest decision first. */
    listNamecardLockAudit(filter: NamecardLockAuditFilter): Promise<NamecardLockAuditPage>;
    /** Every report that already has a verdict, newest verdict first. */
    listNamecardFeedbackAudit(
        filter: NamecardFeedbackAuditFilter
    ): Promise<NamecardFeedbackAuditPage>;
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
        actor?: string | null,
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
    ): Promise<Array<{ id: number; objectKeys: string[] }>>;
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
    resubmitSubmission(
        id: number,
        tokenHash: string,
        expectedRevision: number,
    ): Promise<NamecardEditResult>;
}

export interface ReactionRepository {
    findApprovedCard(id: number): Promise<{ id: number } | null>;
    listReactions(
        cardId: number,
    ): Promise<Array<{ emoji: string; count: number }>>;
    incrementReaction(cardId: number, emoji: string): Promise<void>;
    decrementAndPruneReaction(cardId: number, emoji: string): Promise<void>;
}
