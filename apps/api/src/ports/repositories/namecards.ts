import type {
    CardFavoriteSelectionRecord,
    FudabaCardCredit,
    FudabaCardPageWrite,
    NamecardFeedbackReason
} from '@/ports/repositories/fudaba';
import type { NamecardTagRecord } from '@/ports/repositories/namecard-tags';

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
    /** 标签即时生效、不进 diff；管理窗单独展示。 */
    tags: NamecardTagRecord[];
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
    /** 标签即时生效；读取侧批量补齐，缺省按空数组处理。 */
    tags?: NamecardTagRecord[];
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
    /** 归属账号：只返回该账号名下的名片；`null` 表示不过滤归属。 */
    ownerAccountId?: string | null;
}

/** 交换入口：单卡分享、从墙上发起、快速交换页、扫码、单向送礼。 */
export type NamecardExchangeSourceRecord =
    | 'card-share'
    | 'card-request'
    | 'quick'
    | 'scan'
    | 'gift';

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
    /** PRD §3.4 的排序键，与名片行上的 `sort_name_key` 同一规则。 */
    sortNameKey: string;
    sortNameBucket: 0 | 1 | 2 | 3;
    groupName: string | null;
    madeOn: string | null;
    bio: string | null;
    tradeNote: string | null;
    isOriginal: boolean;
    madeWithAi: boolean;
    exchangeMode: 'auto' | 'manual' | 'none';
    accent: string | null;
    seriesCodes: string[];
    /** 担当角色目录 id（顺序即名片上的担当顺序）；原卡删除后筛选与「按企划」排序靠它。 */
    favoriteCharacterIds: number[];
    credits: FudabaCardCredit[];
}

export interface NamecardCollectionEntryRecord {
    card_number: number;
    obtained_at: string | Date;
    hidden_at: string | Date | null;
    /** 「我自己的名片」带出的条目：没有交换时间（回退创建时间）与隐藏入口。 */
    own: boolean;
    /**
     * 卡主身份（瓦片底部的制作人名称 → `/user/<uid>`）：已收集条目取原卡卡主，
     * `own` 行取当前用户。账号停用/删除或历史数据缺资料时为 null。
     */
    owner: { account_id: string; uid: string; display_name: string } | null;
    /**
     * 原卡行还在且未被 `locked` 时带实时投影：`published` **与 `hidden`（持有者删卡）都给**，
     * 因为「我收到的那张」不该因为对方下线而消失。卡行被删除（物理删除或后台判删）的条目
     * 根本不会出现在列表里；`null` 只剩「行还在但当前状态不进册」（如 `approving`），
     * 此时渲染 `snapshot`。整卡 `locked` 的条目同样不会出现（doc §5）。
     */
    card: NamecardPublicRecord | null;
    /** 原卡当前是否仍对外可见（`published`）；`hidden` 时为 false 但 `card` 仍在。 */
    card_status: 'published' | 'hidden' | null;
    snapshot: NamecardCollectionSnapshotRecord;
}

/** 名片册排序键（PRD §3）。 */
export type NamecardCollectionSortRecord = 'exchange' | 'name' | 'series' | 'date';

/** 名片册列表的查询（PRD §7.1）：分页、排序、搜索与高级筛选。 */
export interface NamecardCollectionQueryRecord {
    accountId: string;
    limit: number;
    offset: number;
    /** 【显示隐藏名片】：不排除 `hidden_at` 非空的条目。 */
    includeHidden?: boolean;
    /** 【显示我的名片】：并入自己 `published` 的名片（交换时间回退创建时间）。 */
    includeOwn?: boolean;
    sort?: NamecardCollectionSortRecord;
    dir?: 'asc' | 'desc';
    /** 制作人名搜索；为空时改用团体名称（PRD §7.1）。 */
    q?: string;
    /**
     * 所属用户（卡主账号 id）：只保留该账号名下的条目；卡行被删除的条目已经不在
     * 列表里，因此不需要再回退快照判断。`includeOwn` 与不同账号同用时自己的名片不参与。
     */
    owner?: string;
    /** 企划筛选；命中其中任意一个即保留。 */
    seriesCodes?: readonly string[];
    /** 所属团体（`groupName`）精确匹配（忽略大小写）。 */
    groupName?: string;
    /** 担当角色筛选；`match` 决定「或」还是「同时包含」。 */
    characterIds?: readonly number[];
    /** `all` = 【同时包含】。 */
    match?: 'any' | 'all';
    /** 【不含其他】：担当角色必须全部落在筛选项里。 */
    excludeOther?: boolean;
    /** 【不含越境】：排除企划数为复数的名片。 */
    excludeCross?: boolean;
    /** 创作声明：`original` = `is_original`，`ai` = `made_with_ai`。 */
    declaration?: 'original' | 'ai';
    /**
     * 【反向排除】：把内容筛选（搜索 / 企划 / 团体 / 角色 / 声明）整体取反；
     * `owner` / `includeOwn` / `includeHidden` 这类范围条件不受影响。
     * 没有任何内容条件时等价于不筛（不能把所有行都排除）。
     */
    invert?: boolean;
}

/** 名片墙排序键：墙上没有交换时间，`created` 用名片创建时间。 */
export type NamecardWallSortRecord = 'random' | 'created' | 'name' | 'series' | 'date';

/** 名片墙列表的查询：筛选与排序参数与名片册同名，但没有范围类开关。 */
export interface NamecardWallQueryRecord {
    limit: number;
    offset: number;
    sort?: NamecardWallSortRecord;
    /** `sort=random` 时必须提供。 */
    seed?: string;
    /** 随机排序忽略方向。创建时间与制作日期默认倒序，其余正序。 */
    dir?: 'asc' | 'desc';
    /** 制作人名称搜索；为空时改用团体名称。 */
    q?: string;
    /** 企划筛选；命中其中任意一个即保留。 */
    seriesCodes?: readonly string[];
    /** 所属团体（`groupName`）不区分大小写的子串匹配。 */
    groupName?: string;
    /** 标签筛选（已归一化）：任一词命中即保留（OR），每个词一个 EXISTS。 */
    tags?: readonly string[];
    /** 担当角色筛选；`match` 决定「或」还是「同时包含」。 */
    characterIds?: readonly number[];
    /** `all` = 【同时包含】。 */
    match?: 'any' | 'all';
    /** 【不含其他】：担当角色必须全部落在筛选项里。 */
    excludeOther?: boolean;
    /** 【不含越境】：排除企划数为复数的名片。 */
    excludeCross?: boolean;
    /** 创作声明：`original` = `is_original`，`ai` = `made_with_ai`。 */
    declaration?: 'original' | 'ai';
    /**
     * 【反向排除】：把内容筛选整体取反；没有内容条件时等价于不筛。
     * 墙没有范围类开关，因此不存在需要排除在取反之外的条件。
     */
    invert?: boolean;
}

/** 属主清单布局的原始形态：分组 + 默认分组顺序。 */
export interface NamecardCardLayoutRecord {
    groups: { id: string; title: string; cardNumbers: number[] }[];
    defaultCardNumbers: number[];
}

export interface NamecardCardLayoutSaveInput {
    accountId: string;
    groups: { id: string | null; title: string; cardNumbers: number[] }[];
    defaultCardNumbers: number[];
    quickCardNumbers: number[];
    /** 只放有变化的卡：可见性与交换模式都是免审字段。 */
    cardSettings: {
        cardId: string;
        visible?: boolean;
        exchangeMode?: 'auto' | 'manual' | 'none';
    }[];
    at: string;
}

/** 布局保存被拒绝时抛出；`message` 直接给用户看。 */
export class NamecardCardLayoutError extends Error {}

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

/**
 * `expired` 的两种来源：`stale` 表示它确实是超过 7 天还没裁决的 pending（这次顺手落了库），
 * 否则就是早就被处理过、或已被判定过期的状态。handler 据此给不同的 409 文案。
 */
export type NamecardExchangeDecisionRecord =
    | { status: 'completed' | 'declined' }
    | { status: 'not-found' }
    | { status: 'expired'; stale: boolean };

/** 交换详情窗口的一方：账号与展示名。 */
export interface NamecardExchangePartyRecord {
    account_id: string;
    display_name: string;
}

/**
 * 单笔交换的详情：两侧卡片的实时公开投影 + 双方名字。
 * 参与者校验在 SQL 里做，非参与者读不到。
 */
export interface NamecardExchangeDetailRecord {
    id: string;
    source: NamecardExchangeSourceRecord;
    status: NamecardExchangeStatusRecord;
    created_at: string | Date;
    /** `created_at + TTL`；仅 `pending` / `expired` 给值。 */
    expires_at: string | null;
    initiator: NamecardExchangePartyRecord;
    target: NamecardExchangePartyRecord;
    target_cards: NamecardPublicRecord[];
    initiator_cards: NamecardPublicRecord[];
    skipped: NamecardExchangeSkipRecord[];
}

export interface NamecardScanSessionRecord {
    id: string;
    account_id: string;
    card_numbers: number[];
    expires_at: string | Date;
    consumed_at: string | Date | null;
    /** 消费掉这张二维码的交换；与 `consumed_at` 同进同出。 */
    consumed_by_exchange_id: string | null;
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
    /**
     * 通知窗口的详情：只有发起方或目标方能读，其它人（含不存在的 id）一律 null，
     * 详情端点据此回 404。
     */
    findExchangeDetail(input: {
        exchangeId: string;
        accountId: string;
    }): Promise<NamecardExchangeDetailRecord | null>;
    listCollection(
        input: NamecardCollectionQueryRecord,
    ): Promise<{ rows: NamecardCollectionEntryRecord[]; total: number }>;
    /**
     * 所属用户选择器：自己 + 自己名片册里出现过的卡主（卡行仍在、未锁定），
     * 按显示名做不区分大小写的包含搜索。不暴露全站用户。
     */
    listCollectionOwners(input: {
        accountId: string;
        /** 显示名子串；缺省 / 空白表示不过滤。 */
        q?: string;
        limit: number;
    }): Promise<PublicProfileRecord[]>;
    /** 隐藏或恢复名片册里的一条；false 表示这一条不存在。 */
    setCollectionHidden(input: {
        accountId: string;
        cardNumber: number;
        hidden: boolean;
        at: string;
    }): Promise<boolean>;
    /**
     * 名片册里已经收着哪些卡（一次批量查，不看 `hidden_at`）。公开主页用它给
     * 登录浏览者标出「已交换」，判定口径与交换系统的 `already-owned` 一致。
     */
    listCollectedCardNumbers(input: {
        collectorAccountId: string;
        cardNumbers: readonly number[];
    }): Promise<Set<number>>;
    /** 属主清单布局的原始形态；没有保存过时返回 null，由读取侧归一出默认布局。 */
    getCardLayout(accountId: string): Promise<NamecardCardLayoutRecord | null>;
    /** 整份保存布局 + 快速清单 + 批量字段（同一事务）；校验失败抛 `NamecardCardLayoutError`。 */
    saveCardLayout(input: NamecardCardLayoutSaveInput): Promise<void>;
    /** 公开主页用：该账号全部「已发布 + 允许展示」的名片（自然顺序 `card_number DESC`）。 */
    listOwnedPublishedCardsAll(
        accountId: string
    ): Promise<NamecardPublicRecord[]>;
    /**
     * 已经收到这张卡的人可以继续读它的页面对象：原卡被持有者下线（`hidden`）后仍然放行。
     * `published` 走公开读取、`locked` 谁都不放，因此这里只认 `hidden`（doc §5）。
     */
    findHeldCardPageKey(input: {
        /** 读图的人。 */
        viewerAccountId: string;
        /** 卡片的内部 id：交换媒体地址用的就是它。 */
        cardId: string;
        /** 页面 id：`front` / `back` / `page-<uuid>`。 */
        pageId: string;
    }): Promise<string | null>;
    /** 我有、仍可交换、且对方名片册里还没有的张数。 */
    countMissingCollectionCards(input: {
        /** 名片属于谁。 */
        cardOwnerId: string;
        /** 已经收着这些名片的另一方。 */
        otherAccountId: string;
    }): Promise<number>;
    /** 快速交换清单：只有持有者勾选的卡，读取时再按 `published` + `auto` 过滤一次。 */
    listQuickExchangeCards(accountId: string): Promise<NamecardPublicRecord[]>;
    replaceQuickExchangeCards(input: {
        accountId: string;
        cardNumbers: number[];
    }): Promise<void>;
    /** 选卡界面需要的全部可交换名片，带 `selected` 标记由调用方合并。 */
    listExchangeCandidates(accountId: string): Promise<NamecardPublicRecord[]>;
    /** 固定不变的分享短链；卡片没有短链时补一条。 */
    ensureExchangeLink(cardId: string): Promise<string>;
    /**
     * 属主侧单卡分享链接：先确认这张卡属于该账号，再取（或补）固定短链。
     * 卡片不存在或不属于该账号时回 `null`，由路由翻成 404。
     */
    ensureExchangeSlugForOwnerCard(input: {
        ownerAccountId: string;
        cardNumber: number;
    }): Promise<string | null>;
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
    /**
     * 出示方轮询自己的二维码：只有创建者本人能读到，别人的 token 与不存在的
     * token 一样回 `null`，由路由统一翻成 404。
     */
    findOwnedScanSession(
        tokenHash: string,
        accountId: string,
    ): Promise<NamecardScanSessionRecord | null>;

    countAdminCards(filter?: NamecardAdminFilter): Promise<number>;
    listApprovedCards(
        limit: number,
        offset: number,
    ): Promise<NamecardPublicRecord[]>;
    /**
     * 名片墙的分页列表：可见性口径与 {@link listApprovedCards} 相同，额外支持
     * 与名片册同名的筛选 / 排序；墙上没有交换时间，`created` 与排序兜底都用
     * 名片创建时间。
     */
    listApprovedCardsPage(
        input: NamecardWallQueryRecord,
    ): Promise<{ rows: NamecardPublicRecord[]; total: number }>;
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
    /**
     * 两阶段审核的第一步。失败/并发留下的 `approving` 不算错误：拿最新 revision
     * 重试会得到 `resumed`，调用方按成功处理即可——失败不回滚，行留在原处等重试。
     */
    beginCardApproval(
        id: number,
        expectedRevision: number,
    ): Promise<NamecardApprovalClaim>;
    completeCardApproval(
        id: number,
        approvingRevision: number,
    ): Promise<NamecardMutationResult>;
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
            exchange_id: string | null;
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
