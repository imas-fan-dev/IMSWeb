import { createHash, randomUUID } from 'node:crypto';

import { adminExchangePath } from '@imsweb/contracts/paths';
import { NAMECARD_EXCHANGE_PENDING_TTL_MS } from '@imsweb/contracts/namecards/runtime';
import type { FudabaCardPageWrite } from '@/ports/repositories/fudaba';
import {
    NAMECARD_ACCENT_FALLBACK,
    NAMECARD_FAVORITE_CHARACTER_LIMIT,
} from '@imsweb/contracts/fudaba/runtime';
import {
    insertNamecardNotification,
    refreshNamecardExchangeRequestNotification,
    SqlNamecardNotificationRepository
} from '@/infra/db/repositories/namecard-notification-repository';
import {
    cardAdminEditedCopy,
    cardApprovedCopy,
    cardExchangeAcceptedCopy,
    cardExchangeDeclinedCopy,
    cardExchangeExpiredCopy,
    cardExchangeRequestedCopy,
    cardLockedCopy,
    cardRejectedCopy,
    cardRevisionFlaggedCopy,
    cardRevisionRejectedCopy,
    cardTransferredInCopy,
    cardTransferredOutCopy,
    cardUnlockedCopy,
} from '@/infra/db/repositories/namecard-notification-copy';
import {
    classifyNamecardReviewRetry,
    planNamecardReview
} from '@/ports/repositories/fudaba-review-policy';
import { NamecardCardLayoutError } from '@/ports/repositories/namecards';
import type {
    NamecardCardLayoutRecord,
    NamecardCardLayoutSaveInput,
    PlatformAccountEntryRecord,
    PlatformAccountKindRecord,
    PlatformAccountLinkRecord,
} from "@/ports/repositories/namecards";
import type {
    CardFavoriteSelectionRecord,
    CardMediaRecord,
    FudabaCardCredit,
    NamecardFeedbackReason,
    NamecardRepository,
    NamecardApprovalClaim,
    NamecardEditResult,
    NamecardMutationResult,
    NamecardAdminContent,
    NamecardAdminDeleteResult,
    NamecardAdminFieldChange,
    NamecardAdminFilter,
    NamecardAdminUpdateInput,
    NamecardAdminUpdateResult,
    NamecardDiffRecord,
    NamecardFeedbackAuditFilter,
    NamecardFeedbackAuditPage,
    NamecardLockAuditAction,
    NamecardLockAuditFilter,
    NamecardLockAuditPage,
    NamecardDiffSide,
    NamecardPublicRecord,
    PublicProfileRecord,
    NamecardSubmissionKind,
    NamecardSubmissionRecord,
    NamecardSubmissionWithHashesRecord,
    NamecardCollectionEntryRecord,
    NamecardCollectionQueryRecord,
    NamecardCollectionSnapshotRecord,
    NamecardCollectionSortRecord,
    NamecardExchangeCommitInput,
    NamecardExchangeCommitResult,
    NamecardExchangeDecisionRecord,
    NamecardExchangeDetailRecord,
    NamecardExchangeRecord,
    NamecardExchangeSkipRecord,
    NamecardScanSessionRecord,
    NamecardWallQueryRecord,
    NamecardWallSortRecord,
    PendingCardInput
} from '@/ports/repositories';
import type {
    ManagedSqlDatabase,
    SqlDatabase,
    SqlSchemaStrategy
} from '@/infra/db/sql/database';
import { executeSql, queryAll, queryOne } from '@/infra/db/sql/query';
import { syncNamecardPages } from '@/infra/db/repositories/namecard-page-sync';
import {
    cardPageObjectKey,
    parseCardPageObjectKey
} from '@/utils/storage/business-object-keys';
import { namecardSortKey } from '@/utils/sorting/namecard-sort-key';
import {
    NAMECARD_COMPAT_ORIGIN,
    NAMECARD_PUBLIC_ORIGIN
} from '@/infra/db/repositories/namecard-origins';

type NamecardSubmissionRow = Omit<NamecardSubmissionRecord, 'favorite_characters'>;

/** 名片册条目能带实时投影的原卡状态；其余（`null`/`approving`/…）只能渲染 `snapshot`（doc §5）。 */
function shelfCardStatus(value: string | null): 'published' | 'hidden' | null {
    return value === 'published' || value === 'hidden' ? value : null;
}

/** 快照里的可选文本：缺省与坏值都读成 null。 */
function snapshotText(value: unknown): string | null {
    return typeof value === 'string' ? value : null;
}

/** 排序分桶只有 0..3 四个合法值；旧快照缺省 / 坏值一律「特殊符号垫底」。 */
function snapshotBucket(value: unknown): 0 | 1 | 2 | 3 {
    return value === 0 || value === 1 || value === 2 || value === 3 ? value : 3;
}

/**
 * 读侧的快照归一：旧快照写在排序元数据与担当角色之前，缺省的键按
 * 「特殊符号垫底」与空列表补，避免读出 undefined 让排序 / 筛选漂移。
 */
function collectionSnapshotRecord(value: unknown): NamecardCollectionSnapshotRecord {
    const record = (
        value && typeof value === 'object' ? value : {}
    ) as Record<string, unknown>;
    const exchangeMode = record.exchangeMode;
    return {
        producerName: snapshotText(record.producerName),
        producerReading: snapshotText(record.producerReading),
        sortNameKey: snapshotText(record.sortNameKey) ?? '',
        sortNameBucket: snapshotBucket(record.sortNameBucket),
        groupName: snapshotText(record.groupName),
        madeOn: snapshotText(record.madeOn),
        bio: snapshotText(record.bio),
        tradeNote: snapshotText(record.tradeNote),
        isOriginal: record.isOriginal === true,
        madeWithAi: record.madeWithAi === true,
        exchangeMode:
            exchangeMode === 'auto' || exchangeMode === 'manual'
                ? exchangeMode
                : 'none',
        accent: snapshotText(record.accent),
        seriesCodes: Array.isArray(record.seriesCodes)
            ? record.seriesCodes.filter(
                  (code): code is string => typeof code === 'string'
              )
            : [],
        favoriteCharacterIds: Array.isArray(record.favoriteCharacterIds)
            ? record.favoriteCharacterIds.filter(
                  (id): id is number =>
                      typeof id === 'number' && Number.isSafeInteger(id) && id > 0
              )
            : [],
        credits: Array.isArray(record.credits)
            ? (record.credits as NamecardCollectionSnapshotRecord['credits'])
            : []
    };
}

/**
 * 卡主资料的读取口径：`listCollectionOwners`（选择器）与名片册条目的 `owner`
 * 共用同一套列与账号准入，避免两处 SQL 各写一份慢慢漂移。
 */
const COLLECTION_OWNER_OPTIONS_SELECT = `SELECT profile.account_id, profile.uid, profile.page_slug,
           profile.display_name, profile.avatar_object_key,
           profile.avatar_external_url, profile.home_city,
           profile.bio, profile.updated_at
      FROM owners
      JOIN platform_profiles profile ON profile.account_id = owners.account_id
      JOIN platform_accounts account ON account.id = profile.account_id
     WHERE account.status IN ('active', 'restricted')
       AND account.deleted_at IS NULL`;

const COLLECTION_OWNER_PROFILE_SELECT = `SELECT profile.account_id, profile.uid, profile.page_slug,
           profile.display_name, profile.avatar_object_key,
           profile.avatar_external_url, profile.home_city,
           profile.bio, profile.updated_at
      FROM platform_profiles profile
      JOIN platform_accounts account
        ON account.id = profile.account_id
     WHERE account.status IN ('active', 'restricted')
       AND account.deleted_at IS NULL`;

/**
 * 名片册列表合并后的原始行：收到的条目与「我自己的名片」投影到同一组列，
 * 实时卡片列只在原卡行还在时给值，其余从 `snapshot` 回退。
 */
interface NamecardCollectionQueryRow {
    card_number: number | string;
    obtained_at: string | Date;
    hidden_at: string | Date | null;
    snapshot: unknown;
    own: boolean;
    live_id: string | null;
    live_status: string | null;
    live_producer_name: string | null;
    live_group_name: string | null;
    live_made_on: string | null;
    live_created_at: string | Date | null;
    live_sort_name_key: string | null;
    live_sort_name_bucket: number | string | null;
    live_is_original: boolean | null;
    live_made_with_ai: boolean | null;
    live_owner_account_id: string | null;
}

/** 排序器只读的列：名片册与名片墙共用同一套排序语义。 */
interface NamecardSortView {
    cardNumber: number;
    /** 名片册是交换时间；名片墙没有交换时间，用名片创建时间。 */
    obtainedAtMs: number;
    /** 「按企划」的层级：两个及以上企划的卡片整组排在单一企划之后。 */
    multiSeries: boolean;
    /** 单一企划的目录位次（`agencies.display_order, code`）；多企划不参与。 */
    seriesRank: number;
    /** 单一企划的 code：目录位次相同时按 code 收尾。 */
    seriesCode: string;
    /** 每个担当角色的目录排序值；「按企划」取业务分类最小、同分类目录值最小的一项。 */
    characterKeys: { category: string; order: number }[];
    /** 0=有月日、1=只有年份、2=没有。精度层级固定，不随升降序翻转（PRD §3.3）。 */
    madeOnRank: number;
    /** 日期排序的比较值：`madeOn` 或创建时间回退。 */
    dateSortValue: string;
    sortNameKey: string;
    sortNameBucket: 0 | 1 | 2 | 3;
}

/** 排序 / 筛选用的归一视图：实时列与快照列在这里已经合成一份。 */
interface NamecardCollectionViewRow extends NamecardSortView {
    row: NamecardCollectionQueryRow;
    own: boolean;
    snapshot: NamecardCollectionSnapshotRecord;
    seriesCodes: string[];
    characterIds: number[];
    producerName: string | null;
    groupName: string | null;
    /** 创作声明：实时列优先，原卡删除后回退快照。 */
    isOriginal: boolean;
    madeWithAi: boolean;
    madeOn: string | null;
    /** 卡主账号：已收集条目取原卡卡主，`own` 行回退当前用户。 */
    ownerAccountId: string | null;
}

/** 名片墙的归一视图：只有实时列，没有交换快照。 */
interface NamecardWallViewRow extends NamecardSortView {
    card: NamecardPublicRecord;
    seriesCodes: string[];
    characterIds: number[];
    producerName: string | null;
    groupName: string | null;
    isOriginal: boolean;
    madeWithAi: boolean;
    madeOn: string | null;
}

function compareText(a: string, b: string): number {
    return a < b ? -1 : a > b ? 1 : 0;
}

function compareNumber(a: number, b: number): number {
    return a < b ? -1 : a > b ? 1 : 0;
}

/** 内容筛选的归一条件：名片册与名片墙共用（范围类开关不在这里）。 */
interface NamecardContentFilter {
    q?: string;
    seriesCodes?: readonly string[];
    groupName?: string;
    characterIds?: readonly number[];
    match?: 'any' | 'all';
    excludeOther?: boolean;
    excludeCross?: boolean;
    declaration?: 'original' | 'ai';
}

/** 内容筛选读到的列。 */
interface NamecardContentCandidate {
    seriesCodes: readonly string[];
    characterIds: readonly number[];
    producerName: string | null;
    groupName: string | null;
    isOriginal: boolean;
    madeWithAi: boolean;
}

/**
 * 把查询条件预计算成闭包：集合只建一次，筛选逐行调用。
 * 命中集合只有内容条件；范围条件（所属用户 / 显示开关）在调用方处理。
 */
function namecardContentMatcher(filter: NamecardContentFilter): {
    hasContentFilter: boolean;
    matches(candidate: NamecardContentCandidate): boolean;
} {
    const needle = filter.q?.trim().toLowerCase() ?? '';
    const groupNeedle = filter.groupName?.trim().toLowerCase() ?? '';
    const seriesFilter = new Set(filter.seriesCodes ?? []);
    const characterFilter = new Set(filter.characterIds ?? []);
    const declaration = filter.declaration ?? null;
    return {
        hasContentFilter:
            filter.excludeCross === true ||
            seriesFilter.size > 0 ||
            groupNeedle.length > 0 ||
            characterFilter.size > 0 ||
            needle.length > 0 ||
            declaration !== null,
        matches(candidate) {
            // 【不含越境】：企划数是复数的整张排除（PRD §4）。
            if (filter.excludeCross && candidate.seriesCodes.length > 1) {
                return false;
            }
            if (
                seriesFilter.size > 0 &&
                !candidate.seriesCodes.some((code) => seriesFilter.has(code))
            ) {
                return false;
            }
            if (
                groupNeedle.length > 0 &&
                !candidate.groupName?.trim().toLowerCase().includes(groupNeedle)
            ) {
                return false;
            }
            if (characterFilter.size > 0) {
                const held = new Set(candidate.characterIds);
                if (filter.match === 'all') {
                    for (const characterId of characterFilter) {
                        if (!held.has(characterId)) return false;
                    }
                } else if (
                    !candidate.characterIds.some((characterId) =>
                        characterFilter.has(characterId)
                    )
                ) {
                    return false;
                }
                // 【不含其他】：担当角色必须全部落在筛选项里（PRD §4）。
                if (
                    filter.excludeOther &&
                    candidate.characterIds.some(
                        (characterId) => !characterFilter.has(characterId)
                    )
                ) {
                    return false;
                }
            }
            if (needle.length > 0) {
                // 制作人名称为空时改用团体名称（团体名片的检索口径，PRD §7.1）。
                const producer = candidate.producerName?.trim() ?? '';
                const haystack = (producer || candidate.groupName?.trim() || '')
                    .toLowerCase();
                if (!haystack.includes(needle)) return false;
            }
            // 创作声明与其它内容条件同属命中集合，可被 `invert` 一并取反。
            if (declaration === 'original' && !candidate.isOriginal) return false;
            if (declaration === 'ai' && !candidate.madeWithAi) return false;
            return true;
        }
    };
}

/**
 * 担当分类的**业务顺序**（PRD §3.2）：idol → staff → rival → mascot → chara →
 * other，目录里没有的分类垫底。字符串字典序会把 chara 排到 idol 前面，不能直接用。
 */
const COLLECTION_CHARACTER_CATEGORY_RANK: Readonly<Record<string, number>> = {
    idol: 0,
    staff: 1,
    rival: 2,
    mascot: 3,
    chara: 4,
    other: 5
};

function characterCategoryRank(category: string): number {
    return COLLECTION_CHARACTER_CATEGORY_RANK[category] ?? 6;
}

/** 「按企划」的第一个担当角色：业务分类最小、同分类里目录排序值最小。 */
function firstCharacterKey(
    view: NamecardSortView
): { category: string; order: number } | null {
    let best: { category: string; order: number } | null = null;
    for (const candidate of view.characterKeys) {
        if (
            !best ||
            characterCategoryRank(candidate.category) <
                characterCategoryRank(best.category) ||
            (characterCategoryRank(candidate.category) ===
                characterCategoryRank(best.category) &&
                candidate.order < best.order)
        ) {
            best = candidate;
        }
    }
    return best;
}

/** 首担当角色的比较；没有担当角色的卡片垫底（与 `dir` 一起翻转到最前）。 */
function compareFirstCharacters(
    a: NamecardSortView,
    b: NamecardSortView
): number {
    const left = firstCharacterKey(a);
    const right = firstCharacterKey(b);
    if (!left || !right) {
        if (left) return -1;
        if (right) return 1;
        return 0;
    }
    return (
        compareNumber(
            characterCategoryRank(left.category),
            characterCategoryRank(right.category)
        ) || compareNumber(left.order, right.order)
    );
}

/**
 * 名片册 / 名片墙排序（PRD §3）：
 * - `name` 只用「是否特殊符号」分层（符号永远垫底），其余按同一个拉丁键比较——
 *   英文名、假名罗马音与中文拼音直接混排；分桶值只用来标记符号。
 * - `date` 的「没有日期」层级固定垫底；只有比较键跟着 `dir` 翻转。
 * - `series` 的三层语义：单一企划卡片整组在前、多企划整组在后（层级固定）；
 *   单企划组内按企划目录顺序（`dir` 翻转），多企划组内不比较企划；两组都用
 *   首担当角色的业务分类 → 目录排序值（`dir` 翻转）比较，最后按时间兜底。
 * 兜底与 `created` 用 `obtainedAtMs`：名片册是交换时间，名片墙是名片创建时间。
 * 除 `series` 外所有排序都以时间、名片编号兜底，保证分页稳定。
 */
function compareCollectionRows(
    a: NamecardSortView,
    b: NamecardSortView,
    sort: NamecardCollectionSortRecord | NamecardWallSortRecord,
    direction: 'asc' | 'desc'
): number {
    const factor = direction === 'desc' ? -1 : 1;
    const tail =
        compareNumber(a.obtainedAtMs, b.obtainedAtMs) * factor ||
        compareNumber(a.cardNumber, b.cardNumber) * factor;
    if (sort === 'name') {
        const aSymbolic = a.sortNameBucket === 3 ? 1 : 0;
        const bSymbolic = b.sortNameBucket === 3 ? 1 : 0;
        return (
            compareNumber(aSymbolic, bSymbolic) ||
            compareText(a.sortNameKey, b.sortNameKey) * factor ||
            tail
        );
    }
    if (sort === 'series') {
        // 层级不跟着 `dir` 翻转：多企划卡片永远在所有单企划之后。
        const layer = compareNumber(
            a.multiSeries ? 1 : 0,
            b.multiSeries ? 1 : 0
        );
        if (layer !== 0) return layer;
        if (!a.multiSeries) {
            const catalogue =
                compareNumber(a.seriesRank, b.seriesRank) * factor ||
                compareText(a.seriesCode, b.seriesCode) * factor;
            if (catalogue !== 0) return catalogue;
        }
        const characters = compareFirstCharacters(a, b) * factor;
        if (characters !== 0) return characters;
        // 兜底同样固定：同一组里永远是更早交换的在前，再按名片编号。
        return (
            compareNumber(a.obtainedAtMs, b.obtainedAtMs) ||
            compareNumber(a.cardNumber, b.cardNumber)
        );
    }
    if (sort === 'date') {
        const precision = compareNumber(a.madeOnRank, b.madeOnRank);
        if (precision !== 0) return precision;
        return compareText(a.dateSortValue, b.dateSortValue) * factor || tail;
    }
    return tail;
}

/** 布局 JSONB 的防御性解析：坏数据按空布局处理，不让一行脏数据把整页打挂。 */
function cardLayoutFromJson(value: unknown): NamecardCardLayoutRecord {
    const record = (
        typeof value === 'string' ? JSON.parse(value) : value
    ) as Partial<NamecardCardLayoutRecord> | null;
    const groups = Array.isArray(record?.groups) ? record.groups : [];
    return {
        groups: groups
            .filter(
                (group) =>
                    typeof group?.id === 'string' &&
                    typeof group?.title === 'string' &&
                    Array.isArray(group?.cardNumbers)
            )
            .map((group) => ({
                id: group.id,
                title: group.title,
                cardNumbers: group.cardNumbers.map(Number)
            })),
        defaultCardNumbers: Array.isArray(record?.defaultCardNumbers)
            ? record.defaultCardNumbers.map(Number)
            : []
    };
}

type NamecardLockAuditRow = {
    id: number | string;
    action: NamecardLockAuditAction;
    reason: string | null;
    handled_by: string | null;
    occurred_at: Date | string;
    card_number: number | string;
    producer_name: string | null;
    owner_account_id: string | null;
    owner_name: string | null;
};

type NamecardFeedbackAuditRow = {
    id: number | string;
    reason: NamecardFeedbackReason;
    status: string;
    handled_by: string | null;
    handled_at: Date | string | null;
    card_number: number | string;
    producer_name: string | null;
    owner_account_id: string | null;
    owner_name: string | null;
    reporter_account_id: string;
    reporter_name: string | null;
};

type NamecardFavoriteRow = {
    card_id: number | string;
    character_id: number | string;
    agency_code: string;
    name_cn: string;
    display_order: number | string;
};


const NAMECARD_COLUMNS = `id AS internal_id, card_number, publication_status, revision, origin,
    producer_name, producer_reading, group_name, is_group_card, made_on, lock_reason, created_at,
    review_status, review_reason, pending_payload,
    bio, trade_note, is_original, made_with_ai, visible, exchange_mode, accent,
    owner_account_id`;

/** 交换行与其名片号数组的统一投影。 */
interface NamecardExchangeRow {
    id: string;
    client_exchange_id: string;
    source: NamecardExchangeRecord['source'];
    status: NamecardExchangeRecord['status'];
    initiator_account_id: string;
    target_account_id: string;
    target_card_numbers: Array<number | string> | null;
    initiator_card_numbers: Array<number | string> | null;
    skipped: unknown;
    created_at: string | Date;
    resolved_at: string | Date | null;
}

const EXCHANGE_COLUMNS = `id, client_exchange_id, source, status,
    initiator_account_id, target_account_id,
    target_card_numbers, initiator_card_numbers, skipped,
    created_at, resolved_at`;

/**
 * 读取侧的交换投影：超过 TTL 仍 `pending` 的行一律呈现为 `expired`。
 * 不写库也自洽（过期不是一次用户动作），裁决侧命中时才顺手落成 `expired`。
 */
const EXCHANGE_READ_COLUMNS = `id, client_exchange_id, source,
    CASE WHEN status='pending' AND created_at < now() - interval '7 days'
         THEN 'expired' ELSE status END AS status,
    initiator_account_id, target_account_id,
    target_card_numbers, initiator_card_numbers, skipped,
    created_at, resolved_at`;

function exchangeRecordFromRow(row: NamecardExchangeRow): NamecardExchangeRecord {
    return {
        id: row.id,
        client_exchange_id: row.client_exchange_id,
        source: row.source,
        status: row.status,
        initiator_account_id: row.initiator_account_id,
        target_account_id: row.target_account_id,
        target_card_numbers: (row.target_card_numbers ?? []).map(Number),
        initiator_card_numbers: (row.initiator_card_numbers ?? []).map(Number),
        skipped: Array.isArray(row.skipped)
            ? (row.skipped as NamecardExchangeSkipRecord[])
            : [],
        created_at: row.created_at,
        resolved_at: row.resolved_at
    };
}

/** `?` 占位符只认标量，名片号数组写成 PG 的 bigint[] 字面量。 */
function postgresBigintArray(values: readonly number[]): string {
    return `{${values.map((value) => Math.trunc(value)).join(',')}}`;
}

/**
 * 「两次发起有没有差别」的口径：两侧卡号按集合比较，顺序不同不算变化。
 * 相等才是同一次申请；任一侧变了就用新的内容覆盖旧的待确认记录。
 */
function sameExchangeCardNumbers(
    left: readonly number[],
    right: readonly number[]
): boolean {
    if (left.length !== right.length) return false;
    const expected = new Set(left.map(Number));
    return right.every((number) => expected.has(Number(number)));
}

/** 分享短链与卡片绑定，同一张卡永远得到同一个地址。 */
function exchangeSlugForCard(cardId: string): string {
    return createHash('sha256')
        .update(`namecard-exchange:${cardId}`)
        .digest('hex')
        .slice(0, 12);
}

function namecardAdminWhere(
    filter?: NamecardAdminFilter
): { sql: string; values: unknown[] } {
    // Withdrawn submissions are gone from the submitter's side, so they never
    // enter the queue; rejected ones stay visible so they can be inspected.
    const clauses = [
        "publication_status <> 'withdrawn'",
        'deleted_at IS NULL',
        // A guest upload folded into a different served card is no longer its
        // own entry. A claim that upgraded the guest row in place records the
        // row as its own merge target, and that card is a real card now.
        `NOT EXISTS (
            SELECT 1 FROM fudaba_card_merges merged
            WHERE merged.legacy_card_id = fudaba_cards.card_number
              AND merged.target_card_id <> fudaba_cards.id
        )`
    ];
    const values: unknown[] = [];
    if (filter?.status === 'pending') {
        // A revision of a published card waits in the same queue while the
        // live copy stays online.
        clauses.push(
            "(publication_status IN ('pending','approving') OR review_status = 'pending')"
        );
    } else if (filter?.status === 'published') {
        clauses.push("publication_status = 'published'");
    } else if (filter?.status === 'rejected') {
        clauses.push(
            "(publication_status = 'rejected' OR review_status IN ('rejected','locked'))"
        );
    } else if (filter?.status === 'locked') {
        clauses.push("publication_status = 'locked'");
    } else if (filter?.status === 'hidden') {
        clauses.push("publication_status = 'hidden'");
    }
    if (filter !== undefined && filter.origins.length > 0) {
        clauses.push(`origin IN (${filter.origins.map(() => '?').join(', ')})`);
        values.push(...filter.origins);
    }
    if (filter?.ownerAccountId !== null && filter?.ownerAccountId !== undefined) {
        clauses.push('owner_account_id = ?');
        values.push(filter.ownerAccountId);
    }
    if (filter !== undefined && filter.query !== null && filter.query !== '') {
        const pattern = `%${filter.query.replace(/[\\%_]/g, '\\$&')}%`;
        clauses.push(
            "(COALESCE(producer_name, '') ILIKE ? ESCAPE '\\' OR COALESCE(producer_reading, '') ILIKE ? ESCAPE '\\')"
        );
        values.push(pattern, pattern);
    }
    return { sql: clauses.join(' AND '), values };
}

type NamecardCardRow = {
    internal_id: string;
    card_number: number | string;
    publication_status: string;
    revision: number | string;
    series_code: string | null;
    origin: string;
    producer_name?: string | null;
    producer_reading?: string | null;
    group_name?: string | null;
    is_group_card?: boolean;
    made_on?: string | null;
    lock_reason?: string | null;
    review_status?: string | null;
    review_reason?: string | null;
    pending_payload?: unknown;
    bio?: string | null;
    trade_note?: string | null;
    is_original?: boolean | null;
    made_with_ai?: boolean | null;
    visible?: boolean | null;
    exchange_mode?: string | null;
    accent?: string | null;
    owner_account_id?: string | null;
    review_submitted_at?: string | Date | null;
    created_at: string | Date | null;
};

/** 墙的候选行：卡片列 + 读侧排序元数据（与名片册排序同源）。 */
type NamecardWallCardRow = NamecardCardRow & {
    sort_name_key: string | null;
    sort_name_bucket: number | string | null;
};

/**
 * 一套页面的对象 key，按 display_order：首项正面、末项背面（只有一页时没有
 * 背面）。页面行是唯一媒体来源，正/反/中间的角色全部由顺序推导。
 */
type NamecardArtworkKeys = {
    front: string;
    back: string | null;
    middle: string[];
};

/** 一张卡两套页面的对象 key：线上队列与待审队列。 */
type NamecardPageKeys = {
    live: string[];
    pending: string[];
};

const NO_PAGE_KEYS: NamecardPageKeys = { live: [], pending: [] };

function artworkKeysFrom(keys: readonly string[]): NamecardArtworkKeys | null {
    const front = keys[0];
    if (front === undefined) return null;
    return {
        front,
        back: keys.length > 1 ? keys[keys.length - 1]! : null,
        middle: keys.slice(1, -1)
    };
}

// A revision waiting for review keeps the live columns untouched; reviewers and
// the owner both read the submitted copy through this projection instead.
type NamecardPendingPayload = {
    producer_name?: string | null;
    is_group_card?: boolean;
    producer_reading?: string | null;
    bio?: string | null;
    trade_note?: string | null;
    credits?: FudabaCardCredit[];
    series_codes?: string[];
    group_name?: string | null;
    made_on?: string | null;
    is_original?: boolean;
    made_with_ai?: boolean;
    visible?: boolean;
    exchange_mode?: string;
    favorite_character_ids?: number[];
};

function pendingNamecardPayload(value: unknown): NamecardPendingPayload | null {
    if (!value) return null;
    if (typeof value === 'string') {
        try {
            const parsed: unknown = JSON.parse(value);
            return parsed && typeof parsed === 'object'
                ? (parsed as NamecardPendingPayload)
                : null;
        } catch {
            return null;
        }
    }
    return typeof value === 'object' ? (value as NamecardPendingPayload) : null;
}

const NAMECARD_ADMIN_STATUS_LABELS: Record<string, string> = {
    draft: '草稿',
    pending: '待审核',
    approving: '审核中',
    published: '已通过',
    hidden: '已隐藏',
    rejected: '已驳回',
    withdrawn: '已撤回',
    locked: '已锁定'
};

const NAMECARD_ADMIN_REVIEW_LABELS: Record<string, string> = {
    none: '无待审版本',
    pending: '待审',
    rejected: '复审驳回',
    locked: '违规锁定'
};

const NAMECARD_ADMIN_EXCHANGE_LABELS: Record<string, string> = {
    auto: '自动允许',
    manual: '手动允许',
    none: '不可交换'
};

// The admin queue speaks the same vocabulary as the database: a card that went
// live is `published`. The intermediate `approving` lock only exists for the
// two-phase approval, so it surfaces as `pending` instead of leaking out.
function toLegacyNamecardStatus(status: string): NamecardSubmissionRecord['status'] {
    // The public routes still speak the legacy vocabulary: `published` serves as
    // `approved`, and the approval lock reads as `pending`.
    const normalized =
        status === 'published' ? 'approved' : status === 'approving' ? 'pending' : status;
    return normalized as NamecardSubmissionRecord['status'];
}

/** Verdict of the submitted revision, independent of the live publication. */
function toNamecardReviewStatus(
    status: string | null | undefined
): 'pending' | 'rejected' | 'locked' | null {
    return status === 'pending' || status === 'rejected' || status === 'locked'
        ? status
        : null;
}


export class SqlCoreRepository implements NamecardRepository {
    private initialized?: Promise<void>;

    constructor(
        private readonly database: ManagedSqlDatabase,
        private readonly schema: SqlSchemaStrategy
    ) {}

    initialize(): Promise<void> {
        this.initialized ??= this.schema.initializeCore(this.database);
        return this.initialized;
    }

    close(): Promise<void> {
        return this.database.close();
    }

    findCardByOrderedHashes(hash1: string, hash2: string): Promise<{ id: number } | null> {
        return queryOne(this.database,
            `SELECT card.card_number AS id
             FROM namecard_guest_attributes guest
             JOIN fudaba_cards card ON card.id=guest.card_id
             WHERE guest.hash1=? AND guest.hash2=?
               AND card.publication_status NOT IN ('withdrawn','rejected')`,
            [hash1, hash2]
        );
    }

    private async validateNamecardSelection(
        database: SqlDatabase,
        seriesCode: string | null,
        characterIds: readonly number[],
        submissionKind: NamecardSubmissionKind
    ): Promise<CardFavoriteSelectionRecord[]> {
        if (submissionKind === 'guest' && !seriesCode) {
            throw new Error('Guest namecard submissions require a series code');
        }
        if (
            submissionKind === 'guest' &&
            (characterIds.length < 1 ||
                characterIds.length > NAMECARD_FAVORITE_CHARACTER_LIMIT)
        ) {
            throw new Error(
                `Guest namecard submissions require between 1 and ${NAMECARD_FAVORITE_CHARACTER_LIMIT} characters`
            );
        }
        if (
            characterIds.length > NAMECARD_FAVORITE_CHARACTER_LIMIT ||
            new Set(characterIds).size !== characterIds.length
        ) {
            throw new Error(
                `Namecard character selections must be unique and contain at most ${NAMECARD_FAVORITE_CHARACTER_LIMIT} characters`
            );
        }
        if (seriesCode) {
            const series = await queryOne<{ code: string }>(
                database,
                'SELECT code FROM agencies WHERE code=?',
                [seriesCode]
            );
            if (!series) throw new Error('Namecard series does not exist');
        }
        if (!characterIds.length) return [];
        const placeholders = characterIds.map(() => '?').join(', ');
        const rows = await queryAll<Omit<NamecardFavoriteRow, 'card_id' | 'display_order'>>(
            database,
            `SELECT character.id AS character_id, agency.code AS agency_code, character.name_cn
             FROM namecard_characters character
             JOIN agencies agency ON agency.id=character.agency_id
             WHERE character.id IN (${placeholders}) AND character.deleted_at IS NULL`,
            characterIds
        );
        const byId = new Map(rows.map((row) => [Number(row.character_id), row]));
        if (byId.size !== characterIds.length) {
            throw new Error('One or more selected namecard characters do not exist');
        }
        return characterIds.map((characterId, displayOrder) => {
            const character = byId.get(characterId)!;
            return {
                character_id: characterId,
                agency_code: character.agency_code,
                name_cn: character.name_cn,
                display_order: displayOrder
            };
        });
    }

    private async listNamecardFavorites(
        database: SqlDatabase,
        internalIds: readonly string[]
    ): Promise<Map<string, CardFavoriteSelectionRecord[]>> {
        const grouped = new Map<string, CardFavoriteSelectionRecord[]>();
        for (const internalId of internalIds) grouped.set(internalId, []);
        if (!internalIds.length) return grouped;
        const placeholders = internalIds.map(() => '?').join(', ');
        const rows = await queryAll<NamecardFavoriteRow>(
            database,
            `SELECT selected.card_id, selected.character_id, agency.code AS agency_code,
                    character.name_cn, selected.display_order
             FROM fudaba_card_favorite_characters selected
             JOIN namecard_characters character ON character.id=selected.character_id
             JOIN agencies agency ON agency.id=character.agency_id
             WHERE selected.card_id IN (${placeholders})
             ORDER BY selected.card_id, selected.display_order`,
            internalIds
        );
        for (const row of rows) {
            grouped.get(String(row.card_id))?.push({
                character_id: Number(row.character_id),
                agency_code: row.agency_code,
                name_cn: row.name_cn,
                display_order: Number(row.display_order)
            });
        }
        return grouped;
    }

    private namecardRecordFromRow(
        row: NamecardCardRow,
        /** `live` serves the published copy; `submission` serves the queue. */
        content: 'live' | 'submission' = 'submission'
    ): NamecardSubmissionRow {
        const staged = content === 'submission' && row.review_status === 'pending';
        const payload = staged ? pendingNamecardPayload(row.pending_payload) : null;
        return {
            id: Number(row.card_number),
            cardId: row.internal_id,
            card_number: Number(row.card_number),
            producer_name: row.producer_name ?? null,
            is_group_card: row.is_group_card === true,
            producer_reading: row.producer_reading ?? null,
            group_name: row.group_name ?? null,
            made_on: row.made_on ?? null,
            bio: row.bio ?? null,
            trade_note: row.trade_note ?? null,
            is_original: row.is_original ?? false,
            made_with_ai: row.made_with_ai ?? false,
            exchange_mode: row.exchange_mode === 'auto' || row.exchange_mode === 'manual'
                ? row.exchange_mode
                : 'none',
            accent: row.accent ?? null,
            owner_account_id: row.owner_account_id ?? null,
            // A pending revision is a queue item even though the live copy is
            // still published; the wall reads the database directly and is not
            // affected by how the queue labels the card.
            status: staged ? 'pending' : toLegacyNamecardStatus(row.publication_status),
            revision: Number(row.revision),
            series_code: payload?.series_codes?.[0] ?? null,
            submission_kind: row.origin === 'guest' ? 'guest' : 'legacy',
            lockReason: row.lock_reason ?? null,
            reviewStatus: staged ? 'pending' : toNamecardReviewStatus(row.review_status),
            reviewReason: row.review_reason ?? null,
            created_at: row.created_at
        };
    }

    /** Series live in their own table now; the queue only needs the first one. */
    private async listNamecardSeries(
        database: SqlDatabase,
        cardIds: readonly string[]
    ): Promise<Map<string, string[]>> {
        const grouped = new Map<string, string[]>();
        for (const cardId of cardIds) grouped.set(cardId, []);
        if (!cardIds.length) return grouped;
        const placeholders = cardIds.map(() => '?').join(', ');
        const result = await (database.prepare(
            `SELECT card_id, series_code FROM public.fudaba_card_series
             WHERE card_id IN (${placeholders})
             ORDER BY card_id, display_order`
        ).bind(...cardIds).all<{ card_id: string; series_code: string }>());
        for (const row of result.results) {
            grouped.get(row.card_id)?.push(row.series_code);
        }
        return grouped;
    }

    private async attachNamecardFavorites(
        database: SqlDatabase,
        rows: readonly NamecardCardRow[],
        content: 'live' | 'submission' = 'submission'
    ): Promise<Array<NamecardSubmissionRow & { favorite_characters: CardFavoriteSelectionRecord[] }>> {
        const ids = rows.map((row) => row.internal_id);
        const characters = await this.listNamecardFavorites(database, ids);
        const series = await this.listNamecardSeries(database, ids);
        const credits = await this.listNamecardCredits(database, ids);
        return rows.map((row) => {
            const favoriteCharacters = characters.get(row.internal_id) ?? [];
            const record = this.namecardRecordFromRow(row, content);
            const payload =
                content === 'submission' && row.review_status === 'pending'
                    ? pendingNamecardPayload(row.pending_payload)
                    : null;
            const seriesCodes = series.get(row.internal_id) ?? [];
            return {
                ...record,
                origin: row.origin,
                producer_name: payload?.producer_name ?? row.producer_name ?? null,
                favorite_characters: favoriteCharacters,
                seriesCode: seriesCodes[0] ?? record.series_code ?? null,
                series_codes: seriesCodes,
                credits: credits.get(row.internal_id) ?? [],
                submissionKind: record.submission_kind ?? 'legacy',
                favoriteCharacters
            };
        });
    }

    /**
     * 每张卡 live/pending 两套页面的对象 key，按 display_order。页面行是唯一
     * 媒体来源，正/反/中间的角色由这一顺序推导。
     */
    private async listNamecardPages(
        database: SqlDatabase,
        cardIds: readonly string[]
    ): Promise<Map<string, NamecardPageKeys>> {
        const grouped = new Map<string, NamecardPageKeys>();
        for (const cardId of cardIds) grouped.set(cardId, { live: [], pending: [] });
        if (!cardIds.length) return grouped;
        const placeholders = cardIds.map(() => '?').join(', ');
        const result = await database.prepare(
            `SELECT card_id, queue, page_id, object_version, object_queue
               FROM public.fudaba_card_pages
              WHERE card_id IN (${placeholders})
              ORDER BY card_id, queue, display_order`
        ).bind(...cardIds).all<{
            card_id: string;
            queue: 'live' | 'pending';
            page_id: string;
            object_version: string;
            object_queue: 'live' | 'pending' | null;
        }>();
        for (const row of result.results) {
            grouped.get(row.card_id)?.[row.queue].push(
                cardPageObjectKey(
                    row.card_id,
                    row.object_queue ?? row.queue,
                    row.page_id,
                    row.object_version
                )
            );
        }
        return grouped;
    }

    private async listNamecardCredits(
        database: SqlDatabase,
        cardIds: readonly string[]
    ): Promise<Map<string, FudabaCardCredit[]>> {
        const grouped = new Map<string, FudabaCardCredit[]>();
        for (const cardId of cardIds) grouped.set(cardId, []);
        if (!cardIds.length) return grouped;
        const placeholders = cardIds.map(() => '?').join(', ');
        const result = await database.prepare(
            `SELECT card_id, account_id, display_name, url, roles
             FROM public.fudaba_card_credits
             WHERE card_id IN (${placeholders})
             ORDER BY card_id, display_order`
        ).bind(...cardIds).all<{
            card_id: string;
            account_id: string | null;
            display_name: string;
            url: string | null;
            roles: string[];
        }>();
        for (const row of result.results) {
            grouped.get(row.card_id)?.push({
                accountId: row.account_id,
                displayName: row.display_name,
                url: row.url,
                roles: row.roles as FudabaCardCredit['roles']
            });
        }
        return grouped;
    }

    private async attachOneNamecard(
        database: SqlDatabase,
        row: NamecardCardRow | null
    ): Promise<NamecardSubmissionRecord | null> {
        if (!row) return null;
        return (await this.attachNamecardFavorites(database, [row]))[0] ?? null;
    }

    async insertPendingCard(input: PendingCardInput): Promise<number> {
        const submissionKind = input.submissionKind ?? 'guest';
        const characterIds = input.characterIds ?? [];
        const idPrefix = submissionKind === 'legacy' ? 'legacy' : 'guest';
        const sort = namecardSortKey(input.producerName ?? null, null);
        return this.database.transaction(async (database) => {
            const characters = await this.validateNamecardSelection(
                database,
                input.seriesCode ?? null,
                characterIds,
                submissionKind
            );
            const created = await queryOne<{ id: string; card_number: number | string }>(
                database,
                `WITH allocated AS (
                     SELECT nextval('public.namecard_number_seq') AS card_number
                 )
                 INSERT INTO fudaba_cards
                    (id, card_number, origin, producer_name,
                     sort_name_key, sort_name_bucket,
                     accent, bio, trade_note,
                     exchange_mode, publication_status, revision,
                     created_at, updated_at)
                 SELECT ? || '-' || allocated.card_number::text, allocated.card_number,
                        ?, ?, ?, ?,
                        COALESCE(?, '#4f64dd'), ?, NULL,
                        'none', 'pending', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
                 FROM allocated
                 RETURNING id, card_number`,
                [
                    idPrefix,
                    idPrefix,
                    input.producerName ?? null,
                    sort.key,
                    sort.bucket,
                    input.accent ?? null,
                    input.bio ?? null
                ]
            );
            if (!created) throw new Error('Card insert did not return an ID');
            // Guest cards keep their single series in the shared set table.
            if (input.seriesCode) {
                await executeSql(database,
                    `INSERT INTO public.fudaba_card_series
                        (card_id, series_code, display_order)
                     VALUES (?, ?, 1)
                     ON CONFLICT (card_id, series_code) DO NOTHING`,
                    [created.id, input.seriesCode]
                );
            }
            if (characters.length) {
                await database.batch(characters.map((character) => database.prepare(
                    `INSERT INTO fudaba_card_favorite_characters (card_id, character_id, display_order)
                     VALUES (?, ?, ?)`
                ).bind(created.id, character.character_id, character.display_order)));
            }
            await executeSql(database,
                `INSERT INTO namecard_guest_attributes
                    (card_id, hash1, hash2, submitted_ip, withdrawal_token_hash)
                 VALUES (?, ?, ?, ?, ?)`,
                [created.id, input.hash1, input.hash2, input.ip, input.withdrawalTokenHash]
            );
            return Number(created.card_number);
        });
    }

    async countApprovedCards(): Promise<number> {
        // The public wall only serves the two anonymous shapes: the legacy
        // archive rows and guest uploads. Registered-user cards are listed in
        // the admin queue and, once approved, reach the exchange wall through
        // the media publishing pipeline instead of this legacy payload.
        const row = await queryOne<{ total: number }>(this.database,
            `SELECT CAST(COUNT(*) AS INTEGER) AS total FROM fudaba_cards
             WHERE publication_status='published'
               AND ${NAMECARD_PUBLIC_ORIGIN}
               AND deleted_at IS NULL`
        );
        return row?.total ?? 0;
    }

    async countAdminCards(filter?: NamecardAdminFilter): Promise<number> {
        const where = namecardAdminWhere(filter);
        const row = await queryOne<{ total: number }>(this.database,
            `SELECT CAST(COUNT(*) AS INTEGER) AS total FROM fudaba_cards WHERE ${where.sql}`,
            where.values
        );
        return row?.total ?? 0;
    }

    async listApprovedCards(limit: number, offset: number): Promise<NamecardPublicRecord[]> {
        const rows = await queryAll<NamecardCardRow>(this.database,
            `SELECT ${NAMECARD_COLUMNS} FROM fudaba_cards
             WHERE publication_status='published'
               AND visible=TRUE
               AND ${NAMECARD_PUBLIC_ORIGIN}
               AND deleted_at IS NULL
             ORDER BY card_number DESC LIMIT ? OFFSET ?`,
            [limit, offset]
        );
        // The wall publishes the live copy; a pending revision stays queued.
        return await this.attachNamecardFavorites(
            this.database,
            rows,
            'live'
        ) as NamecardPublicRecord[];
    }

    /**
     * 名片墙的分页列表：筛选 / 排序与名片册同一套语义，可见性口径与
     * `listApprovedCards` 相同；墙上没有交换时间，`created` 与排序兜底都用
     * 名片创建时间。排序键、担当角色与企划目录各批量查一次，不做逐行回库。
     */
    async listApprovedCardsPage(
        input: NamecardWallQueryRecord
    ): Promise<{ rows: NamecardPublicRecord[]; total: number }> {
        const rows = await queryAll<NamecardWallCardRow>(
            this.database,
            `SELECT ${NAMECARD_COLUMNS}, sort_name_key, sort_name_bucket
               FROM fudaba_cards
              WHERE publication_status='published'
                AND visible=TRUE
                AND ${NAMECARD_PUBLIC_ORIGIN}
                AND deleted_at IS NULL
              ORDER BY card_number DESC`,
            []
        );
        const cards = (await this.attachNamecardFavorites(
            this.database,
            rows,
            'live'
        )) as NamecardPublicRecord[];
        const cardIds = rows.map((row) => row.internal_id);
        const sort = input.sort ?? 'created';
        // 缺省方向与名片册同一规则：创建时间与制作日期倒序，其余正序。
        const direction =
            input.dir ??
            (sort === 'created' || sort === 'date' ? 'desc' : 'asc');
        const [favoriteOrders, seriesRanks] = await Promise.all([
            this.listCollectionFavoriteOrders(this.database, cardIds),
            // 企划目录顺序只差一次查询；其它排序用不上，别为它多跑一趟。
            sort === 'series'
                ? this.listCollectionSeriesRanks(this.database)
                : Promise.resolve(new Map<string, number>())
        ]);

        const views = rows.map((row, index): NamecardWallViewRow => {
            const card = cards[index]!;
            const favoriteKeys = favoriteOrders.get(row.internal_id) ?? [];
            const seriesCodes = [...(card.series_codes ?? [])];
            const madeOn = card.made_on?.trim() || null;
            const createdAtMs = card.created_at
                ? new Date(card.created_at).getTime()
                : 0;
            const madeOnRank = madeOn === null ? 2 : madeOn.length >= 7 ? 0 : 1;
            // 多企划不参与目录比较；单一企划（含零企划）按位次排序，
            // 目录里查不到（或没有企划）的位次垫底，再按 code 收尾。
            const seriesCode = seriesCodes[0] ?? '';
            return {
                card,
                // 墙上没有交换时间：创建时间同时承担 `created` 与排序兜底。
                obtainedAtMs: createdAtMs,
                cardNumber: Number(card.card_number ?? card.id),
                seriesCodes,
                multiSeries: seriesCodes.length > 1,
                seriesRank:
                    seriesRanks.get(seriesCode) ?? Number.MAX_SAFE_INTEGER,
                seriesCode,
                characterIds: favoriteKeys.map(({ id }) => id),
                characterKeys: favoriteKeys.map(({ category, order }) => ({
                    category,
                    order
                })),
                producerName: card.producer_name ?? null,
                groupName: card.group_name ?? null,
                isOriginal: card.is_original === true,
                madeWithAi: card.made_with_ai === true,
                madeOn,
                madeOnRank,
                dateSortValue:
                    madeOnRank < 2
                        ? (madeOn ?? '')
                        : new Date(createdAtMs).toISOString(),
                sortNameKey: row.sort_name_key ?? '',
                sortNameBucket: snapshotBucket(row.sort_name_bucket)
            };
        });

        // 内容条件与名片册共用同一个命中集合；墙没有范围类开关需要排除。
        const content = namecardContentMatcher(input);
        const invert = input.invert === true && content.hasContentFilter;
        const filtered = views.filter((view) => {
            const matched = content.matches(view);
            return invert ? !matched : matched;
        });
        filtered.sort((left, right) =>
            compareCollectionRows(left, right, sort, direction)
        );
        const page = filtered.slice(input.offset, input.offset + input.limit);
        return {
            total: filtered.length,
            rows: page.map((view) => view.card)
        };
    }

    async findApprovedCard(
        cardNumber: number
    ): Promise<NamecardPublicRecord | null> {
        const row = await queryOne<NamecardCardRow>(
            this.database,
            `SELECT ${NAMECARD_COLUMNS} FROM fudaba_cards
             WHERE card_number=?
               AND publication_status='published'
               AND visible=TRUE
               AND ${NAMECARD_PUBLIC_ORIGIN}
               AND deleted_at IS NULL`,
            [cardNumber]
        );
        if (!row) return null;
        const [card] = (await this.attachNamecardFavorites(
            this.database,
            [row],
            'live'
        )) as NamecardPublicRecord[];
        return card ?? null;
    }

    async findPublicProfile(handle: string): Promise<PublicProfileRecord | null> {
        return queryOne<PublicProfileRecord>(
            this.database,
            `SELECT profile.account_id, profile.uid, profile.page_slug,
                    profile.display_name,
                    profile.avatar_object_key, profile.avatar_external_url,
                    profile.home_city, profile.bio, profile.updated_at
             FROM platform_profiles profile
             JOIN platform_accounts account ON account.id = profile.account_id
             WHERE (profile.uid::text = ? OR profile.page_slug = ? OR profile.account_id = ?)
               AND account.status IN ('active', 'restricted')
               AND account.deleted_at IS NULL`,
            [handle, handle, handle]
        );
    }

    async listPlatformAccountLinks(
        accountId: string
    ): Promise<PlatformAccountLinkRecord[]> {
        return queryAll<PlatformAccountLinkRecord>(
            this.database,
            `SELECT entry.kind_id, kind.name, kind.group_key, entry.value,
                    entry.username, kind.base_url, kind.color, kind.icon,
                    kind.icon_object_key
             FROM platform_account_entries entry
             JOIN platform_account_kinds kind ON kind.id = entry.kind_id
             WHERE entry.account_id = ? AND kind.enabled
             ORDER BY kind.display_order, kind.id`,
            [accountId]
        );
    }

    async upsertPlatformAccountKind(input: PlatformAccountKindRecord): Promise<void> {
        await executeSql(
            this.database,
            `INSERT INTO platform_account_kinds
                (id, name, group_key, pattern, base_url, color, icon,
                 display_order, enabled, uppercase, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, now()::text, now()::text)
             ON CONFLICT (id) DO UPDATE SET
                name = EXCLUDED.name,
                group_key = EXCLUDED.group_key,
                pattern = EXCLUDED.pattern,
                base_url = EXCLUDED.base_url,
                color = EXCLUDED.color,
                icon = EXCLUDED.icon,
                display_order = EXCLUDED.display_order,
                enabled = EXCLUDED.enabled,
                uppercase = EXCLUDED.uppercase,
                updated_at = now()::text`,
            [
                input.id,
                input.name,
                input.group_key,
                input.pattern,
                input.base_url,
                input.color,
                input.icon,
                input.display_order,
                input.enabled,
                input.uppercase,
            ]
        );
    }

    async setPlatformAccountKindIcon(id: string, key: string | null): Promise<boolean> {
        const row = await queryOne<{ updated: number }>(
            this.database,
            `WITH gone AS (
                UPDATE platform_account_kinds
                SET icon_object_key = ?, updated_at = now()::text
                WHERE id = ?
                RETURNING 1
             )
             SELECT CAST(COUNT(*) AS INTEGER) AS updated FROM gone`,
            [key, id]
        );
        return Number(row?.updated ?? 0) > 0;
    }

    async deletePlatformAccountKind(id: string): Promise<boolean> {
        const row = await queryOne<{ removed: number }>(
            this.database,
            `WITH gone AS (DELETE FROM platform_account_kinds WHERE id = ? RETURNING 1)
             SELECT CAST(COUNT(*) AS INTEGER) AS removed FROM gone`,
            [id]
        );
        return Number(row?.removed ?? 0) > 0;
    }

    async listPlatformAccountKinds(): Promise<PlatformAccountKindRecord[]> {
        return queryAll<PlatformAccountKindRecord>(
            this.database,
            `SELECT id, name, group_key, pattern, base_url, color, icon,
                    display_order, enabled, uppercase, icon_object_key, updated_at
             FROM platform_account_kinds
             ORDER BY display_order, id`
        );
    }

    async listPlatformAccountEntries(
        accountId: string
    ): Promise<PlatformAccountEntryRecord[]> {
        return queryAll<PlatformAccountEntryRecord>(
            this.database,
            `SELECT kind_id, value, username FROM platform_account_entries
             WHERE account_id=? ORDER BY kind_id`,
            [accountId]
        );
    }

    async upsertPlatformAccountEntry(input: {
        accountId: string;
        kindId: string;
        value: string;
        username?: string | null;
        at: string;
    }): Promise<void> {
        await executeSql(
            this.database,
            `INSERT INTO platform_account_entries
                 (account_id, kind_id, value, username, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?)
             ON CONFLICT (account_id, kind_id)
             DO UPDATE SET value=excluded.value, username=excluded.username,
                           updated_at=excluded.updated_at`,
            [
                input.accountId,
                input.kindId,
                input.value,
                input.username ?? null,
                input.at,
                input.at,
            ]
        );
    }

    async deletePlatformAccountEntry(
        accountId: string,
        kindId: string
    ): Promise<number> {
        const row = await queryOne<{ removed: number }>(
            this.database,
            `WITH gone AS (
                 DELETE FROM platform_account_entries
                 WHERE account_id=? AND kind_id=?
                 RETURNING 1
             )
             SELECT CAST(COUNT(*) AS INTEGER) AS removed FROM gone`,
            [accountId, kindId]
        );
        return row?.removed ?? 0;
    }

    async listAdminCards(limit: number, offset: number, filter?: NamecardAdminFilter): Promise<NamecardSubmissionRecord[]> {
        const where = namecardAdminWhere(filter);
        const rows = await queryAll<NamecardCardRow>(this.database,
            `SELECT ${NAMECARD_COLUMNS} FROM fudaba_cards
             WHERE ${where.sql}
             ORDER BY CASE
                          WHEN publication_status IN ('pending', 'approving') OR review_status = 'pending' THEN 0
                          WHEN publication_status = 'published' THEN 1
                          WHEN publication_status = 'rejected' THEN 2
                          WHEN publication_status = 'locked' THEN 3
                          WHEN publication_status = 'hidden' THEN 4
                          ELSE 5
                      END,
                      CASE WHEN publication_status IN ('pending', 'approving') OR review_status = 'pending'
                           THEN COALESCE(review_submitted_at, created_at) END ASC NULLS LAST,
                      card_number DESC
             LIMIT ? OFFSET ?`,
            [...where.values, limit, offset]
        );
        return this.attachNamecardFavorites(this.database, rows);
    }

    /**
     * Both sides of the review queue: the published copy the wall serves and
     * the revision waiting for a verdict. The public read path never needs
     * this, so it stays a separate query instead of widening every list row.
     */
    async findCardDiff(cardNumber: number): Promise<NamecardDiffRecord | null> {
        const row = await queryOne<NamecardCardRow>(this.database,
            `SELECT ${NAMECARD_COLUMNS} FROM fudaba_cards
             WHERE card_number=? AND deleted_at IS NULL`,
            [cardNumber]
        );
        if (!row) return null;
        const cardId = row.internal_id;
        const [favorites, series, credits] = await Promise.all([
            this.listNamecardFavorites(this.database, [cardId]),
            this.listNamecardSeries(this.database, [cardId]),
            this.listNamecardCredits(this.database, [cardId])
        ]);
        const live: NamecardDiffSide = {
            producerName: row.producer_name ?? null,
            producerReading: row.producer_reading ?? null,
            groupName: row.group_name ?? null,
            isGroupCard: row.is_group_card === true,
            madeOn: row.made_on ?? null,
            bio: row.bio ?? null,
            tradeNote: row.trade_note ?? null,
            isOriginal: row.is_original === true,
            madeWithAi: row.made_with_ai === true,
            visible: row.visible === true,
            exchangeMode: this.exchangeMode(row.exchange_mode),
            seriesCodes: series.get(cardId) ?? [],
            credits: credits.get(cardId) ?? [],
            favoriteCharacters: favorites.get(cardId) ?? [],
        };
        const payload =
            row.review_status === 'pending' ||
            row.review_status === 'rejected' ||
            row.review_status === 'locked'
                ? pendingNamecardPayload(row.pending_payload)
                : null;
        const ownerAccountId = row.owner_account_id ?? null;
        return {
            id: Number(row.card_number),
            status: toLegacyNamecardStatus(row.publication_status),
            publicationStatus: row.publication_status as NamecardDiffRecord['publicationStatus'],
            reviewStatus: toNamecardReviewStatus(row.review_status),
            revision: Number(row.revision),
            ownerAccountId,
            ownerDisplayName: ownerAccountId
                ? await this.accountLabel(this.database, ownerAccountId)
                : null,
            lockReason: row.lock_reason ?? null,
            reviewReason: row.review_reason ?? null,
            live,
            pending: payload ? await this.pendingDiffSide(row, payload) : null
        };
    }

    /** Live middle-page keys in display order. */
    private async listMiddleKeys(
        cardId: string,
        queue: 'live' | 'pending' = 'live'
    ): Promise<string[]> {
        const stored = await queryAll<{
            page_id: string;
            object_version: string;
            object_queue?: 'live' | 'pending';
        }>(this.database,
            `SELECT page_id, object_version, object_queue FROM public.fudaba_card_pages
             WHERE card_id=? AND queue=? ORDER BY display_order`,
            [cardId, queue]
        );
        return stored
            .slice(1, -1)
            .map((row) =>
                cardPageObjectKey(
                    cardId,
                    row.object_queue ?? queue,
                    row.page_id,
                    row.object_version
                )
            );
    }

    /** The object key behind one page of a card's artwork. */
    findCardMediaKey(
        cardNumber: number,
        side: string,
        draft: boolean
    ): Promise<string | null> {
        return this.cardMediaKey(cardNumber, side, draft, false);
    }

    /** The same key, but only for a card the wall may show publicly. */
    async findPublishedCardPageKey(
        cardNumber: number,
        pageId: string
    ): Promise<string | null> {
        const row = await queryOne<{
            card_id: string;
            object_version: string;
            object_queue?: 'live' | 'pending';
        }>(
            this.database,
            `SELECT card.id AS card_id, page.object_version, page.object_queue
               FROM fudaba_cards card
               JOIN fudaba_card_pages page
                 ON page.card_id=card.id AND page.queue='live' AND page.page_id=?
              WHERE card.card_number=? AND card.deleted_at IS NULL
                AND card.publication_status='published'
              LIMIT 1`,
            [pageId, cardNumber]
        );
        if (!row) return null;
        return cardPageObjectKey(
            row.card_id,
            row.object_queue ?? 'live',
            pageId,
            row.object_version
        );
    }

    private async cardMediaKey(
        cardNumber: number,
        side: string,
        draft: boolean,
        publishedOnly: boolean
    ): Promise<string | null> {
        const row = await queryOne<NamecardCardRow>(this.database,
            `SELECT ${NAMECARD_COLUMNS} FROM fudaba_cards
             WHERE card_number=? AND deleted_at IS NULL${
                publishedOnly ? " AND publication_status='published'" : ''
             }`,
            [cardNumber]
        );
        if (!row) return null;
        // 统一布局的稳定槽位：按 draft 选择 live/pending 队列。
        if (/^page-[0-9a-f-]{8,}$/.test(side)) {
            const page = await queryOne<{
                card_id: string;
                object_version: string;
                object_queue?: 'live' | 'pending';
            }>(
                this.database,
                `SELECT page.card_id, page.object_version, page.object_queue
                   FROM fudaba_card_pages page
                   JOIN fudaba_cards card ON card.id=page.card_id
                  WHERE card.card_number=? AND card.deleted_at IS NULL
                    AND page.page_id=? AND page.queue=?${
                        publishedOnly
                            ? " AND card.publication_status='published'"
                            : ''
                    }
                  LIMIT 1`,
                [cardNumber, side, draft ? 'pending' : 'live']
            );
            if (!page) return null;
            return cardPageObjectKey(
                page.card_id,
                page.object_queue ?? (draft ? 'pending' : 'live'),
                side,
                page.object_version
            );
        }
        // 页面行优先：正反面与中间页都按稳定槽位取版本；页面行是唯一来源。
        const middle = /^middle-(\d{1,2})$/.exec(side);
        const queue = draft ? 'pending' : 'live';
        if ((side === 'front' || side === 'back') && row.internal_id) {
            const page = await queryOne<{
                object_version: string;
                object_queue?: 'live' | 'pending';
            }>(
                this.database,
                `SELECT object_version, object_queue FROM public.fudaba_card_pages
                  WHERE card_id=? AND queue=? AND page_id=?`,
                [row.internal_id, queue, side]
            );
            if (page) {
                return cardPageObjectKey(
                    row.internal_id,
                    page.object_queue ?? queue,
                    side,
                    page.object_version
                );
            }
            // 统一页面布局的正面/背面使用稳定的 page-* 行；管理员入口仍按
            // front/back 取图，缺少同名行时按该队列的页序解析首/末页。
            const pages = await queryAll<{
                page_id: string;
                object_version: string;
                object_queue?: 'live' | 'pending';
            }>(
                this.database,
                `SELECT page_id, object_version, object_queue
                   FROM public.fudaba_card_pages
                  WHERE card_id=? AND queue=?
                  ORDER BY display_order ASC`,
                [row.internal_id, queue]
            );
            const edge = side === 'front'
                ? pages[0]
                : pages[pages.length - 1];
            if (edge && (side === 'front' || pages.length > 1)) {
                return cardPageObjectKey(
                    row.internal_id,
                    edge.object_queue ?? queue,
                    edge.page_id,
                    edge.object_version
                );
            }
            return null;
        }
        if (!middle) return null;
        // A staged revision owns its whole page set: indexing the live pages
        // would serve a page the reviewer cannot see in the diff.
        const keys = await this.listMiddleKeys(
            row.internal_id,
            draft ? 'pending' : 'live'
        );
        return keys[Number(middle[1]) - 1] ?? null;
    }

    private exchangeMode(value: unknown): 'auto' | 'manual' | 'none' {
        return value === 'auto' || value === 'manual' ? value : 'none';
    }

    private async pendingDiffSide(
        row: NamecardCardRow,
        payload: NamecardPendingPayload
    ): Promise<NamecardDiffSide> {
        const ids = payload.favorite_character_ids ?? [];
        return {
            producerName: payload.producer_name ?? row.producer_name ?? null,
            producerReading: this.payloadText(payload, 'producer_reading', row.producer_reading),
            groupName: this.payloadText(payload, 'group_name', row.group_name),
            isGroupCard: payload.is_group_card ?? row.is_group_card === true,
            madeOn: this.payloadText(payload, 'made_on', row.made_on),
            bio: this.payloadText(payload, 'bio', row.bio),
            tradeNote: this.payloadText(payload, 'trade_note', row.trade_note),
            isOriginal: payload.is_original ?? row.is_original === true,
            madeWithAi: payload.made_with_ai ?? row.made_with_ai === true,
            visible: payload.visible ?? row.visible === true,
            exchangeMode: this.exchangeMode(payload.exchange_mode ?? row.exchange_mode),
            seriesCodes: payload.series_codes ?? [],
            credits: payload.credits ?? [],
            favoriteCharacters: await this.listCharacterSelections(this.database, ids),
        };
    }

    /** A submitted revision is authoritative, including when it clears a field. */
    private payloadText(
        payload: NamecardPendingPayload,
        key: 'producer_reading' | 'group_name' | 'made_on' | 'bio' | 'trade_note',
        fallback: string | null | undefined
    ): string | null {
        if (key in payload) return payload[key] ?? null;
        return fallback ?? null;
    }

    /** Character names for a submitted selection, kept in submission order. */
    private async listCharacterSelections(
        database: SqlDatabase,
        ids: readonly number[]
    ): Promise<CardFavoriteSelectionRecord[]> {
        if (!ids.length) return [];
        const placeholders = ids.map(() => '?').join(', ');
        const rows = await queryAll<NamecardFavoriteRow>(database,
            `SELECT character.id AS character_id, agency.code AS agency_code,
                    character.name_cn
             FROM namecard_characters character
             JOIN agencies agency ON agency.id=character.agency_id
             WHERE character.id IN (${placeholders})`,
            [...ids]
        );
        const byId = new Map(rows.map((row) => [Number(row.character_id), row]));
        return ids.flatMap((id, index) => {
            const row = byId.get(id);
            return row
                ? [{
                    character_id: id,
                    agency_code: row.agency_code,
                    name_cn: row.name_cn,
                    display_order: index
                }]
                : [];
        });
    }

    async beginCardApproval(
        id: number,
        expectedRevision: number
    ): Promise<NamecardApprovalClaim> {
        const claimedRow = await queryOne<NamecardCardRow>(this.database,
            `UPDATE fudaba_cards
             SET publication_status=CASE WHEN publication_status='pending'
                     THEN 'approving' ELSE publication_status END,
                 revision=revision+1, updated_at=CURRENT_TIMESTAMP
             WHERE card_number=? AND revision=? AND deleted_at IS NULL
               AND (publication_status='pending' OR review_status='pending')
             RETURNING ${NAMECARD_COLUMNS}`,
            [id, expectedRevision]
        );
        const claimed = await this.attachOneNamecard(this.database, claimedRow);
        if (claimed) return { status: 'claimed', card: claimed };
        const current = await this.findSubmission(id);
        if (!current) return { status: 'not-found' };
        // 与 P2 共用同一张状态机。`status` 是旧投影（`approving` 读作 `pending`），
        // 上一节认领失败留下的正是这种行：用最新 revision 重试要能续做，否则它永远
        // 无法再通过。
        const retry = classifyNamecardReviewRetry(
            {
                publicationStatus: current.status,
                reviewStatus: current.reviewStatus ?? null,
                revision: current.revision
            },
            expectedRevision
        );
        if (retry === 'withdrawn') {
            return { status: 'withdrawn', revision: current.revision };
        }
        if (retry === 'resumed') return { status: 'resumed', card: current };
        return { status: 'conflict', revision: current.revision };
    }

    async completeCardApproval(
        id: number,
        approvingRevision: number
    ): Promise<NamecardMutationResult> {
        return this.database.transaction(async (database) => {
            const claimedRow = await queryOne<NamecardCardRow & { owner_account_id?: string | null }>(database,
                `SELECT ${NAMECARD_COLUMNS}, owner_account_id FROM fudaba_cards
                 WHERE card_number=? AND revision=? AND deleted_at IS NULL
                   AND (publication_status='approving'
                        OR (review_status='pending' AND publication_status='published'))
                 FOR UPDATE`,
                [id, approvingRevision]
            );
            let updatedRow: (NamecardCardRow & { owner_account_id?: string | null }) | null = null;
            if (claimedRow) {
                // 判定走共享状态机：待审改版要把整份改版提升上线，首投只改卡片状态。
                const plan = planNamecardReview(
                    {
                        publicationStatus: claimedRow.publication_status,
                        reviewStatus: claimedRow.review_status ?? null
                    },
                    'publish'
                );
                if (plan.allowed && plan.promotesPages) {
                    await this.publishNamecardRevision(
                        database,
                        claimedRow,
                        pendingNamecardPayload(claimedRow.pending_payload)
                    );
                } else {
                    await executeSql(database,
                        `UPDATE fudaba_cards
                         SET publication_status='published', rejection_reason=NULL,
                             revision=revision+1, updated_at=CURRENT_TIMESTAMP
                         WHERE id=?`,
                        [claimedRow.internal_id]
                    );
                }
                updatedRow = await queryOne<NamecardCardRow & { owner_account_id?: string | null }>(database,
                    `SELECT ${NAMECARD_COLUMNS}, owner_account_id FROM fudaba_cards WHERE id=?`,
                    [claimedRow.internal_id]
                );
            }
            const updated = await this.attachOneNamecard(database, updatedRow);
            if (updated) {
                if (updatedRow?.owner_account_id) {
                    await insertNamecardNotification(database, {
                        recipientAccountId: String(updatedRow.owner_account_id),
                        cardNumber: id,
                        ...cardApprovedCopy(id)
                    });
                }
                return { status: 'updated', card: updated };
            }
            const current = await this.findSubmission(id, database);
            if (!current) return { status: 'not-found' };
            if (current.status === 'approved' && current.revision === approvingRevision + 1) {
                return { status: 'updated', card: current };
            }
            return { status: 'conflict', revision: current.revision };
        });
    }

    /**
     * Rebinds the live page rows to the surface the reviewer approved. The
     * pending queue holds the complete revised page set, so promoting it
     * replaces the live rows wholesale; approval has already published every
     * staged object under the live prefix, so `object_queue` becomes `live`.
     */
    private async promoteNamecardPages(
        database: SqlDatabase,
        row: NamecardCardRow
    ): Promise<void> {
        const pending = await queryAll<{
            page_id: string;
            object_version: string;
            width: number;
            height: number;
        }>(
            database,
            `SELECT page_id, object_version, width, height
               FROM public.fudaba_card_pages
              WHERE card_id=? AND queue='pending'
              ORDER BY display_order`,
            [row.internal_id]
        );
        if (pending.length === 0) return;
        await executeSql(
            database,
            `DELETE FROM public.fudaba_card_pages
              WHERE card_id=? AND queue='live'`,
            [row.internal_id]
        );
        for (const [index, page] of pending.entries()) {
            await executeSql(
                database,
                `INSERT INTO public.fudaba_card_pages
                 (card_id, queue, page_id, display_order, object_version,
                  object_queue, width, height, created_at, updated_at)
                 VALUES (?, 'live', ?, ?, ?, 'live', ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                 ON CONFLICT (card_id, queue, page_id) DO UPDATE SET
                   display_order=EXCLUDED.display_order,
                   object_version=EXCLUDED.object_version,
                   object_queue='live',
                   width=EXCLUDED.width, height=EXCLUDED.height,
                   updated_at=CURRENT_TIMESTAMP`,
                [
                    row.internal_id,
                    page.page_id,
                    index + 1,
                    page.object_version,
                    page.width,
                    page.height
                ]
            );
        }
        await executeSql(
            database,
            `DELETE FROM public.fudaba_card_pages
              WHERE card_id=? AND queue='pending'`,
            [row.internal_id]
        );
    }

    /**
     * Promotes the submitted revision into the live row and page set.
     * Favourites are rewritten from the submitted ids; a character deleted in
     * the meantime drops out instead of blocking the publication.
     */
    private async publishNamecardRevision(
        database: SqlDatabase,
        row: NamecardCardRow,
        payload: NamecardPendingPayload | null
    ): Promise<void> {
        // Text columns that the author may clear need a flag instead of
        // COALESCE: a submitted revision is authoritative even when it is empty.
        const hasPayload = payload !== null
        const nextProducerName =
            payload?.producer_name ?? row.producer_name ?? null;
        const nextProducerReading = hasPayload
            ? payload?.producer_reading ?? null
            : row.producer_reading ?? null;
        const sort = namecardSortKey(nextProducerName, nextProducerReading);
        await executeSql(database,
            `UPDATE fudaba_cards
             SET producer_name=?,
                 producer_reading=CASE WHEN ? THEN ? ELSE producer_reading END,
                 sort_name_key=?, sort_name_bucket=?,
                 bio=CASE WHEN ? THEN ? ELSE bio END,
                 trade_note=CASE WHEN ? THEN ? ELSE trade_note END,
                 made_on=COALESCE(?, made_on), group_name=COALESCE(?, group_name),
                 is_original=COALESCE(?, is_original),
                 made_with_ai=COALESCE(?, made_with_ai),
                 visible=COALESCE(?, visible),
                 is_group_card=COALESCE(?, is_group_card),
                 exchange_mode=COALESCE(?, exchange_mode),
                 publication_status='published', rejection_reason=NULL,
                 review_status=NULL, review_reason=NULL, review_submitted_at=NULL,
                 pending_payload=NULL,
                 revision=revision+1, updated_at=CURRENT_TIMESTAMP
             WHERE id=?`,
            [
                nextProducerName,
                hasPayload,
                payload?.producer_reading ?? null,
                sort.key,
                sort.bucket,
                hasPayload,
                payload?.bio ?? null,
                hasPayload,
                payload?.trade_note ?? null,
                payload?.made_on ?? null,
                payload?.group_name ?? null,
                payload?.is_original ?? null,
                payload?.made_with_ai ?? null,
                payload?.visible ?? null,
                payload?.is_group_card ?? null,
                payload?.exchange_mode ?? null,
                row.internal_id
            ]
        );
        // 已发布卡的修订可能只暂存新增/替换的页，live 页仍要保留。按修订的
        // 完整面序列重建 live 页集：pending 行提供新版本，其余沿用 live 行。
        await this.promoteNamecardPages(database, row);
        if (payload) {
            await this.replaceNamecardCredits(
                database,
                row.internal_id,
                payload.credits ?? []
            )
        }
        const seriesCodes = (payload?.series_codes ?? []).filter(
            (code) => typeof code === 'string' && code.length > 0
        );
        if (seriesCodes.length) {
            await executeSql(database,
                'DELETE FROM fudaba_card_series WHERE card_id=?',
                [row.internal_id]
            );
            for (const [index, seriesCode] of seriesCodes.entries()) {
                await executeSql(database,
                    `INSERT INTO fudaba_card_series (card_id, series_code, display_order)
                     VALUES (?, ?, ?)
                     ON CONFLICT (card_id, series_code) DO NOTHING`,
                    [row.internal_id, seriesCode, index + 1]
                );
            }
            // A sampled colour always wins; otherwise one series lends its
            // agency colour and a set stays neutral.
            const singleSeries = seriesCodes.length === 1;
            await executeSql(database,
                `UPDATE fudaba_cards SET
                     accent=CASE WHEN ? THEN COALESCE(
                         (SELECT color FROM agencies WHERE code=?),
                         CAST(? AS text), accent)
                     ELSE CAST(? AS text) END,
                     accent_source=CASE WHEN ? THEN 'series' ELSE 'fallback' END
                 WHERE id=? AND (accent_source IS NULL OR accent_source<>'image')`,
                [
                    singleSeries,
                    seriesCodes[0],
                    NAMECARD_ACCENT_FALLBACK,
                    NAMECARD_ACCENT_FALLBACK,
                    singleSeries,
                    row.internal_id,
                ]
            );
        }
        const characterIds = (payload?.favorite_character_ids ?? []).filter(
            (characterId) => Number.isSafeInteger(characterId) && characterId > 0
        );
        if (!characterIds.length) return;
        await executeSql(database,
            'DELETE FROM fudaba_card_favorite_characters WHERE card_id=?',
            [row.internal_id]
        );
        await executeSql(database,
            `INSERT INTO fudaba_card_favorite_characters (card_id, character_id, display_order)
             SELECT ?, character.id, ? FROM namecard_characters character
             WHERE character.id=? AND character.deleted_at IS NULL`,
            [row.internal_id, 0, characterIds[0]]
        ).catch(() => undefined);
        for (let index = 1; index < characterIds.length; index += 1) {
            await executeSql(database,
                `INSERT INTO fudaba_card_favorite_characters (card_id, character_id, display_order)
                 SELECT ?, character.id, ? FROM namecard_characters character
                 WHERE character.id=? AND character.deleted_at IS NULL`,
                [row.internal_id, index, characterIds[index]]
            ).catch(() => undefined);
        }
    }


    /** Locking appends the decision; relocking refreshes the same row. */
    /**
     * The audit trail is append-only: both locking and releasing the card leave
     * their own row, so the console can show how a card arrived at a state.
     */
    private async appendNamecardLockRecord(
        database: SqlDatabase,
        cardId: string,
        action: NamecardLockAuditAction,
        reason: string | null,
        actor: string | null
    ): Promise<void> {
        await executeSql(database,
            `INSERT INTO namecard_lock_records (card_id, action, reason, handled_by, occurred_at)
             VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
            [cardId, action, reason?.trim() || null, actor]
        );
    }

    private async countAuditAccounts(
        sql: string,
        accountIds: readonly string[]
    ): Promise<Record<string, number>> {
        if (accountIds.length === 0) return {};
        const placeholders = accountIds.map(() => '?').join(', ');
        const rows = await queryAll<{ account_id: string | null; total: number | string }>(
            this.database,
            sql.replace('__ID_LIST__', placeholders),
            accountIds
        );
        const totals: Record<string, number> = {};
        for (const row of rows) {
            if (row.account_id) totals[row.account_id] = Number(row.total);
        }
        return totals;
    }

    private async replaceNamecardCredits(
        database: SqlDatabase,
        cardId: string,
        credits: readonly FudabaCardCredit[]
    ): Promise<void> {
        await executeSql(database,
            'DELETE FROM fudaba_card_credits WHERE card_id=?',
            [cardId]
        );
        for (const [index, credit] of credits.entries()) {
            if (!credit.displayName.trim()) continue;
            await executeSql(database,
                `INSERT INTO fudaba_card_credits
                 (card_id, display_order, account_id, display_name, url, roles)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [
                    cardId,
                    index + 1,
                    credit.accountId ?? null,
                    credit.displayName,
                    credit.url ?? null,
                    credit.roles
                ]
            );
        }
    }


    /**
     * The lock audit answers "which cards are locked right now", so unlocking
     * deletes the row that produced it.
     */
    async listNamecardLockAudit(
        filter: NamecardLockAuditFilter
    ): Promise<NamecardLockAuditPage> {
        const where = ['card.deleted_at IS NULL'];
        const values: unknown[] = [];
        if (filter.owner) {
            where.push('(owner_profile.display_name ILIKE ? OR card.owner_account_id ILIKE ?)');
            values.push(`%${filter.owner}%`, `%${filter.owner}%`);
        }
        if (filter.reason) {
            where.push('record.reason ILIKE ?');
            values.push(`%${filter.reason}%`);
        }
        if (filter.handler) {
            where.push('record.handled_by ILIKE ?');
            values.push(`%${filter.handler}%`);
        }
        if (filter.action) {
            where.push('record.action = ?');
            values.push(filter.action);
        }
        const source = `FROM namecard_lock_records record
             JOIN fudaba_cards card ON card.id=record.card_id
             LEFT JOIN platform_accounts owner ON owner.id=card.owner_account_id
             LEFT JOIN platform_profiles owner_profile ON owner_profile.account_id=owner.id
             WHERE ${where.join(' AND ')}`;
        const [rows, totalRow] = await Promise.all([
            queryAll<NamecardLockAuditRow>(this.database,
                `SELECT record.id, record.action, record.reason, record.handled_by,
                        record.occurred_at,
                        card.card_number, card.producer_name, card.owner_account_id,
                        owner_profile.display_name AS owner_name
                 ${source}
                 ORDER BY record.occurred_at DESC, record.id DESC
                 LIMIT ? OFFSET ?`,
                [...values, filter.pageSize, (filter.page - 1) * filter.pageSize]
            ),
            queryOne<{ total: number | string }>(this.database,
                `SELECT count(*) AS total ${source}`,
                values
            )
        ]);
        const ownerIds = rows
            .map((row) => row.owner_account_id)
            .filter((id): id is string => Boolean(id));
        const ownerTotals = await this.countAuditAccounts(
            `SELECT card.owner_account_id AS account_id, count(*)::int AS total
             FROM namecard_lock_records record
             JOIN fudaba_cards card ON card.id=record.card_id
             WHERE card.deleted_at IS NULL AND card.owner_account_id IN (__ID_LIST__)
             GROUP BY card.owner_account_id`,
            [...new Set(ownerIds)]
        );
        return {
            rows: rows.map((row) => ({
                id: Number(row.id),
                cardNumber: Number(row.card_number),
                producerName: row.producer_name,
                ownerAccountId: row.owner_account_id,
                ownerName: row.owner_account_id
                    ? (row.owner_name?.trim() || row.owner_account_id)
                    : null,
                action: row.action,
                reason: row.reason,
                handledBy: row.handled_by,
                occurredAt: new Date(row.occurred_at).toISOString()
            })),
            total: Number(totalRow?.total ?? 0),
            ownerTotals
        };
    }

    /** Reports leave the queue once they carry a verdict. */
    async listNamecardFeedbackAudit(
        filter: NamecardFeedbackAuditFilter
    ): Promise<NamecardFeedbackAuditPage> {
        const where = ["card.deleted_at IS NULL", "record.status <> 'pending'"];
        const values: unknown[] = [];
        if (filter.owner) {
            where.push('(owner_profile.display_name ILIKE ? OR card.owner_account_id ILIKE ?)');
            values.push(`%${filter.owner}%`, `%${filter.owner}%`);
        }
        if (filter.reporter) {
            where.push('(reporter_profile.display_name ILIKE ? OR record.reporter_account_id ILIKE ?)');
            values.push(`%${filter.reporter}%`, `%${filter.reporter}%`);
        }
        if (filter.outcome) {
            where.push('record.status=?');
            values.push(filter.outcome);
        }
        if (filter.handler) {
            where.push('record.handled_by ILIKE ?');
            values.push(`%${filter.handler}%`);
        }
        const source = `FROM namecard_feedback record
             JOIN fudaba_cards card ON card.id=record.card_id
             LEFT JOIN platform_accounts owner ON owner.id=card.owner_account_id
             LEFT JOIN platform_profiles owner_profile ON owner_profile.account_id=owner.id
             LEFT JOIN platform_profiles reporter_profile ON reporter_profile.account_id=record.reporter_account_id
             WHERE ${where.join(' AND ')}`;
        const [rows, totalRow] = await Promise.all([
            queryAll<NamecardFeedbackAuditRow>(this.database,
                `SELECT record.id, record.reason, record.status, record.handled_by,
                        record.handled_at, card.card_number, card.producer_name,
                        card.owner_account_id, owner_profile.display_name AS owner_name,
                        record.reporter_account_id, reporter_profile.display_name AS reporter_name
                 ${source}
                 ORDER BY record.handled_at DESC NULLS LAST, record.id DESC
                 LIMIT ? OFFSET ?`,
                [...values, filter.pageSize, (filter.page - 1) * filter.pageSize]
            ),
            queryOne<{ total: number | string }>(this.database,
                `SELECT count(*) AS total ${source}`,
                values
            )
        ]);
        const ownerIds = rows
            .map((row) => row.owner_account_id)
            .filter((id): id is string => Boolean(id));
        const reporterIds = rows.map((row) => row.reporter_account_id);
        const [ownerTotals, reporterTotals] = await Promise.all([
            this.countAuditAccounts(
                `SELECT card.owner_account_id AS account_id, count(*)::int AS total
                 FROM namecard_feedback record
                 JOIN fudaba_cards card ON card.id=record.card_id
                 WHERE card.deleted_at IS NULL AND record.status <> 'pending'
                   AND card.owner_account_id IN (__ID_LIST__)
                 GROUP BY card.owner_account_id`,
                [...new Set(ownerIds)]
            ),
            this.countAuditAccounts(
                `SELECT record.reporter_account_id AS account_id, count(*)::int AS total
                 FROM namecard_feedback record
                 JOIN fudaba_cards card ON card.id=record.card_id
                 WHERE card.deleted_at IS NULL AND record.status <> 'pending'
                   AND record.reporter_account_id IN (__ID_LIST__)
                 GROUP BY record.reporter_account_id`,
                [...new Set(reporterIds)]
            )
        ]);
        return {
            rows: rows.map((row) => ({
                id: Number(row.id),
                cardNumber: Number(row.card_number),
                producerName: row.producer_name,
                ownerAccountId: row.owner_account_id,
                ownerName: row.owner_account_id
                    ? (row.owner_name?.trim() || row.owner_account_id)
                    : null,
                reporterAccountId: row.reporter_account_id,
                reporterName: row.reporter_name?.trim() || row.reporter_account_id,
                reason: row.reason,
                outcome: row.status === 'accepted' ? 'accepted' : 'rejected',
                handledBy: row.handled_by,
                handledAt: row.handled_at ? new Date(row.handled_at).toISOString() : null
            })),
            total: Number(totalRow?.total ?? 0),
            ownerTotals,
            reporterTotals
        };
    }

    async findCardMedia(id: number): Promise<CardMediaRecord | null> {
        return this.findSubmission(id);
    }


    /**
     * Backoffice management rewrites the live card in one shot: the fields the
     * owner editor owns, the artwork order over existing pages, both review
     * columns and the owner. Everything else (accent, first publication, review
     * queue payload) is left to the flows that already own it.
     */
    async findAdminCardArtwork(cardNumber: number) {
        const row = await queryOne<NamecardCardRow>(this.database,
            `SELECT ${NAMECARD_COLUMNS} FROM fudaba_cards
             WHERE card_number=? AND deleted_at IS NULL`,
            [cardNumber]
        );
        if (!row) return null;
        const pages = (await this.listNamecardPages(this.database, [row.internal_id]))
            .get(row.internal_id) ?? NO_PAGE_KEYS;
        // 待审页集是完整快照：管理窗旋转看到的就是它；没有待审页时才看线上页。
        const staged = pages.pending.length > 0;
        const artwork = artworkKeysFrom(staged ? pages.pending : pages.live);
        return {
            cardId: row.internal_id,
            staged,
            // 没有页面行时这张卡没有可旋转的图片，槽位留空。
            frontObjectKey: artwork?.front ?? '',
            backObjectKey: artwork?.back ?? null,
            middleObjectKeys: artwork?.middle ?? []
        };
    }

    async updateCardAsAdmin(
        input: NamecardAdminUpdateInput
    ): Promise<NamecardAdminUpdateResult> {
        return this.database.transaction(async (database) => {
            const current = await queryOne<NamecardCardRow>(database,
                `SELECT ${NAMECARD_COLUMNS} FROM fudaba_cards
                 WHERE card_number=? AND deleted_at IS NULL
                 FOR UPDATE`,
                [input.cardNumber]
            );
            if (!current) return { status: 'not-found' };
            const cardId = current.internal_id;
            const revision = Number(current.revision);
            if (revision !== input.expectedRevision) {
                return { status: 'conflict', revision };
            }
            if (input.versionOnly) {
                if (input.reviewStatus !== null) {
                    const currentReview = toNamecardReviewStatus(
                        current.review_status
                    );
                    if (!currentReview) {
                        return {
                            status: 'blocked',
                            message: '版本状态只能单独清除待审版本'
                        };
                    }
                    if (input.reviewStatus === currentReview) {
                        return {
                            status: 'updated',
                            revision,
                            changedFields: [],
                            ownerChange: null
                        };
                    }
                    const reason = input.reason?.trim() ?? '';
                    if (!reason.length) {
                        return { status: 'reason-required' };
                    }
                    const updated = await queryOne<NamecardCardRow>(
                        database,
                        `UPDATE fudaba_cards SET
                             review_status=?,
                             review_reason=?,
                             revision=revision+1,
                             updated_at=?
                         WHERE card_number=? AND revision=? AND deleted_at IS NULL
                         RETURNING ${NAMECARD_COLUMNS}`,
                        [
                            input.reviewStatus,
                            input.reviewStatus === 'pending' ? null : reason,
                            input.updatedAt,
                            input.cardNumber,
                            input.expectedRevision
                        ]
                    );
                    if (!updated) return { status: 'conflict', revision };
                    return {
                        status: 'updated',
                        revision: revision + 1,
                        changedFields: [
                            {
                                label: '版本状态',
                                before: currentReview,
                                after: input.reviewStatus
                            }
                        ],
                        ownerChange: null
                    };
                }
                const updated = await queryOne<NamecardCardRow>(
                    database,
                    `UPDATE fudaba_cards SET
                         review_status=NULL,
                         review_reason=NULL,
                         review_submitted_at=NULL,
                         pending_payload=NULL,
                         revision=revision+1,
                         updated_at=?
                     WHERE card_number=? AND revision=? AND deleted_at IS NULL
                     RETURNING ${NAMECARD_COLUMNS}`,
                    [input.updatedAt, input.cardNumber, input.expectedRevision]
                );
                if (!updated) return { status: 'conflict', revision };
                await executeSql(
                    database,
                    `DELETE FROM fudaba_card_pages
                      WHERE card_id=? AND queue='pending'`,
                    [current.internal_id]
                );
                return {
                    status: 'updated',
                    revision: revision + 1,
                    changedFields: [
                        {
                            label: '版本状态',
                            before: current.review_status ?? null,
                            after: null
                        }
                    ],
                    ownerChange: null
                };
            }
            const [seriesMap, creditsMap, favoritesMap, pageKeys] = await Promise.all([
                this.listNamecardSeries(database, [cardId]),
                this.listNamecardCredits(database, [cardId]),
                this.listNamecardFavorites(database, [cardId]),
                this.listNamecardPages(database, [cardId])
            ]);
            // The dialog edits the page set the diff shows. A staged revision owns
            // its own complete page set, so `#i` must index that set: indexing the
            // live one turned a staged middle page into the back (or the back into
            // a middle page) whenever the two sets differed.
            const cardPages = pageKeys.get(cardId) ?? NO_PAGE_KEYS;
            const stagedArtwork = cardPages.pending.length > 0;
            const liveSlots = stagedArtwork ? cardPages.pending : cardPages.live;
            const slotIndexes = input.mediaOrder.map((token) => Number(token.slice(1)));
            const slotsAreValid =
                slotIndexes.length > 0 &&
                new Set(slotIndexes).size === slotIndexes.length &&
                slotIndexes.every(
                    (index) =>
                        Number.isSafeInteger(index) && index >= 0 && index < liveSlots.length
                );
            if (!slotsAreValid) {
                return {
                    status: 'invalid-media',
                    message: '只能删除或调整现有图片的顺序'
                };
            }
            const orderedKeys = slotIndexes.map((index) => liveSlots[index]!);

            const previousOwner = current.owner_account_id ?? null;
            const nextOwner =
                input.ownerAccountId === undefined ? previousOwner : input.ownerAccountId;
            let nextOwnerName: string | null = null;
            if (nextOwner !== null) {
                const account = await queryOne<{ display_name: string | null; status: string }>(
                    database,
                    `SELECT profile.display_name, account.status
                       FROM platform_accounts account
                       LEFT JOIN platform_profiles profile ON profile.account_id = account.id
                      WHERE account.id=? AND account.deleted_at IS NULL`,
                    [nextOwner]
                );
                if (!account) {
                    return { status: 'invalid-owner', message: '账号不存在' };
                }
                if (account.status !== 'active') {
                    return {
                        status: 'invalid-owner',
                        message: '该账号已被禁用，不能作为名片归属'
                    };
                }
                nextOwnerName = account.display_name ?? nextOwner;
            }
            const ownerChanged = nextOwner !== previousOwner;
            const currentReviewStatus = toNamecardReviewStatus(current.review_status);
            // Publishing from here would strand the queued revision, because the
            // review slot belongs to the queue until someone resolves it. A card
            // that is already live keeps its queue untouched.
            if (
                input.status === 'published' &&
                current.publication_status !== 'published' &&
                currentReviewStatus === 'pending'
            ) {
                return {
                    status: 'blocked',
                    message: '这张名片有待审版本，请先在名片审核里通过'
                };
            }
            // Taking a card off the wall drops whatever waited for review with
            // it, so the queue never holds a revision nobody can look at. A
            // rejection keeps its queue: that queue is the resubmission the
            // owner is waiting on.
            const retiresCard =
                input.status === 'hidden' ||
                input.status === 'locked' ||
                input.status === 'withdrawn' ||
                input.status === 'draft';
            const reviewStatus = retiresCard ? null : input.reviewStatus;
            // Setting a version state keeps a revision staged, so the new order
            // lands on the staged page rows and the live artwork stays untouched.
            // Clearing it publishes the arrangement into the live rows.
            const keepsStagedArtwork = reviewStatus !== null;
            const writtenPages = new Map((input.pages ?? []).map(page => [page.pageId, page]));
            const rotatedKey = (key: string) => {
                const parsed = parseCardPageObjectKey(key);
                const written = parsed && writtenPages.get(parsed.pageId);
                return written ? cardPageObjectKey(
                    cardId, keepsStagedArtwork ? 'pending' : 'live', written.pageId, written.objectVersion
                ) : key;
            };
            const orderedMiddles = orderedKeys.slice(
                1, Math.max(1, orderedKeys.length - 1)
            ).map(rotatedKey);
            const rotatedFrontKey =
                input.nextFrontObjectKey ?? rotatedKey(orderedKeys[0]!);
            const rotatedBackKey =
                input.nextBackObjectKey !== undefined
                    ? input.nextBackObjectKey
                    : orderedKeys.length > 1
                      ? rotatedKey(orderedKeys[orderedKeys.length - 1]!)
                      : null;
            // 目标队列的完整页面序列：旋转后的正面、重排后的中间页、旋转后的背面。
            const surface: Array<string | null> = [
                rotatedFrontKey,
                ...orderedMiddles,
                rotatedBackKey
            ];

            // An unowned card keeps the trade terms empty; the owner layer check
            // in the table enforces it, so the payload is normalised here.
            const tradeNote = nextOwner === null ? null : input.content.tradeNote;
            const exchangeMode = nextOwner === null ? 'none' : input.content.exchangeMode;

            const liveCharacterIds = (favoritesMap.get(cardId) ?? []).map((entry) =>
                Number(entry.character_id)
            );
            const [agencyNames, previousOwnerName] = await Promise.all([
                this.agencyLabels(database),
                previousOwner === null ? null : this.accountLabel(database, previousOwner)
            ]);
            const characterNames = await this.characterLabels(database, [
                ...liveCharacterIds,
                ...input.content.favoriteCharacterIds
            ]);

            const seriesLabel = (codes: readonly string[]): string | null =>
                codes.length
                    ? codes.map((code) => agencyNames.get(code) ?? code).join('、')
                    : null;
            const characterLabel = (ids: readonly number[]): string | null =>
                ids.length
                    ? ids.map((id) => characterNames.get(id) ?? String(id)).join('、')
                    : null;
            const creditsLabel = (credits: readonly FudabaCardCredit[]): string | null =>
                credits.length
                    ? credits
                          .map(
                              (credit) =>
                                  `${credit.displayName}${credit.url ? ` (${credit.url})` : ''} [${credit.roles.join('、')}]`
                          )
                          .join('；')
                    : null;
            const flag = (value: boolean): string => (value ? '是' : '否');

            const changes: NamecardAdminFieldChange[] = [];
            const record = (name: string, before: string | null, after: string | null) => {
                if ((before ?? '') !== (after ?? '')) {
                    changes.push({ label: name, before, after });
                }
            };
            record('制作人名称', current.producer_name ?? null, input.content.producerName);
            record('制作人读音', current.producer_reading ?? null, input.content.producerReading);
            record('团体名称', current.group_name ?? null, input.content.groupName);
            record('制作日期', current.made_on ?? null, input.content.madeOn);
            record('企划', seriesLabel(seriesMap.get(cardId) ?? []), seriesLabel(input.content.seriesCodes));
            record(
                '担当角色',
                characterLabel(liveCharacterIds),
                characterLabel(input.content.favoriteCharacterIds)
            );
            record('简介', current.bio ?? null, input.content.bio);
            record(
                '创作人员',
                creditsLabel(creditsMap.get(cardId) ?? []),
                creditsLabel(input.content.credits)
            );
            record('原创标记', flag(current.is_original === true), flag(input.content.isOriginal));
            record('AI 标记', flag(current.made_with_ai === true), flag(input.content.madeWithAi));
            record('交换说明', current.trade_note ?? null, tradeNote);
            record(
                '交换模式',
                NAMECARD_ADMIN_EXCHANGE_LABELS[current.exchange_mode ?? 'none'] ?? null,
                NAMECARD_ADMIN_EXCHANGE_LABELS[exchangeMode] ?? null
            );
            record('公开显示', flag(current.visible === true), flag(input.content.visible));
            if (orderedKeys.length !== liveSlots.length) {
                record('图片', `${liveSlots.length} 张`, `${orderedKeys.length} 张`);
            } else if (slotIndexes.some((index, position) => index !== position)) {
                record(
                    '图片顺序',
                    liveSlots.map((_key, index) => index + 1).join(','),
                    slotIndexes.map((index) => index + 1).join(',')
                );
            }
            record(
                '名片状态',
                NAMECARD_ADMIN_STATUS_LABELS[current.publication_status] ?? current.publication_status,
                NAMECARD_ADMIN_STATUS_LABELS[input.status] ?? input.status
            );
            record(
                '版本状态',
                NAMECARD_ADMIN_REVIEW_LABELS[currentReviewStatus ?? 'none'],
                NAMECARD_ADMIN_REVIEW_LABELS[reviewStatus ?? 'none']
            );
            if (ownerChanged) {
                record(
                    '账号归属',
                    previousOwnerName,
                    nextOwner === null ? null : nextOwnerName
                );
            }

            const rotated =
                input.nextFrontObjectKey !== undefined ||
                input.nextBackObjectKey !== undefined ||
                (input.pages?.length ?? 0) > 0;
            // 已有待审版本时，管理端只允许改版本状态（通过/驳回/锁定/丢弃）；
            // 资料、图片、归属和整卡状态都必须由复审流程处理。
            if (
                currentReviewStatus === 'pending' &&
                (rotated ||
                    changes.some((change) => change.label !== '版本状态'))
            ) {
                return {
                    status: 'blocked',
                    message: '这张名片有待审版本，只能修改版本状态'
                };
            }
            if (
                (currentReviewStatus === 'rejected' ||
                    currentReviewStatus === 'locked') &&
                input.reviewStatus !== null &&
                (rotated ||
                    changes.some((change) => change.label !== '版本状态'))
            ) {
                return {
                    status: 'blocked',
                    message: '编辑被驳回或锁定的版本后只能通过审核'
                };
            }
            const reason = input.reason?.trim() ?? '';
            const publicationChanged = current.publication_status !== input.status;
            const reviewChanged =
                (currentReviewStatus ?? null) !== (reviewStatus ?? null);
            const nonStatusChange = changes.some(
                (change) =>
                    change.label !== '名片状态' &&
                    change.label !== '版本状态'
            );
            const onlyHiddenToLocked =
                publicationChanged &&
                !reviewChanged &&
                current.publication_status === 'hidden' &&
                input.status === 'locked';
            const onlyPendingToApproved =
                (publicationChanged &&
                    !reviewChanged &&
                    current.publication_status === 'pending' &&
                    input.status === 'published') ||
                (reviewChanged &&
                    currentReviewStatus === 'pending' &&
                    reviewStatus === null);
            const requiresReason =
                nonStatusChange ||
                ((publicationChanged || reviewChanged) &&
                    !onlyHiddenToLocked &&
                    !onlyPendingToApproved);
            if (requiresReason && !reason.length) {
                return { status: 'reason-required' };
            }
            if (changes.length === 0 && !rotated) {
                return { status: 'updated', revision, changedFields: [], ownerChange: null };
            }

            // `review_status` may only be set while a payload describes the
            // submitted revision, so a verdict on a card without one takes the
            // submitted content as that revision.
            const pendingPayload =
                reviewStatus === null
                    ? null
                    : pendingNamecardPayload(current.pending_payload) ??
                      {
                          producer_name: input.content.producerName,
                          producer_reading: input.content.producerReading,
                          bio: input.content.bio,
                          trade_note: tradeNote,
                          credits: [...input.content.credits],
                          series_codes: [...input.content.seriesCodes],
                          group_name: input.content.groupName,
                          made_on: input.content.madeOn,
                          is_original: input.content.isOriginal,
                          made_with_ai: input.content.madeWithAi,
                          visible: input.content.visible,
                          exchange_mode: exchangeMode,
                          favorite_character_ids: [...input.content.favoriteCharacterIds]
                      };

            const sort = namecardSortKey(
                input.content.producerName,
                input.content.producerReading
            );
            const updatedRow = await queryOne<NamecardCardRow>(database,
                `UPDATE fudaba_cards SET
                     producer_name=?, producer_reading=?, sort_name_key=?, sort_name_bucket=?,
                     group_name=?, is_group_card=?, made_on=?,
                     bio=?, trade_note=?, is_original=?, made_with_ai=?,
                     visible=?, exchange_mode=?,
                     publication_status=?, lock_reason=?,
                     review_status=?, review_reason=?, review_submitted_at=?,
                     pending_payload=CAST(? AS jsonb),
                     owner_account_id=?,
                     revision=revision+1, updated_at=?
                 WHERE card_number=? AND revision=? AND deleted_at IS NULL
                 RETURNING ${NAMECARD_COLUMNS}`,
                [
                    input.content.producerName,
                    input.content.producerReading,
                    sort.key,
                    sort.bucket,
                    input.content.groupName,
                    input.content.isGroupCard ?? current.is_group_card,
                    input.content.madeOn,
                    input.content.bio,
                    tradeNote,
                    input.content.isOriginal,
                    input.content.madeWithAi,
                    input.content.visible,
                    exchangeMode,
                    input.status,
                    input.status === 'locked' ? reason : null,
                    reviewStatus,
                    reviewStatus === null
                        ? // A rejected card still owes the owner the reason it lost its slot.
                          input.status === 'rejected'
                            ? reason
                            : null
                        : reviewStatus === 'pending'
                          ? null
                          : reason,
                    reviewStatus === null ? null : current.review_submitted_at ?? input.updatedAt,
                    pendingPayload === null ? null : JSON.stringify(pendingPayload),
                    nextOwner,
                    input.updatedAt,
                    input.cardNumber,
                    input.expectedRevision
                ]
            );
            if (!updatedRow) return { status: 'conflict', revision };
            const queue = keepsStagedArtwork ? 'pending' : 'live';
            await syncNamecardPages(
                database,
                cardId,
                queue,
                surface,
                input.pages ?? [],
                input.updatedAt.toISOString()
            );
            // Admin override approval promotes the displayed pending page set
            // into live; remove the now-discarded pending rows.
            if (currentReviewStatus !== null && reviewStatus === null) {
                await executeSql(
                    database,
                    `DELETE FROM fudaba_card_pages WHERE card_id=? AND queue='pending'`,
                    [cardId]
                );
            }
            await this.writeNamecardAdminRelations(
                database,
                cardId,
                input.content
            );

            const cardNumber = Number(current.card_number);
            if (ownerChanged && previousOwner) {
                await insertNamecardNotification(database, {
                    recipientAccountId: previousOwner,
                    cardNumber,
                    ...cardTransferredOutCopy(cardNumber, reason)
                });
            }
            if (nextOwner) {
                if (ownerChanged) {
                    await insertNamecardNotification(database, {
                        recipientAccountId: nextOwner,
                        cardNumber,
                        ...cardTransferredInCopy(cardNumber, reason)
                    });
                }
                // 纯旋转没有内容改动，就不发「已被管理员修改」这条。
                if (changes.length > 0) {
                    await insertNamecardNotification(database, {
                        recipientAccountId: nextOwner,
                        cardNumber,
                        ...cardAdminEditedCopy(cardNumber, reason, changes)
                    });
                }
            }
            // A management edit can lock or unlock the card by itself, so the
            // audit trail follows the status it just wrote.
            if (input.status === 'locked') {
                await this.appendNamecardLockRecord(
                    database,
                    cardId,
                    'locked',
                    input.reason ?? null,
                    input.actor ?? null
                );
            } else if (current.publication_status === 'locked') {
                await this.appendNamecardLockRecord(
                    database,
                    cardId,
                    'unlocked',
                    input.reason ?? null,
                    input.actor ?? null
                );
            }
            return {
                status: 'updated',
                revision: Number(updatedRow.revision),
                changedFields: changes,
                ownerChange: ownerChanged
                    ? { previousAccountId: previousOwner, nextAccountId: nextOwner }
                    : null
            };
        });
    }

    /**
     * Sets `deleted_at`: every read path filters it, so the card leaves the
     * owner's list, the wall and the queue at once. Restoring the row takes a
     * database operator, which is the point.
     */
    async deleteCardAsAdmin(
        cardNumber: number,
        expectedRevision: number
    ): Promise<NamecardAdminDeleteResult> {
        return this.database.transaction(async (database) => {
            const current = await queryOne<NamecardCardRow>(database,
                `SELECT ${NAMECARD_COLUMNS} FROM fudaba_cards
                 WHERE card_number=? AND deleted_at IS NULL
                 FOR UPDATE`,
                [cardNumber]
            );
            if (!current) return { status: 'not-found' };
            const revision = Number(current.revision);
            if (revision !== expectedRevision) {
                return { status: 'conflict', revision };
            }
            // 删除是状态机里唯一恒被允许的判决：它不动线上状态，只把整行打上
            // `deleted_at` 并丢弃待审改版。
            const plan = planNamecardReview(
                {
                    publicationStatus: current.publication_status,
                    reviewStatus: current.review_status ?? null
                },
                'delete'
            );
            if (!plan.allowed || !plan.tombstones) {
                return { status: 'conflict', revision };
            }
            const updatedRow = await queryOne<NamecardCardRow>(database,
                `UPDATE fudaba_cards SET
                     deleted_at=CURRENT_TIMESTAMP,
                     review_status=?, review_reason=NULL, review_submitted_at=NULL,
                     pending_payload=NULL,
                     lock_reason=NULL,
                     revision=revision+1, updated_at=CURRENT_TIMESTAMP
                 WHERE card_number=? AND revision=? AND deleted_at IS NULL
                 RETURNING ${NAMECARD_COLUMNS}`,
                [plan.reviewStatus, cardNumber, expectedRevision]
            );
            if (!updatedRow) return { status: 'conflict', revision };
            // The staged revision leaves with the card.
            await executeSql(
                database,
                `DELETE FROM fudaba_card_pages WHERE card_id=? AND queue='pending'`,
                [current.internal_id]
            );
            if (current.owner_account_id) {
                await insertNamecardNotification(database, {
                    recipientAccountId: current.owner_account_id,
                    kind: 'card-admin-edited',
                    cardNumber,
                    title: `名片 #${cardNumber} 已被删除`,
                    body: `你的名片 #${cardNumber} 已被管理员删除。`
                });
            }
            return { status: 'updated', revision: Number(updatedRow.revision) };
        });
    }

    /** Agency code → display name, for the change list the owner reads. */
    private async agencyLabels(database: SqlDatabase): Promise<Map<string, string>> {
        const rows = await queryAll<{ code: string; name_cn: string }>(database,
            'SELECT code, name_cn FROM agencies'
        );
        return new Map(rows.map((row) => [row.code, row.name_cn]));
    }

    private async characterLabels(
        database: SqlDatabase,
        ids: readonly number[]
    ): Promise<Map<number, string>> {
        const unique = [...new Set(ids.filter((id) => Number.isSafeInteger(id) && id > 0))];
        if (!unique.length) return new Map();
        const placeholders = unique.map(() => '?').join(',');
        const rows = await queryAll<{ id: number | string; name_cn: string }>(database,
            `SELECT id, name_cn FROM namecard_characters WHERE id IN (${placeholders})`,
            unique
        );
        return new Map(rows.map((row) => [Number(row.id), row.name_cn]));
    }

    private async accountLabel(
        database: SqlDatabase,
        accountId: string
    ): Promise<string | null> {
        const row = await queryOne<{ display_name: string | null }>(database,
            'SELECT display_name FROM platform_profiles WHERE account_id=?',
            [accountId]
        );
        // 空显示的 profile 不能变成空白属主，统一回落到帐号 id。
        return row?.display_name?.trim() || accountId;
    }

    /** Series, credits, favourites and the middle-page rows of one card. */
    private async writeNamecardAdminRelations(
        database: SqlDatabase,
        cardId: string,
        content: NamecardAdminContent
    ): Promise<void> {
        await executeSql(database, 'DELETE FROM fudaba_card_series WHERE card_id=?', [cardId]);
        for (const [index, seriesCode] of content.seriesCodes.entries()) {
            await executeSql(database,
                `INSERT INTO fudaba_card_series (card_id, series_code, display_order)
                 VALUES (?, ?, ?)
                 ON CONFLICT (card_id, series_code) DO NOTHING`,
                [cardId, seriesCode, index + 1]
            );
        }
        await this.replaceNamecardCredits(database, cardId, content.credits);
        await executeSql(database,
            'DELETE FROM fudaba_card_favorite_characters WHERE card_id=?',
            [cardId]
        );
        for (const [index, characterId] of content.favoriteCharacterIds.entries()) {
            await executeSql(database,
                `INSERT INTO fudaba_card_favorite_characters (card_id, character_id, display_order)
                 SELECT ?, character.id, ? FROM namecard_characters character
                 WHERE character.id=? AND character.deleted_at IS NULL`,
                [cardId, index, characterId]
            );
        }
    }


    async lockCard(
        id: number,
        expectedRevision: number,
        reason: string,
        actor: string | null = null
    ): Promise<NamecardMutationResult> {
        return this.database.transaction(async (database) => {
            const currentRow = await queryOne<NamecardCardRow & { owner_account_id?: string | null }>(database,
                `SELECT ${NAMECARD_COLUMNS}, owner_account_id FROM fudaba_cards
                 WHERE card_number=? AND deleted_at IS NULL
                 FOR UPDATE`,
                [id]
            );
            const current = await this.attachOneNamecard(database, currentRow);
            if (!current) return { status: 'not-found' };
            if (current.revision !== expectedRevision) {
                return { status: 'conflict', revision: current.revision };
            }
            // 判定走共享状态机：撤回的卡不能锁，已经锁定的卡不用再锁；锁定是终态
            // 处置，待审改版随之丢弃。
            const plan = currentRow
                ? planNamecardReview(
                    {
                        publicationStatus: currentRow.publication_status,
                        reviewStatus: currentRow.review_status ?? null
                    },
                    'lock'
                )
                : null;
            if (!plan || !plan.allowed) {
                return plan && plan.reason === 'withdrawn'
                    ? { status: 'withdrawn', revision: current.revision }
                    : { status: 'conflict', revision: current.revision };
            }
            const updatedRow = await queryOne<NamecardCardRow & { owner_account_id?: string | null }>(database,
                `UPDATE fudaba_cards
                 SET publication_status=?, lock_reason=?,
                     review_status=?, review_reason=NULL,
                     review_submitted_at=NULL, pending_payload=NULL,
                     revision=revision+1, updated_at=CURRENT_TIMESTAMP
                 WHERE card_number=? AND revision=? AND deleted_at IS NULL
                 RETURNING ${NAMECARD_COLUMNS}, owner_account_id`,
                [plan.publicationStatus, reason, plan.reviewStatus, id, expectedRevision]
            );
            if (!updatedRow) return { status: 'conflict', revision: current.revision };
            // Locking drops the queue entry, so its staged pages go with it.
            await executeSql(
                database,
                `DELETE FROM fudaba_card_pages WHERE card_id=? AND queue='pending'`,
                [updatedRow.internal_id]
            );
            await this.appendNamecardLockRecord(
                database,
                String(updatedRow.internal_id),
                'locked',
                reason,
                actor
            );
            // A card its owner already deleted is not news to them: locking a
            // `hidden` card stays silent.
            if (updatedRow.owner_account_id && current.status !== 'hidden') {
                await insertNamecardNotification(database, {
                    recipientAccountId: String(updatedRow.owner_account_id),
                    cardNumber: id,
                    ...cardLockedCopy(id, reason)
                });
            }
            const updated = await this.attachOneNamecard(database, updatedRow);
            return { status: 'updated', card: updated! };
        });
    }

    async unlockCard(
        id: number,
        expectedRevision: number
    ): Promise<NamecardMutationResult> {
        return this.database.transaction(async (database) => {
            const currentRow = await queryOne<NamecardCardRow & { owner_account_id?: string | null }>(database,
                `SELECT ${NAMECARD_COLUMNS}, owner_account_id FROM fudaba_cards
                 WHERE card_number=? AND deleted_at IS NULL
                 FOR UPDATE`,
                [id]
            );
            // 判定走共享状态机：只有锁定的卡能解锁，解锁把它放回待审队列。
            const plan = currentRow
                ? planNamecardReview(
                    {
                        publicationStatus: currentRow.publication_status,
                        reviewStatus: currentRow.review_status ?? null
                    },
                    'unlock'
                )
                : null;
            const updatedRow = currentRow && plan && plan.allowed
                ? await queryOne<NamecardCardRow & { owner_account_id?: string | null }>(database,
                    `UPDATE fudaba_cards
                     SET publication_status=?, lock_reason=NULL,
                         revision=revision+1, updated_at=CURRENT_TIMESTAMP
                     WHERE card_number=?
                       AND publication_status='locked' AND revision=? AND deleted_at IS NULL
                     RETURNING ${NAMECARD_COLUMNS}, owner_account_id`,
                    [plan.publicationStatus, id, expectedRevision]
                )
                : null;
            if (updatedRow) {
                await this.appendNamecardLockRecord(
                    database,
                    String(updatedRow.internal_id),
                    'unlocked',
                    null,
                    null
                );
                if (updatedRow.owner_account_id) {
                    await insertNamecardNotification(database, {
                        recipientAccountId: String(updatedRow.owner_account_id),
                        cardNumber: id,
                        ...cardUnlockedCopy(id)
                    });
                }
                const updated = await this.attachOneNamecard(database, updatedRow);
                return { status: 'updated', card: updated! };
            }
            const current = await this.attachOneNamecard(database, currentRow);
            if (!current) return { status: 'not-found' };
            if (plan && !plan.allowed && plan.reason === 'withdrawn') {
                return { status: 'withdrawn', revision: current.revision };
            }
            return { status: 'conflict', revision: current.revision };
        });
    }

    async rejectSubmission(
        id: number,
        expectedRevision: number,
        reason: string | null = null
    ): Promise<NamecardMutationResult> {
        return this.database.transaction(async (database) => {
            const currentRow = await queryOne<NamecardCardRow>(database,
                `SELECT ${NAMECARD_COLUMNS} FROM fudaba_cards
                 WHERE card_number=? AND deleted_at IS NULL
                 FOR UPDATE`,
                [id]
            );
            // 判定走共享状态机：改版驳回只处置待审副本（线上卡继续上墙），首投驳回
            // 才把卡片本身打到 `rejected`。
            const plan = currentRow
                ? planNamecardReview(
                    {
                        publicationStatus: currentRow.publication_status,
                        reviewStatus: currentRow.review_status ?? null
                    },
                    'reject'
                )
                : null;
            const updatedRow = currentRow && plan && plan.allowed
                ? await queryOne<NamecardCardRow>(database,
                    `UPDATE fudaba_cards SET
                         publication_status=?, review_status=?, review_reason=?,
                         rejection_reason=?, revision=revision+1, updated_at=CURRENT_TIMESTAMP
                     WHERE card_number=? AND revision=? AND deleted_at IS NULL
                       AND (publication_status='pending'
                            OR (review_status='pending' AND publication_status='published'))
                     RETURNING ${NAMECARD_COLUMNS}`,
                    [
                        plan.publicationStatus,
                        plan.reviewStatus,
                        plan.subject === 'revision' ? reason : currentRow.review_reason ?? null,
                        reason,
                        id,
                        expectedRevision
                    ]
                )
                : null;
            if (updatedRow) {
                await executeSql(database,
                    'UPDATE namecard_guest_attributes SET rejected_at=CURRENT_TIMESTAMP WHERE card_id=?',
                    [updatedRow.internal_id]
                );
                if (updatedRow.owner_account_id) {
                    await insertNamecardNotification(database, {
                        recipientAccountId: String(updatedRow.owner_account_id),
                        cardNumber: id,
                        ...(updatedRow.publication_status === 'published'
                            ? cardRevisionRejectedCopy(id, reason)
                            : cardRejectedCopy(id, reason))
                    });
                }
                const updated = await this.attachOneNamecard(database, updatedRow);
                return { status: 'updated', card: updated! };
            }
            const current = await this.findSubmission(id, database);
            if (!current) return { status: 'not-found' };
            if (current.status === 'withdrawn') {
                return { status: 'withdrawn', revision: current.revision };
            }
            return { status: 'conflict', revision: current.revision };
        });
    }

    /**
     * Marks a submission as breaking the rules: a revision of a published card
     * only loses its own verdict, a first submission is locked outright.
     */
    async flagSubmission(
        id: number,
        expectedRevision: number,
        reason: string,
        actor: string | null = null
    ): Promise<NamecardMutationResult> {
        return this.database.transaction(async (database) => {
            const currentRow = await queryOne<NamecardCardRow>(database,
                `SELECT ${NAMECARD_COLUMNS} FROM fudaba_cards
                 WHERE card_number=? AND deleted_at IS NULL
                 FOR UPDATE`,
                [id]
            );
            // 判定走共享状态机：改版违规只把待审副本判成 `locked`（线上卡继续上墙），
            // 首投违规直接锁卡。
            const plan = currentRow
                ? planNamecardReview(
                    {
                        publicationStatus: currentRow.publication_status,
                        reviewStatus: currentRow.review_status ?? null
                    },
                    'flag'
                )
                : null;
            const updatedRow = currentRow && plan && plan.allowed
                ? await queryOne<NamecardCardRow>(database,
                    `UPDATE fudaba_cards SET
                         publication_status=?,
                         lock_reason=?,
                         review_status=?,
                         review_reason=?,
                         revision=revision+1, updated_at=CURRENT_TIMESTAMP
                     WHERE card_number=? AND revision=? AND deleted_at IS NULL
                       AND (publication_status='pending'
                            OR (review_status='pending' AND publication_status='published'))
                     RETURNING ${NAMECARD_COLUMNS}`,
                    [
                        plan.publicationStatus,
                        plan.subject === 'revision' ? currentRow.lock_reason ?? null : reason,
                        plan.reviewStatus,
                        plan.subject === 'revision' ? reason : currentRow.review_reason ?? null,
                        id,
                        expectedRevision
                    ]
                )
                : null;
            if (updatedRow) {
                // The verdict belongs in the same trail as locks and unlocks.
                await this.appendNamecardLockRecord(
                    database,
                    String(updatedRow.internal_id),
                    'flagged',
                    reason,
                    actor
                );
                if (updatedRow.owner_account_id) {
                    await insertNamecardNotification(database, {
                        recipientAccountId: String(updatedRow.owner_account_id),
                        cardNumber: id,
                        ...(updatedRow.publication_status === 'published'
                            ? cardRevisionFlaggedCopy(id, reason)
                            : cardLockedCopy(id, reason))
                    });
                }
                const updated = await this.attachOneNamecard(database, updatedRow);
                return { status: 'updated', card: updated! };
            }
            const current = await this.findSubmission(id, database);
            if (!current) return { status: 'not-found' };
            if (current.status === 'withdrawn') {
                return { status: 'withdrawn', revision: current.revision };
            }
            return { status: 'conflict', revision: current.revision };
        });
    }

    async listNamecardNotifications(recipientAccountId: string, limit: number) {
        return new SqlNamecardNotificationRepository(this.database).list(recipientAccountId, limit);
    }

    async markNamecardNotificationsRead(
        recipientAccountId: string,
        ids: readonly string[] | null
    ): Promise<number> {
        return new SqlNamecardNotificationRepository(this.database).markRead(recipientAccountId, ids);
    }

    async purgeTerminalCards(
        cutoff: Date
    ): Promise<Array<{ id: number; objectKeys: string[] }>> {
        const rows = await queryAll<{
            card_number: number | string;
            card_id: string;
            queue: 'live' | 'pending' | null;
            page_id: string | null;
            object_version: string | null;
        }>(this.database,
            `WITH expired AS (
                 SELECT card.id, card.card_number
                   FROM fudaba_cards card
                   JOIN namecard_guest_attributes guest ON guest.card_id=card.id
                  WHERE card.publication_status IN ('withdrawn','rejected')
                    AND COALESCE(guest.withdrawn_at, guest.rejected_at, card.created_at) <= ?
             ), pages AS (
                 SELECT page.card_id, page.queue, page.page_id, page.object_version
                   FROM fudaba_card_pages page
                   JOIN expired ON expired.id=page.card_id
             ), deleted AS (
                 DELETE FROM fudaba_cards card
                  WHERE card.id IN (SELECT id FROM expired)
                 RETURNING card.id, card.card_number
             )
             SELECT deleted.card_number, deleted.id AS card_id,
                    pages.queue, pages.page_id, pages.object_version
               FROM deleted
               LEFT JOIN pages ON pages.card_id=deleted.id`,
            [cutoff]
        );
        const byCard = new Map<number, string[]>();
        for (const row of rows) {
            const id = Number(row.card_number);
            const keys = byCard.get(id) ?? [];
            if (row.queue && row.page_id && row.object_version) {
                keys.push(cardPageObjectKey(
                    row.card_id,
                    row.queue,
                    row.page_id,
                    row.object_version
                ));
            }
            byCard.set(id, keys);
        }
        return Array.from(byCard, ([id, objectKeys]) => ({ id, objectKeys }));
    }

    private async findSubmission(
        id: number,
        database: SqlDatabase = this.database
    ): Promise<NamecardSubmissionRecord | null> {
        const row = await queryOne<NamecardCardRow>(database,
            `SELECT ${NAMECARD_COLUMNS} FROM fudaba_cards
             WHERE card_number=? AND deleted_at IS NULL`,
            [id]
        );
        return this.attachOneNamecard(database, row);
    }

    async findSubmissionByTokenHash(
        id: number,
        tokenHash: string,
        database: SqlDatabase = this.database
    ): Promise<NamecardSubmissionRecord | null> {
        const row = await queryOne<NamecardCardRow>(database,
            `SELECT ${NAMECARD_COLUMNS} FROM fudaba_cards card
             JOIN namecard_guest_attributes guest ON guest.card_id=card.id
             WHERE card.card_number=? AND card.${NAMECARD_COMPAT_ORIGIN}
               AND card.deleted_at IS NULL AND guest.withdrawal_token_hash=?`,
            [id, tokenHash]
        );
        return this.attachOneNamecard(database, row);
    }

    async findSubmissionWithHashesByTokenHash(
        id: number,
        tokenHash: string
    ): Promise<NamecardSubmissionWithHashesRecord | null> {
        const row = await queryOne<NamecardCardRow & { hash1: string; hash2: string }>(
            this.database,
            `SELECT ${NAMECARD_COLUMNS}, guest.hash1, guest.hash2
             FROM fudaba_cards card
             JOIN namecard_guest_attributes guest ON guest.card_id=card.id
             WHERE card.card_number=? AND card.${NAMECARD_COMPAT_ORIGIN}
               AND card.deleted_at IS NULL AND guest.withdrawal_token_hash=?`,
            [id, tokenHash]
        );
        if (!row) return null;
        const attached = await this.attachOneNamecard(this.database, row);
        if (!attached) return null;
        return { ...attached, hash1: row.hash1, hash2: row.hash2 };
    }

    async withdrawSubmission(
        id: number,
        tokenHash: string,
        expectedRevision: number
    ): Promise<NamecardMutationResult> {
        return this.database.transaction(async (database) => {
            const updatedRow = await queryOne<NamecardCardRow>(database,
                `UPDATE fudaba_cards card
                 SET publication_status='withdrawn', revision=revision+1,
                     updated_at=CURRENT_TIMESTAMP
                 FROM namecard_guest_attributes guest
                 WHERE guest.card_id=card.id AND card.card_number=?
                   AND card.${NAMECARD_COMPAT_ORIGIN}
                   AND guest.withdrawal_token_hash=? AND card.publication_status='pending'
                   AND card.revision=? AND card.deleted_at IS NULL
                 RETURNING card.id AS internal_id, card.card_number,
                           card.publication_status, card.revision,
                           card.series_code, card.origin, card.created_at`,
                [id, tokenHash, expectedRevision]
            );
            if (updatedRow) {
                await executeSql(database,
                    'UPDATE namecard_guest_attributes SET withdrawn_at=CURRENT_TIMESTAMP WHERE card_id=?',
                    [updatedRow.internal_id]
                );
                const updated = await this.attachOneNamecard(database, updatedRow);
                return { status: 'updated', card: updated! };
            }
            const current = await this.findSubmissionByTokenHash(id, tokenHash, database);
            if (!current) return { status: 'not-found' };
            return { status: 'conflict', revision: current.revision };
        });
    }

    async resubmitSubmission(
        id: number,
        tokenHash: string,
        expectedRevision: number
    ): Promise<NamecardEditResult> {
        return this.database.transaction(async (database) => {
            const updatedRow = await queryOne<NamecardCardRow>(database,
                `UPDATE fudaba_cards card
                 SET publication_status='pending', revision=revision+1,
                     updated_at=CURRENT_TIMESTAMP
                 FROM namecard_guest_attributes guest
                 WHERE guest.card_id=card.id AND card.card_number=?
                   AND card.${NAMECARD_COMPAT_ORIGIN}
                   AND guest.withdrawal_token_hash=?
                   AND card.publication_status IN ('withdrawn','rejected')
                   AND card.revision=? AND card.deleted_at IS NULL
                 RETURNING card.id AS internal_id, card.card_number,
                           card.publication_status, card.revision,
                           card.series_code, card.origin, card.created_at`,
                [id, tokenHash, expectedRevision]
            );
            if (updatedRow) {
                await executeSql(database,
                    `UPDATE namecard_guest_attributes
                     SET withdrawn_at=NULL, rejected_at=NULL WHERE card_id=?`,
                    [updatedRow.internal_id]
                );
                const updated = await this.attachOneNamecard(database, updatedRow);
                return { status: 'updated', card: updated! };
            }
            const current = await this.findSubmissionByTokenHash(id, tokenHash, database);
            if (!current) return { status: 'not-found' };
            return { status: 'conflict', revision: current.revision };
        });
    }

    /* ---- 名片册与交换（docs/architecture/namecard-exchange.md） ---- */

    /** 交换与名片册只认「在线、可交换」的名片，投影与名片墙一致。 */
    private async loadExchangeCards(
        database: SqlDatabase,
        cardNumbers: readonly number[]
    ): Promise<NamecardPublicRecord[]> {
        const unique = [...new Set(cardNumbers)];
        if (unique.length === 0) return [];
        const placeholders = unique.map(() => '?').join(',');
        const rows = await queryAll<NamecardCardRow>(
            database,
            `SELECT ${NAMECARD_COLUMNS} FROM fudaba_cards
             WHERE card_number IN (${placeholders})
               AND deleted_at IS NULL
               AND publication_status='published'
               AND ${NAMECARD_PUBLIC_ORIGIN}`,
            unique
        );
        return (await this.attachNamecardFavorites(
            database,
            rows,
            'live'
        )) as NamecardPublicRecord[];
    }

    /**
     * 名片册条目的原卡投影：`published` 与 `hidden`（持有者删卡）都算「行还在」，按最新内容展示；
     * `locked` 的条目根本不会进列表，`approving` 等状态仍回落到 `snapshot`（doc §5）。
     */
    private async loadShelfCards(
        database: SqlDatabase,
        cardNumbers: readonly number[]
    ): Promise<NamecardPublicRecord[]> {
        const unique = [...new Set(cardNumbers)];
        if (unique.length === 0) return [];
        const placeholders = unique.map(() => '?').join(',');
        const rows = await queryAll<NamecardCardRow>(
            database,
            `SELECT ${NAMECARD_COLUMNS} FROM fudaba_cards
             WHERE card_number IN (${placeholders})
               AND deleted_at IS NULL
               AND publication_status IN ('published','hidden')
               AND ${NAMECARD_PUBLIC_ORIGIN}`,
            unique
        );
        return (await this.attachNamecardFavorites(
            database,
            rows,
            'live'
        )) as NamecardPublicRecord[];
    }

    /**
     * 【显示我的名片】的条目投影：`published` 即可（不看名片墙的 origin 门槛），
     * 因为这里展示的是持有者自己的东西，PRD §6 只要求整卡没有下线。
     */
    private async loadOwnCollectionCards(
        database: SqlDatabase,
        accountId: string,
        cardNumbers: readonly number[]
    ): Promise<NamecardPublicRecord[]> {
        const unique = [...new Set(cardNumbers)];
        if (unique.length === 0) return [];
        const placeholders = unique.map(() => '?').join(',');
        const rows = await queryAll<NamecardCardRow>(
            database,
            `SELECT ${NAMECARD_COLUMNS} FROM fudaba_cards
             WHERE card_number IN (${placeholders})
               AND owner_account_id=?
               AND deleted_at IS NULL
               AND publication_status='published'`,
            [...unique, accountId]
        );
        return (await this.attachNamecardFavorites(
            database,
            rows,
            'live'
        )) as NamecardPublicRecord[];
    }

    /**
     * 「按企划」排序要的担当角色目录值：链接顺序照名片上的顺序，
     * 排序时取 (category, display_order) 最小的一项（PRD §3.2 / Q7）。
     */
    private async listCollectionFavoriteOrders(
        database: SqlDatabase,
        cardIds: readonly string[]
    ): Promise<Map<string, { id: number; category: string; order: number }[]>> {
        const grouped = new Map<
            string,
            { id: number; category: string; order: number }[]
        >();
        for (const cardId of cardIds) grouped.set(cardId, []);
        if (cardIds.length === 0) return grouped;
        const placeholders = cardIds.map(() => '?').join(', ');
        const rows = await queryAll<{
            card_id: string;
            character_id: number | string;
            category: string;
            character_order: number | string;
        }>(
            database,
            `SELECT selected.card_id, selected.character_id, character.category,
                    character.display_order AS character_order
               FROM fudaba_card_favorite_characters selected
               JOIN namecard_characters character
                 ON character.id=selected.character_id
              WHERE selected.card_id IN (${placeholders})
              ORDER BY selected.card_id, selected.display_order`,
            [...cardIds]
        );
        for (const row of rows) {
            grouped.get(String(row.card_id))?.push({
                id: Number(row.character_id),
                category: row.category,
                order: Number(row.character_order)
            });
        }
        return grouped;
    }

    /**
     * 企划目录顺序：`code → 位次`，与筛选下拉同源（`agencies.display_order`，
     * 同序按 code）。整页只查一次，比较器不再逐行回库。
     */
    private async listCollectionSeriesRanks(
        database: SqlDatabase
    ): Promise<Map<string, number>> {
        const rows = await queryAll<{ code: string }>(
            database,
            'SELECT code FROM agencies ORDER BY display_order, code'
        );
        return new Map(rows.map((row, index) => [row.code, index]));
    }

    /** 快照里的担当角色只剩 id：目录值现查一次，供删除卡参与企划排序。 */
    private async listCharacterOrders(
        database: SqlDatabase,
        characterIds: readonly number[]
    ): Promise<Map<number, { category: string; order: number }>> {
        const unique = [...new Set(characterIds)];
        if (unique.length === 0) return new Map();
        const placeholders = unique.map(() => '?').join(',');
        const rows = await queryAll<{
            id: number | string;
            category: string;
            display_order: number | string;
        }>(
            database,
            `SELECT id, category, display_order FROM namecard_characters
              WHERE id IN (${placeholders})`,
            [...unique]
        );
        return new Map(
            rows.map((row) => [
                Number(row.id),
                { category: row.category, order: Number(row.display_order) }
            ])
        );
    }

    /** 名片册留存的那份只读投影。 */
    private collectionSnapshot(
        card: NamecardPublicRecord
    ): NamecardCollectionSnapshotRecord {
        // 原卡被删除后只剩这份投影，排序依据必须一起带走（PRD §3.4）。
        const sort = namecardSortKey(card.producer_name, card.producer_reading);
        return {
            producerName: card.producer_name ?? null,
            producerReading: card.producer_reading ?? null,
            sortNameKey: sort.key,
            sortNameBucket: sort.bucket,
            groupName: card.group_name ?? null,
            madeOn: card.made_on ?? null,
            bio: card.bio ?? null,
            tradeNote: card.trade_note ?? null,
            isOriginal: card.is_original === true,
            madeWithAi: card.made_with_ai === true,
            exchangeMode:
                card.exchange_mode === 'auto' || card.exchange_mode === 'manual'
                    ? card.exchange_mode
                    : 'none',
            accent: card.accent ?? null,
            seriesCodes: [...(card.series_codes ?? [])],
            // 原卡删除后「担当角色」筛选与「按企划」排序只剩这份投影（PRD §4 / §3.2）。
            favoriteCharacterIds: [
                ...new Set(
                    (card.favorite_characters ?? []).map(
                        (character) => character.character_id
                    )
                )
            ],
            credits: [...(card.credits ?? [])]
        };
    }

    /** 「我有、仍可交换、且对方名片册里还没有的」张数。 */
    async countMissingCollectionCards(input: {
        cardOwnerId: string;
        otherAccountId: string;
    }): Promise<number> {
        const row = await queryOne<{ missing: number | string }>(
            this.database,
            `SELECT COUNT(*) AS missing
               FROM fudaba_cards card
              WHERE card.owner_account_id=?
                AND card.deleted_at IS NULL
                AND card.publication_status='published'
                AND ${NAMECARD_PUBLIC_ORIGIN}
                AND card.exchange_mode <> 'none'
                AND NOT EXISTS (
                    SELECT 1 FROM public.namecard_collection_entries entry
                     WHERE entry.collector_account_id=?
                       AND entry.card_number=card.card_number)`,
            [input.cardOwnerId, input.otherAccountId]
        );
        return Number(row?.missing ?? 0);
    }

    async findExchangeByClientId(
        clientExchangeId: string
    ): Promise<NamecardExchangeRecord | null> {
        const row = await queryOne<NamecardExchangeRow>(
            this.database,
            `SELECT ${EXCHANGE_COLUMNS} FROM public.namecard_exchanges
              WHERE client_exchange_id=?`,
            [clientExchangeId]
        );
        return row ? exchangeRecordFromRow(row) : null;
    }

    async commitExchange(
        input: NamecardExchangeCommitInput
    ): Promise<NamecardExchangeCommitResult> {
        const existing = await this.findExchangeByClientId(input.clientExchangeId);
        if (existing) {
            // 幂等命中也要与首次提交同口径：这个数用于「对方还缺我哪几张」的二次确认，
            // 直接填 0 会让一次重放看起来像对方已经全收下了。
            return {
                exchange: existing,
                idempotent: true,
                targetMissingCount: await this.countMissingCollectionCardsWith(
                    this.database,
                    input.initiatorAccountId,
                    input.targetAccountId
                )
            };
        }
        return this.database.transaction(async (database) => {
            const targetCards = await this.loadExchangeCards(
                database,
                input.targetCardNumbers
            );
            const giveCards = await this.loadExchangeCards(
                database,
                input.giveCardNumbers
            );
            const skipped: NamecardExchangeSkipRecord[] = [];
            // 目标卡必须属于目标账号；扫码不看交换方式，其余入口 `none` 一律跳过。
            const acceptedTargets = targetCards.filter((card) => {
                if (card.owner_account_id !== input.targetAccountId) {
                    skipped.push({
                        cardNumber: card.card_number ?? card.id,
                        side: 'target',
                        reason: 'unavailable'
                    });
                    return false;
                }
                if (input.source !== 'scan' && card.exchange_mode === 'none') {
                    skipped.push({
                        cardNumber: card.card_number ?? card.id,
                        side: 'target',
                        reason: 'unavailable'
                    });
                    return false;
                }
                return true;
            });
            const acceptedGive = giveCards.filter((card) => {
                if (card.owner_account_id !== input.initiatorAccountId) {
                    skipped.push({
                        cardNumber: card.card_number ?? card.id,
                        side: 'initiator',
                        reason: 'unavailable'
                    });
                    return false;
                }
                return true;
            });
            // 已在对方名片册里的那张不再重复入库，但整次交换仍然成功。
            const [ownedByInitiator, ownedByTarget] = await Promise.all([
                this.collectionCardNumbers(
                    database,
                    input.initiatorAccountId,
                    acceptedTargets.map((card) => card.card_number ?? card.id)
                ),
                this.collectionCardNumbers(
                    database,
                    input.targetAccountId,
                    acceptedGive.map((card) => card.card_number ?? card.id)
                )
            ]);
            const targets = acceptedTargets.filter((card) => {
                const number = card.card_number ?? card.id;
                if (ownedByInitiator.has(number)) {
                    skipped.push({
                        cardNumber: number,
                        side: 'target',
                        reason: 'already-owned'
                    });
                    return false;
                }
                return true;
            });
            const gives = acceptedGive.filter((card) => {
                const number = card.card_number ?? card.id;
                if (ownedByTarget.has(number)) {
                    skipped.push({
                        cardNumber: number,
                        side: 'initiator',
                        reason: 'owned-by-target'
                    });
                    return false;
                }
                return true;
            });
            // `manual` 只挡住别人向这张卡发起；扫码按持有者当时出示的清单直接完成。
            const needsConfirmation =
                input.source !== 'scan' &&
                targets.some((card) => card.exchange_mode === 'manual');
            const status: NamecardExchangeRecord['status'] = needsConfirmation
                ? 'pending'
                : 'completed';

            // 重复发起（doc §7）：同一发起方、同一目标方、仍在一周有效期内的 pending 只有一笔。
            // 两侧卡号完全没变才算同一次申请（幂等返回）；任一侧变了就用这一次的内容原地覆盖，
            // 旧内容不该在对方收件箱里堆成第二封。行锁与裁决共用，避免覆盖和同意同时落库；
            // 过期 pending 不挡路（读取侧它已经是 `expired`）。
            const targetNumbers = targets.map((card) => card.card_number ?? card.id);
            const giveNumbers = gives.map((card) => card.card_number ?? card.id);
            if (input.source !== 'scan' && status === 'pending') {
                const duplicate = await queryOne<NamecardExchangeRow>(
                    database,
                    `SELECT ${EXCHANGE_COLUMNS} FROM public.namecard_exchanges
                      WHERE initiator_account_id=? AND target_account_id=?
                        AND status='pending' AND created_at > now() - interval '7 days'
                      LIMIT 1
                      FOR UPDATE`,
                    [input.initiatorAccountId, input.targetAccountId]
                );
                if (duplicate) {
                    const previous = exchangeRecordFromRow(duplicate);
                    if (
                        sameExchangeCardNumbers(previous.target_card_numbers, targetNumbers) &&
                        sameExchangeCardNumbers(previous.initiator_card_numbers, giveNumbers)
                    ) {
                        return {
                            exchange: previous,
                            idempotent: true,
                            targetMissingCount: await this.countMissingCollectionCardsWith(
                                database,
                                input.initiatorAccountId,
                                input.targetAccountId
                            )
                        };
                    }
                    return this.overwritePendingExchange(
                        database,
                        input,
                        duplicate.id,
                        targetNumbers,
                        giveNumbers,
                        skipped
                    );
                }
            }

            const inserted = await queryOne<NamecardExchangeRow>(
                database,
                `INSERT INTO public.namecard_exchanges
                     (id, client_exchange_id, source, status,
                      initiator_account_id, target_account_id,
                      target_card_numbers, initiator_card_numbers, skipped,
                      created_at, resolved_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                 ON CONFLICT (client_exchange_id) DO NOTHING
                 RETURNING ${EXCHANGE_COLUMNS}`,
                [
                    input.id,
                    input.clientExchangeId,
                    input.source,
                    status,
                    input.initiatorAccountId,
                    input.targetAccountId,
                    postgresBigintArray(targetNumbers),
                    postgresBigintArray(giveNumbers),
                    JSON.stringify(skipped),
                    input.at,
                    status === 'pending' ? null : input.at
                ]
            );
            if (!inserted) {
                // 并发重试：先落库的那次说了算。
                const winner = await queryOne<NamecardExchangeRow>(
                    database,
                    `SELECT ${EXCHANGE_COLUMNS} FROM public.namecard_exchanges
                      WHERE client_exchange_id=?`,
                    [input.clientExchangeId]
                );
                if (!winner) throw new Error('namecard exchange insert vanished');
                return {
                    exchange: exchangeRecordFromRow(winner),
                    idempotent: true,
                    targetMissingCount: await this.countMissingCollectionCardsWith(
                        database,
                        input.initiatorAccountId,
                        input.targetAccountId
                    )
                };
            }
            if (status === 'completed') {
                await this.addCollectionEntries(database, input, targets, gives);
            } else {
                const counterpart = await queryOne<{ display_name: string | null }>(
                    database,
                    `SELECT display_name FROM public.platform_profiles WHERE account_id=?`,
                    [input.initiatorAccountId]
                );
                const copy = cardExchangeRequestedCopy(
                    counterpart?.display_name?.trim() || '一位制作人',
                    targets.map((card) => card.card_number ?? card.id)
                );
                await insertNamecardNotification(database, {
                    recipientAccountId: input.targetAccountId,
                    kind: copy.kind,
                    cardNumber: targets[0]?.card_number ?? null,
                    exchangeId: input.id,
                    title: copy.title,
                    body: copy.body
                });
            }
            if (input.scanSessionId) {
                await executeSql(
                    database,
                    `UPDATE public.namecard_scan_sessions
                        SET consumed_at=?, consumed_by_exchange_id=?
                      WHERE id=? AND consumed_at IS NULL`,
                    [input.at, input.id, input.scanSessionId]
                );
            }
            return {
                exchange: exchangeRecordFromRow(inserted),
                idempotent: false,
                targetMissingCount: await this.countMissingCollectionCardsWith(
                    database,
                    input.initiatorAccountId,
                    input.targetAccountId
                )
            };
        });
    }

    /**
     * 用最新一次发起的内容覆盖旧的 pending（doc §7）：交换 id 不变，卡号与跳过记录换新，
     * `created_at` 刷新（有效期 = created_at + 7 天，因此跟着重置），`resolved_at` 保持空。
     * 目标方那条请求通知原地刷新——改正文、重新未读、时间刷新，不再多一封。
     */
    private async overwritePendingExchange(
        database: SqlDatabase,
        input: NamecardExchangeCommitInput,
        pendingId: string,
        targetNumbers: readonly number[],
        giveNumbers: readonly number[],
        skipped: readonly NamecardExchangeSkipRecord[]
    ): Promise<NamecardExchangeCommitResult> {
        const overwritten = await queryOne<NamecardExchangeRow>(
            database,
            `UPDATE public.namecard_exchanges
                SET target_card_numbers=?, initiator_card_numbers=?, skipped=?, created_at=?
              WHERE id=?
              RETURNING ${EXCHANGE_COLUMNS}`,
            [
                postgresBigintArray(targetNumbers),
                postgresBigintArray(giveNumbers),
                JSON.stringify(skipped),
                input.at,
                pendingId
            ]
        );
        if (!overwritten) throw new Error('namecard exchange overwrite vanished');
        const exchange = exchangeRecordFromRow(overwritten);
        const counterpart = await queryOne<{ display_name: string | null }>(
            database,
            `SELECT display_name FROM public.platform_profiles WHERE account_id=?`,
            [input.initiatorAccountId]
        );
        const copy = cardExchangeRequestedCopy(
            counterpart?.display_name?.trim() || '一位制作人',
            exchange.target_card_numbers
        );
        await refreshNamecardExchangeRequestNotification(database, {
            recipientAccountId: input.targetAccountId,
            exchangeId: pendingId,
            cardNumber: exchange.target_card_numbers[0] ?? null,
            title: copy.title,
            body: copy.body,
            at: input.at
        });
        return {
            exchange,
            idempotent: false,
            targetMissingCount: await this.countMissingCollectionCardsWith(
                database,
                input.initiatorAccountId,
                input.targetAccountId
            )
        };
    }

    /** 双向写入名片册；再抽到同一张时恢复显示。 */
    private async addCollectionEntries(
        database: SqlDatabase,
        input: NamecardExchangeCommitInput,
        targets: readonly NamecardPublicRecord[],
        gives: readonly NamecardPublicRecord[]
    ): Promise<void> {
        const pairs = [
            ...targets.map((card) => ({ collector: input.initiatorAccountId, card })),
            ...gives.map((card) => ({ collector: input.targetAccountId, card }))
        ];
        if (pairs.length === 0) return;
        await database.batch(
            pairs.map((pair) =>
                database
                    .prepare(
                        `INSERT INTO public.namecard_collection_entries
                             (id, collector_account_id, card_number, card_id,
                              exchange_id, obtained_at, hidden_at, snapshot)
                         VALUES (?, ?, ?, ?, ?, ?, NULL, ?)
                         ON CONFLICT (collector_account_id, card_number)
                         DO UPDATE SET card_id=EXCLUDED.card_id,
                                       exchange_id=EXCLUDED.exchange_id,
                                       obtained_at=EXCLUDED.obtained_at,
                                       hidden_at=NULL,
                                       snapshot=EXCLUDED.snapshot`
                    )
                    .bind(
                        randomUUID(),
                        pair.collector,
                        pair.card.card_number ?? pair.card.id,
                        pair.card.cardId ?? null,
                        input.id,
                        input.at,
                        JSON.stringify(this.collectionSnapshot(pair.card))
                    )
            )
        );
    }

    private async collectionCardNumbers(
        database: SqlDatabase,
        accountId: string,
        cardNumbers: readonly number[]
    ): Promise<Set<number>> {
        if (cardNumbers.length === 0) return new Set();
        const placeholders = cardNumbers.map(() => '?').join(',');
        const rows = await queryAll<{ card_number: number | string }>(
            database,
            `SELECT card_number FROM public.namecard_collection_entries
              WHERE collector_account_id=? AND card_number IN (${placeholders})`,
            [accountId, ...cardNumbers]
        );
        return new Set(rows.map((row) => Number(row.card_number)));
    }

    private async countMissingCollectionCardsWith(
        database: SqlDatabase,
        cardOwnerId: string,
        otherAccountId: string
    ): Promise<number> {
        const row = await queryOne<{ missing: number | string }>(
            database,
            `SELECT COUNT(*) AS missing
               FROM fudaba_cards card
              WHERE card.owner_account_id=?
                AND card.deleted_at IS NULL
                AND card.publication_status='published'
                AND ${NAMECARD_PUBLIC_ORIGIN}
                AND card.exchange_mode <> 'none'
                AND NOT EXISTS (
                    SELECT 1 FROM public.namecard_collection_entries entry
                     WHERE entry.collector_account_id=?
                       AND entry.card_number=card.card_number)`,
            [cardOwnerId, otherAccountId]
        );
        return Number(row?.missing ?? 0);
    }

    async decideExchange(input: {
        exchangeId: string;
        accountId: string;
        decision: 'accept' | 'decline';
        at: string;
    }): Promise<NamecardExchangeDecisionRecord> {
        return this.database.transaction(async (database) => {
            const row = await queryOne<NamecardExchangeRow & { stale: boolean }>(
                database,
                `SELECT ${EXCHANGE_COLUMNS},
                        (created_at < now() - interval '7 days') AS stale
                   FROM public.namecard_exchanges
                  WHERE id=? FOR UPDATE`,
                [input.exchangeId]
            );
            if (!row) return { status: 'not-found' } as const;
            if (row.target_account_id !== input.accountId) {
                return { status: 'not-found' } as const;
            }
            if (row.status !== 'pending') {
                return { status: 'expired', stale: false } as const;
            }
            // 通知正文承诺「一周内不处理将自动过期」：过期 pending 在这里落成终态，
            // 满足 `resolved_at IS NULL ⇔ pending` 的 CHECK，然后按过期拒绝这次裁决。
            if (row.stale) {
                await executeSql(
                    database,
                    `UPDATE public.namecard_exchanges
                        SET status='expired', resolved_at=?
                      WHERE id=?`,
                    [input.at, input.exchangeId]
                );
                // 请求通知里承诺过「一周内不处理将自动过期」：这里兑现成一条超时通知，
                // 与落库同一个事务，`exchange_id` 让发起方能在收件箱里打开详情。
                const expired = exchangeRecordFromRow(row);
                const target = await queryOne<{ display_name: string | null }>(
                    database,
                    `SELECT display_name FROM public.platform_profiles WHERE account_id=?`,
                    [row.target_account_id]
                );
                const copy = cardExchangeExpiredCopy(
                    target?.display_name?.trim() || '对方'
                );
                await insertNamecardNotification(database, {
                    recipientAccountId: row.initiator_account_id,
                    kind: copy.kind,
                    cardNumber: expired.target_card_numbers[0] ?? null,
                    exchangeId: row.id,
                    title: copy.title,
                    body: copy.body
                });
                return { status: 'expired', stale: true } as const;
            }
            const exchange = exchangeRecordFromRow(row);
            const status = input.decision === 'accept' ? 'completed' : 'declined';
            await executeSql(
                database,
                `UPDATE public.namecard_exchanges
                    SET status=?, resolved_at=?
                  WHERE id=?`,
                [status, input.at, input.exchangeId]
            );
            if (status === 'completed') {
                const [targets, gives] = await Promise.all([
                    this.loadExchangeCards(database, exchange.target_card_numbers),
                    this.loadExchangeCards(database, exchange.initiator_card_numbers)
                ]);
                await this.addCollectionEntries(
                    database,
                    {
                        id: exchange.id,
                        clientExchangeId: exchange.client_exchange_id,
                        source: exchange.source,
                        initiatorAccountId: exchange.initiator_account_id,
                        targetAccountId: exchange.target_account_id,
                        targetCardNumbers: exchange.target_card_numbers,
                        giveCardNumbers: exchange.initiator_card_numbers,
                        scanSessionId: null,
                        at: input.at
                    },
                    targets.filter(
                        (card) => card.owner_account_id === exchange.target_account_id
                    ),
                    gives.filter(
                        (card) => card.owner_account_id === exchange.initiator_account_id
                    )
                );
            }
            const counterpart = await queryOne<{ display_name: string | null }>(
                database,
                `SELECT display_name FROM public.platform_profiles WHERE account_id=?`,
                [input.accountId]
            );
            const counterpartName = counterpart?.display_name?.trim() || '对方';
            const copy =
                status === 'completed'
                    ? cardExchangeAcceptedCopy(counterpartName)
                    : cardExchangeDeclinedCopy(counterpartName);
            await insertNamecardNotification(database, {
                recipientAccountId: exchange.initiator_account_id,
                kind: copy.kind,
                cardNumber: exchange.target_card_numbers[0] ?? null,
                exchangeId: exchange.id,
                title: copy.title,
                body: copy.body
            });
            return { status } as const;
        });
    }

    async listExchanges(input: {
        accountId: string;
        limit: number;
        offset: number;
    }): Promise<{ rows: NamecardExchangeRecord[]; total: number }> {
        const total = await queryOne<{ total: number | string }>(
            this.database,
            `SELECT COUNT(*) AS total FROM public.namecard_exchanges
              WHERE initiator_account_id=? OR target_account_id=?`,
            [input.accountId, input.accountId]
        );
        const rows = await queryAll<NamecardExchangeRow>(
            this.database,
            `SELECT ${EXCHANGE_READ_COLUMNS} FROM public.namecard_exchanges
              WHERE initiator_account_id=? OR target_account_id=?
              ORDER BY created_at DESC, id DESC
              LIMIT ? OFFSET ?`,
            [input.accountId, input.accountId, input.limit, input.offset]
        );
        return {
            rows: rows.map(exchangeRecordFromRow),
            total: Number(total?.total ?? 0)
        };
    }

    /** 通知窗口的详情：参与者校验写在 SQL 里，非参与者与不存在的 id 同样回 null。 */
    async findExchangeDetail(input: {
        exchangeId: string;
        accountId: string;
    }): Promise<NamecardExchangeDetailRecord | null> {
        const row = await queryOne<NamecardExchangeRow>(
            this.database,
            `SELECT ${EXCHANGE_READ_COLUMNS} FROM public.namecard_exchanges
              WHERE id=? AND (initiator_account_id=? OR target_account_id=?)`,
            [input.exchangeId, input.accountId, input.accountId]
        );
        if (!row) return null;
        const exchange = exchangeRecordFromRow(row);
        const [targetCards, initiatorCards, profiles] = await Promise.all([
            this.loadExchangeCards(this.database, exchange.target_card_numbers),
            this.loadExchangeCards(this.database, exchange.initiator_card_numbers),
            queryAll<{ account_id: string; display_name: string | null }>(
                this.database,
                `SELECT account_id, display_name FROM public.platform_profiles
                  WHERE account_id IN (?, ?)`,
                [exchange.initiator_account_id, exchange.target_account_id]
            )
        ]);
        const names = new Map(
            profiles.map((profile) => [
                profile.account_id,
                profile.display_name?.trim() || '一位制作人'
            ])
        );
        const active = exchange.status === 'pending' || exchange.status === 'expired';
        return {
            id: exchange.id,
            source: exchange.source,
            status: exchange.status,
            created_at: exchange.created_at,
            expires_at: active
                ? new Date(
                      new Date(exchange.created_at).getTime() +
                          NAMECARD_EXCHANGE_PENDING_TTL_MS
                  ).toISOString()
                : null,
            initiator: {
                account_id: exchange.initiator_account_id,
                display_name:
                    names.get(exchange.initiator_account_id) ?? '一位制作人'
            },
            target: {
                account_id: exchange.target_account_id,
                display_name: names.get(exchange.target_account_id) ?? '一位制作人'
            },
            target_cards: targetCards,
            initiator_cards: initiatorCards,
            skipped: exchange.skipped
        };
    }

    /**
     * 名片册列表（PRD §7.1）：收到的条目 + 可选的「我自己的名片」先投影到同一形状，
     * 再在合并后的集合上统一筛选、排序、分页。
     *
     * 条目没有删除操作：`hidden_at` 是「默认不展示」（除非 `includeHidden`），整卡 `locked`
     * 同样不展示。原卡被后台判决删除（`deleted_at`）或物理删除（`card.id` 置空）后，整条
     * 不再出现在名片册里——`total` 与分页同步排除。卡片行还在但状态暂不入册（如 `approving`）
     * 时才用 `snapshot` 投影。
     */
    async listCollection(
        input: NamecardCollectionQueryRecord
    ): Promise<{ rows: NamecardCollectionEntryRecord[]; total: number }> {
        const ownerFilter = input.owner?.trim() || null;
        // 卡主不是自己时，「我的名片」里没有能命中筛选的条目。
        const includeOwn =
            input.includeOwn === true &&
            (ownerFilter === null || ownerFilter === input.accountId);
        const collectedValues = ownerFilter
            ? [input.accountId, ownerFilter]
            : [input.accountId];
        const collectedSql = `SELECT entry.card_number, entry.obtained_at, entry.hidden_at,
                entry.snapshot, false AS own,
                card.id AS live_id, card.publication_status AS live_status,
                card.producer_name AS live_producer_name,
                card.group_name AS live_group_name,
                card.made_on AS live_made_on,
                card.created_at AS live_created_at,
                card.sort_name_key AS live_sort_name_key,
                card.sort_name_bucket AS live_sort_name_bucket,
                card.is_original AS live_is_original,
                card.made_with_ai AS live_made_with_ai,
                card.owner_account_id AS live_owner_account_id
           FROM public.namecard_collection_entries entry
           LEFT JOIN fudaba_cards card
                  ON card.id = entry.card_id AND card.deleted_at IS NULL
          WHERE entry.collector_account_id=?
            ${input.includeHidden ? '' : 'AND entry.hidden_at IS NULL'}
            AND card.id IS NOT NULL
            ${ownerFilter ? 'AND card.owner_account_id=?' : ''}
            AND card.publication_status <> 'locked'`;
        // 自己的名片没有交换时间（PRD §6）：`obtained_at := created_at`，快照 = 当前内容。
        // 已经收在自己册里的同名卡不再重复计一条。
        const ownedSql = `SELECT card.card_number, card.created_at AS obtained_at,
                NULL::timestamptz AS hidden_at, NULL::jsonb AS snapshot, true AS own,
                card.id AS live_id, card.publication_status AS live_status,
                card.producer_name AS live_producer_name,
                card.group_name AS live_group_name,
                card.made_on AS live_made_on,
                card.created_at AS live_created_at,
                card.sort_name_key AS live_sort_name_key,
                card.sort_name_bucket AS live_sort_name_bucket,
                card.is_original AS live_is_original,
                card.made_with_ai AS live_made_with_ai,
                card.owner_account_id AS live_owner_account_id
           FROM fudaba_cards card
          WHERE card.owner_account_id=?
            AND card.deleted_at IS NULL
            AND card.publication_status='published'
            AND NOT EXISTS (
                SELECT 1 FROM public.namecard_collection_entries held
                 WHERE held.collector_account_id=card.owner_account_id
                   AND held.card_number=card.card_number)`;
        const rows = await queryAll<NamecardCollectionQueryRow>(
            this.database,
            includeOwn
                ? `${collectedSql} UNION ALL ${ownedSql}`
                : collectedSql,
            includeOwn
                ? [...collectedValues, input.accountId]
                : collectedValues
        );

        const sort = input.sort ?? 'exchange';
        const direction =
            input.dir ?? (sort === 'exchange' || sort === 'date' ? 'desc' : 'asc');
        const liveIds = rows.flatMap((row) => (row.live_id ? [row.live_id] : []));
        const [seriesByCard, favoriteOrders, seriesRanks] = await Promise.all([
            this.listNamecardSeries(this.database, liveIds),
            this.listCollectionFavoriteOrders(this.database, liveIds),
            // 企划目录顺序只差一次查询；其它排序用不上，别为它多跑一趟。
            sort === 'series'
                ? this.listCollectionSeriesRanks(this.database)
                : Promise.resolve(new Map<string, number>())
        ]);
        const prepared = rows.map((row) => ({
            row,
            snapshot: collectionSnapshotRecord(row.snapshot)
        }));
        const snapshotCharacters = await this.listCharacterOrders(
            this.database,
            prepared.flatMap(({ row, snapshot }) =>
                row.live_id ? [] : snapshot.favoriteCharacterIds
            )
        );

        const views = prepared.map(
            ({ row, snapshot }): NamecardCollectionViewRow => {
                const live = row.live_id !== null;
                const liveFavorites = live
                    ? (favoriteOrders.get(row.live_id!) ?? [])
                    : [];
                const characterKeys = live
                    ? liveFavorites.map(({ id, category, order }) => ({
                          id,
                          category,
                          order
                      }))
                    : snapshot.favoriteCharacterIds.map((id) => {
                          const catalog = snapshotCharacters.get(id);
                          // 目录里已经没有这个角色时，筛选仍按 id 生效，排序按分类末尾。
                          return {
                              id,
                              category: catalog?.category ?? '\uffff',
                              order: catalog?.order ?? Number.MAX_SAFE_INTEGER
                          };
                      });
                const madeOn =
                    (live ? row.live_made_on : snapshot.madeOn)?.trim() || null;
                const obtainedAtMs = new Date(row.obtained_at).getTime();
                const createdMs =
                    live && row.live_created_at
                        ? new Date(row.live_created_at).getTime()
                        : null;
                const madeOnRank = madeOn === null ? 2 : madeOn.length >= 7 ? 0 : 1;
                const seriesCodes = live
                    ? (seriesByCard.get(row.live_id!) ?? [])
                    : snapshot.seriesCodes;
                // 多企划不参与目录比较；单一企划（含零企划）按位次排序，
                // 目录里查不到（或没有企划）的位次垫底，再按 code 收尾。
                const seriesCode = seriesCodes[0] ?? '';
                return {
                    row,
                    own: row.own === true,
                    cardNumber: Number(row.card_number),
                    obtainedAtMs,
                    snapshot,
                    seriesCodes,
                    multiSeries: seriesCodes.length > 1,
                    seriesRank:
                        seriesRanks.get(seriesCode) ?? Number.MAX_SAFE_INTEGER,
                    seriesCode,
                    characterIds: characterKeys.map((key) => key.id),
                    characterKeys,
                    producerName: live
                        ? row.live_producer_name
                        : snapshot.producerName,
                    groupName: live ? row.live_group_name : snapshot.groupName,
                    // 实时列是唯一真相；只有原卡行已不在时才回退快照。
                    isOriginal: live
                        ? row.live_is_original === true
                        : snapshot.isOriginal,
                    madeWithAi: live
                        ? row.live_made_with_ai === true
                        : snapshot.madeWithAi,
                    ownerAccountId:
                        row.live_owner_account_id ??
                        (row.own ? input.accountId : null),
                    madeOn,
                    madeOnRank,
                    dateSortValue:
                        madeOnRank < 2
                            ? (madeOn ?? '')
                            : new Date(createdMs ?? obtainedAtMs).toISOString(),
                    sortNameKey: live
                        ? (row.live_sort_name_key ?? '')
                        : snapshot.sortNameKey,
                    sortNameBucket: live
                        ? snapshotBucket(
                              row.live_sort_name_bucket === null
                                  ? null
                                  : Number(row.live_sort_name_bucket)
                          )
                        : snapshot.sortNameBucket
                };
            }
        );

        // 内容筛选的「命中集合」：只有内容条件参与【反向排除】。`owner` /
        // `includeOwn` / `includeHidden` 与 `locked` / 已删卡在 SQL 与合并阶段处理，
        // 不属于这里，因此不会被取反。
        const content = namecardContentMatcher(input);
        // 没有任何内容条件时【反向排除】等价于不筛：不能把所有行都排除。
        const invert = input.invert === true && content.hasContentFilter;

        const filtered = views.filter((view) => {
            const matched = content.matches(view);
            return invert ? !matched : matched;
        });

        filtered.sort((left, right) =>
            compareCollectionRows(left, right, sort, direction)
        );

        const page = filtered.slice(input.offset, input.offset + input.limit);
        const pageNumbers = page.map((view) => view.cardNumber);
        const liveByNumber = new Map(
            (
                await this.loadShelfCards(this.database, pageNumbers)
            ).map((card) => [card.card_number ?? card.id, card])
        );
        const ownNumbers = page
            .filter((view) => view.own)
            .map((view) => view.cardNumber);
        for (const card of await this.loadOwnCollectionCards(
            this.database,
            input.accountId,
            ownNumbers
        )) {
            liveByNumber.set(card.card_number ?? card.id, card);
        }
        // 卡主身份按页批量解析，避免逐条查询。
        const ownerProfiles = await this.collectionOwnerProfiles(
            page.flatMap((view) =>
                view.ownerAccountId ? [view.ownerAccountId] : []
            )
        );

        return {
            total: filtered.length,
            rows: page.map((view) => {
                const card = liveByNumber.get(view.cardNumber) ?? null;
                const ownerProfile = view.ownerAccountId
                    ? ownerProfiles.get(view.ownerAccountId)
                    : undefined;
                return {
                    card_number: view.cardNumber,
                    obtained_at: view.row.obtained_at,
                    hidden_at: view.row.hidden_at,
                    own: view.own,
                    owner: ownerProfile
                        ? {
                              account_id: ownerProfile.account_id,
                              uid: String(ownerProfile.uid),
                              display_name: ownerProfile.display_name
                          }
                        : null,
                    card,
                    card_status: view.own
                        ? 'published'
                        : shelfCardStatus(view.row.live_status),
                    // 自己的名片没有交换那一刻的快照；投影直接取当前内容，
                    // 读不到实时行时退回本页已知的元数据（不编造致谢等未读字段）。
                    snapshot: view.own
                        ? card
                            ? this.collectionSnapshot(card)
                            : {
                                  ...view.snapshot,
                                  producerName: view.producerName,
                                  groupName: view.groupName,
                                  madeOn: view.madeOn,
                                  sortNameKey: view.sortNameKey,
                                  sortNameBucket: view.sortNameBucket,
                                  seriesCodes: view.seriesCodes,
                                  favoriteCharacterIds: view.characterIds
                              }
                        : view.snapshot
                };
            })
        };
    }

    /** 批量解析卡主资料（同一套列与账号准入，见 `COLLECTION_OWNER_PROFILE_SELECT`）。 */
    private async collectionOwnerProfiles(
        accountIds: readonly string[]
    ): Promise<Map<string, PublicProfileRecord>> {
        const unique = [...new Set(accountIds)].filter(
            (accountId) => accountId.length > 0
        );
        if (unique.length === 0) return new Map();
        const rows = await queryAll<PublicProfileRecord>(
            this.database,
            `${COLLECTION_OWNER_PROFILE_SELECT}
               AND profile.account_id IN (${unique.map(() => '?').join(', ')})`,
            unique
        );
        return new Map(rows.map((row) => [row.account_id, row]));
    }

    /**
     * 所属用户选择器：自己 + 自己册内条目的卡主（卡行仍在、未锁定、未判删）。
     * 只按显示名做不区分大小写的包含搜索，并按名称排序；不查全站账号目录。
     */
    async listCollectionOwners(input: {
        accountId: string;
        q?: string;
        limit: number;
    }): Promise<PublicProfileRecord[]> {
        const needle = input.q?.trim() ?? '';
        return queryAll<PublicProfileRecord>(
            this.database,
            `WITH owners AS (
                 SELECT CAST(? AS text) AS account_id
                 UNION
                 SELECT card.owner_account_id
                   FROM public.namecard_collection_entries entry
                   JOIN fudaba_cards card
                     ON card.id = entry.card_id AND card.deleted_at IS NULL
                  WHERE entry.collector_account_id = ?
                    AND card.publication_status <> 'locked'
                    AND card.owner_account_id IS NOT NULL
             )
             ${COLLECTION_OWNER_OPTIONS_SELECT}
               AND (? = '' OR position(lower(?) in lower(profile.display_name)) > 0)
              ORDER BY profile.display_name, profile.account_id
              LIMIT ?`,
            [
                input.accountId,
                input.accountId,
                needle,
                needle,
                input.limit
            ]
        );
    }

    async setCollectionHidden(input: {
        accountId: string;
        cardNumber: number;
        hidden: boolean;
        at: string;
    }): Promise<boolean> {
        const row = await queryOne<{ id: string }>(
            this.database,
            `UPDATE public.namecard_collection_entries
                SET hidden_at=?
              WHERE collector_account_id=? AND card_number=?
              RETURNING id`,
            [input.hidden ? input.at : null, input.accountId, input.cardNumber]
        );
        return Boolean(row);
    }

    async listCollectedCardNumbers(input: {
        collectorAccountId: string;
        cardNumbers: readonly number[];
    }): Promise<Set<number>> {
        return this.collectionCardNumbers(
            this.database,
            input.collectorAccountId,
            input.cardNumbers
        );
    }

    async getCardLayout(
        accountId: string
    ): Promise<NamecardCardLayoutRecord | null> {
        const row = await queryOne<{ layout: unknown }>(
            this.database,
            `SELECT layout FROM public.namecard_profile_layouts
              WHERE owner_account_id=?`,
            [accountId]
        );
        return row ? cardLayoutFromJson(row.layout) : null;
    }

    async saveCardLayout(input: NamecardCardLayoutSaveInput): Promise<void> {
        const cards = await queryAll<{
            id: string;
            card_number: number | string;
            publication_status: string;
            exchange_mode: string;
            visible: boolean;
            is_group_card: boolean;
            public_origin: boolean;
        }>(
            this.database,
            `SELECT id, card_number, publication_status, exchange_mode, visible, is_group_card,
                    (${NAMECARD_PUBLIC_ORIGIN}) AS public_origin
               FROM fudaba_cards
              WHERE owner_account_id=? AND deleted_at IS NULL
                AND publication_status<>'hidden'`,
            [input.accountId]
        );
        const byNumber = new Map(
            cards.map((card) => [Number(card.card_number), card])
        );
        const byId = new Map(cards.map((card) => [card.id, card]));

        const seen = new Set<number>();
        for (const number of [
            ...input.groups.flatMap((group) => group.cardNumbers),
            ...input.defaultCardNumbers
        ]) {
            if (!byNumber.has(number)) {
                throw new NamecardCardLayoutError('布局里有不属于你的名片');
            }
            if (seen.has(number)) {
                throw new NamecardCardLayoutError('同一张名片在布局里出现了多次');
            }
            seen.add(number);
        }

        const settings = new Map(
            input.cardSettings.map((setting) => [setting.cardId, setting])
        );
        for (const setting of settings.values()) {
            const card = byId.get(setting.cardId);
            if (!card) {
                throw new NamecardCardLayoutError('设置里有不属于你的名片');
            }
            if (card.is_group_card) {
                throw new NamecardCardLayoutError(
                    '团体名片固定为自动交换且始终展示'
                );
            }
        }

        // 同一份请求里刚改成 `auto` 的卡也可以直接进清单。
        const quickIds = input.quickCardNumbers.map((number) => {
            const card = byNumber.get(number);
            const mode =
                settings.get(card?.id ?? '')?.exchangeMode ??
                card?.exchange_mode;
            if (
                !card ||
                card.publication_status !== 'published' ||
                // 读侧（`listQuickExchangeCards`）与候选清单都要求「有线上页」，写入侧必须同口径，
                // 否则会保存成功却在返回的 `quickCardNumbers` 里消失。
                !card.public_origin ||
                mode !== 'auto'
            ) {
                throw new NamecardCardLayoutError(
                    '快速交换清单只收已发布且自动交换的名片'
                );
            }
            return card.id;
        });

        // 空分组在保存时删掉（公开页不渲染空标题）。
        const stored: NamecardCardLayoutRecord = {
            groups: input.groups
                .map((group) => ({
                    id: group.id ?? randomUUID(),
                    title: group.title,
                    cardNumbers: [...new Set(group.cardNumbers)]
                }))
                .filter((group) => group.cardNumbers.length > 0),
            defaultCardNumbers: [...new Set(input.defaultCardNumbers)]
        };

        await this.database.transaction(async (database) => {
            await executeSql(
                database,
                `INSERT INTO public.namecard_profile_layouts
                     (owner_account_id, layout, updated_at)
                 VALUES (?, ?, ?)
                 ON CONFLICT (owner_account_id) DO UPDATE
                     SET layout=EXCLUDED.layout, updated_at=EXCLUDED.updated_at`,
                [input.accountId, JSON.stringify(stored), input.at]
            );
            await executeSql(
                database,
                `DELETE FROM public.namecard_quick_exchange_cards WHERE account_id=?`,
                [input.accountId]
            );
            if (quickIds.length > 0) {
                await database.batch(
                    quickIds.map((cardId) =>
                        database
                            .prepare(
                                `INSERT INTO public.namecard_quick_exchange_cards
                                     (account_id, card_id) VALUES (?, ?)
                                 ON CONFLICT DO NOTHING`
                            )
                            .bind(input.accountId, cardId)
                    )
                );
            }
            for (const setting of settings.values()) {
                await executeSql(
                    database,
                    `UPDATE fudaba_cards
                        SET visible=COALESCE(?, visible),
                            exchange_mode=COALESCE(?, exchange_mode),
                            -- 待审修订发布时会整份覆盖这两列，改动必须同时并进 pending_payload，
                            -- 否则审核通过的一刻批量改动被静默回滚（与 fudaba-repository.ts 的免审分支同款写法）。
                            pending_payload=CASE WHEN pending_payload IS NULL THEN NULL
                                ELSE pending_payload || jsonb_strip_nulls(
                                    jsonb_build_object(
                                        'visible', CAST(? AS boolean),
                                        'exchange_mode', CAST(? AS text))) END,
                            updated_at=?
                      WHERE id=? AND owner_account_id=? AND deleted_at IS NULL`,
                    [
                        setting.visible ?? null,
                        setting.exchangeMode ?? null,
                        setting.visible ?? null,
                        setting.exchangeMode ?? null,
                        input.at,
                        setting.cardId,
                        input.accountId
                    ]
                );
            }
        });
    }

    async listOwnedPublishedCardsAll(
        accountId: string
    ): Promise<NamecardPublicRecord[]> {
        const rows = await queryAll<NamecardCardRow>(
            this.database,
            `SELECT ${NAMECARD_COLUMNS} FROM fudaba_cards
              WHERE owner_account_id=? AND deleted_at IS NULL
                AND publication_status='published' AND visible
              ORDER BY card_number DESC`,
            [accountId]
        );
        return (await this.attachNamecardFavorites(
            this.database,
            rows,
            'live'
        )) as NamecardPublicRecord[];
    }

    /**
     * 已经收到这张卡的人可以继续读它的页面对象：原卡被持有者下线（`hidden`）后仍然放行。
     * `published` 走公开读取、`locked` 谁都不放，所以这里只认 `hidden`（doc §5）。
     */
    async findHeldCardPageKey(input: {
        viewerAccountId: string;
        cardId: string;
        pageId: string;
    }): Promise<string | null> {
        const row = await queryOne<{ object_version: string }>(
            this.database,
            `SELECT page.object_version
               FROM fudaba_cards card
               JOIN fudaba_card_pages page
                 ON page.card_id=card.id AND page.queue='live' AND page.page_id=?
              WHERE card.id=?
                AND card.deleted_at IS NULL
                AND card.publication_status='hidden'
                AND EXISTS (
                    SELECT 1 FROM public.namecard_collection_entries entry
                     WHERE entry.collector_account_id=?
                       AND entry.card_id=card.id)
              LIMIT 1`,
            [input.pageId, input.cardId, input.viewerAccountId]
        );
        if (!row) return null;
        return cardPageObjectKey(
            input.cardId,
            'live',
            input.pageId,
            row.object_version
        );
    }

    async listQuickExchangeCards(
        accountId: string
    ): Promise<NamecardPublicRecord[]> {
        const rows = await queryAll<{ card_number: number | string }>(
            this.database,
            `SELECT card.card_number
               FROM public.namecard_quick_exchange_cards quick
               JOIN fudaba_cards card ON card.id=quick.card_id
              WHERE quick.account_id=?
                AND card.deleted_at IS NULL
                AND card.publication_status='published'
                -- 只有 auto 能留在清单里；manual/none 一律实时过滤掉（doc §2.3 / §3.4）。
                AND card.exchange_mode='auto'
                AND ${NAMECARD_PUBLIC_ORIGIN}
              ORDER BY quick.added_at DESC, card.card_number DESC
              LIMIT 20`,
            [accountId]
        );
        return this.loadExchangeCards(
            this.database,
            rows.map((row) => Number(row.card_number))
        );
    }

    async replaceQuickExchangeCards(input: {
        accountId: string;
        cardNumbers: number[];
    }): Promise<void> {
        const unique = [...new Set(input.cardNumbers)].slice(0, 20);
        const cards = await this.loadExchangeCards(this.database, unique);
        // 写入就只收 `published + auto`（`loadExchangeCards` 已经保证 published）：
        // `manual` 要逐张确认，`none` 不接受他人发起，两者都不属于「一页全收」（doc §2.3 / §3.4）。
        const allowed = cards.filter(
            (card) =>
                card.owner_account_id === input.accountId &&
                card.exchange_mode === 'auto'
        );
        await this.database.transaction(async (database) => {
            await executeSql(
                database,
                `DELETE FROM public.namecard_quick_exchange_cards WHERE account_id=?`,
                [input.accountId]
            );
            if (allowed.length === 0) return;
            await database.batch(
                allowed.map((card) =>
                    database
                        .prepare(
                            `INSERT INTO public.namecard_quick_exchange_cards
                                 (account_id, card_id) VALUES (?, ?)
                             ON CONFLICT DO NOTHING`
                        )
                        .bind(input.accountId, card.cardId ?? String(card.card_number))
                )
            );
        });
    }

    async listExchangeCandidates(
        accountId: string
    ): Promise<NamecardPublicRecord[]> {
        const rows = await queryAll<NamecardCardRow>(
            this.database,
            `SELECT ${NAMECARD_COLUMNS} FROM fudaba_cards
              WHERE owner_account_id=?
                AND deleted_at IS NULL
                AND publication_status='published'
                AND ${NAMECARD_PUBLIC_ORIGIN}
              ORDER BY card_number DESC`,
            [accountId]
        );
        return (await this.attachNamecardFavorites(
            this.database,
            rows,
            'live'
        )) as NamecardPublicRecord[];
    }

    /** 分享短链固定不变：卡片没有就补一条，已存在则原样返回。 */
    async ensureExchangeLink(cardId: string): Promise<string> {
        const existing = await queryOne<{ slug: string }>(
            this.database,
            `SELECT slug FROM public.namecard_exchange_links WHERE card_id=?`,
            [cardId]
        );
        if (existing?.slug) return existing.slug;
        const created = await queryOne<{ slug: string }>(
            this.database,
            `INSERT INTO public.namecard_exchange_links (card_id, slug)
             VALUES (?, ?)
             ON CONFLICT (card_id) DO UPDATE SET slug=namecard_exchange_links.slug
             RETURNING slug`,
            [cardId, exchangeSlugForCard(cardId)]
        );
        return created?.slug ?? exchangeSlugForCard(cardId);
    }

    async findCardByExchangeSlug(
        slug: string
    ): Promise<NamecardPublicRecord | null> {
        const row = await queryOne<{ card_id: string }>(
            this.database,
            `SELECT card_id FROM public.namecard_exchange_links WHERE slug=?`,
            [slug]
        );
        if (!row) return null;
        const cards = await this.loadExchangeCardsByIds(this.database, [row.card_id]);
        return cards[0] ?? null;
    }

    /** 属主侧单卡分享链接：先认卡片归属，再复用同一份短链规则。 */
    async ensureExchangeSlugForOwnerCard(input: {
        ownerAccountId: string;
        cardNumber: number;
    }): Promise<string | null> {
        const row = await queryOne<{ id: string }>(
            this.database,
            `SELECT id FROM fudaba_cards
              WHERE owner_account_id=? AND card_number=? AND deleted_at IS NULL`,
            [input.ownerAccountId, input.cardNumber]
        );
        if (!row) return null;
        return this.ensureExchangeLink(row.id);
    }

    private async loadExchangeCardsByIds(
        database: SqlDatabase,
        cardIds: readonly string[]
    ): Promise<NamecardPublicRecord[]> {
        if (cardIds.length === 0) return [];
        const placeholders = cardIds.map(() => '?').join(',');
        const rows = await queryAll<NamecardCardRow>(
            database,
            `SELECT ${NAMECARD_COLUMNS} FROM fudaba_cards
              WHERE id IN (${placeholders})
                AND deleted_at IS NULL
                AND publication_status='published'
                AND ${NAMECARD_PUBLIC_ORIGIN}`,
            [...cardIds]
        );
        return (await this.attachNamecardFavorites(
            database,
            rows,
            'live'
        )) as NamecardPublicRecord[];
    }

    async findExchangeTarget(handle: string): Promise<{
        profile: PublicProfileRecord;
        cards: NamecardPublicRecord[];
    } | null> {
        const profile = await this.findPublicProfile(handle);
        if (!profile) return null;
        const rows = await queryAll<NamecardCardRow>(
            this.database,
            `SELECT ${NAMECARD_COLUMNS} FROM fudaba_cards card
              WHERE owner_account_id=?
                AND deleted_at IS NULL
                AND publication_status='published'
                AND card.exchange_mode <> 'none'
                AND ${NAMECARD_PUBLIC_ORIGIN}
              ORDER BY card_number DESC
              LIMIT 20`,
            [profile.account_id]
        );
        const cards = (await this.attachNamecardFavorites(
            this.database,
            rows,
            'live'
        )) as NamecardPublicRecord[];
        return { profile, cards };
    }

    async createScanSession(input: {
        id: string;
        tokenHash: string;
        accountId: string;
        cardNumbers: number[];
        expiresAt: string;
    }): Promise<void> {
        await executeSql(
            this.database,
            `INSERT INTO public.namecard_scan_sessions
                 (id, token_hash, account_id, card_numbers, expires_at)
             VALUES (?, ?, ?, ?, ?)`,
            [
                input.id,
                input.tokenHash,
                input.accountId,
                postgresBigintArray(input.cardNumbers),
                input.expiresAt
            ]
        );
    }

    async findScanSession(
        tokenHash: string
    ): Promise<NamecardScanSessionRecord | null> {
        return queryOne<NamecardScanSessionRecord>(
            this.database,
            `SELECT id, account_id, card_numbers, expires_at, consumed_at,
                    consumed_by_exchange_id
               FROM public.namecard_scan_sessions WHERE token_hash=?`,
            [tokenHash]
        );
    }

    async findOwnedScanSession(
        tokenHash: string,
        accountId: string
    ): Promise<NamecardScanSessionRecord | null> {
        return queryOne<NamecardScanSessionRecord>(
            this.database,
            `SELECT id, account_id, card_numbers, expires_at, consumed_at,
                    consumed_by_exchange_id
               FROM public.namecard_scan_sessions
              WHERE token_hash=? AND account_id=?`,
            [tokenHash, accountId]
        );
    }

}
