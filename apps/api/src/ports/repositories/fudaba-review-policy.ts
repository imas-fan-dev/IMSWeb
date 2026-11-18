import type { FudabaCardCredit, FudabaPendingCardPayload } from '@/ports/repositories/fudaba';
import type { NamecardLifecycleStatus } from '@/ports/repositories/namecards';

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
type ComparedReviewField =
    | 'bio'
    | 'is_group_card'
    | 'is_original'
    | 'producer_name'
    | 'trade_note';

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
    isGroupCard: boolean;
    groupName: string | null;
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
    isGroupCard: boolean;
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
        current.isGroupCard === next.is_group_card &&
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
    // The flag itself always needs a reviewer: it changes who the card belongs
    // to and pins the exchange mode.
    if (current.isGroupCard !== next.is_group_card) return true;
    // On a group card the group name is the primary display name and the value
    // search matches on, so renaming it is content. On a personal card it stays
    // an accessory detail and publishes at once.
    if (
        (current.isGroupCard || next.is_group_card) &&
        text(current.groupName) !== text(next.group_name)
    ) {
        return true;
    }
    if (text(current.producerName) !== text(next.producer_name)) return true;
    if (text(current.bio) !== text(next.bio)) return true;
    if (text(current.tradeNote) !== text(next.trade_note)) return true;
    return current.isOriginal !== next.is_original;
}

export const fudabaReviewPolicy: FudabaReviewPolicy = { requiresCardReview };

/* ------------------------------------------------------------------------
 * 评审状态机（两条审核链路的唯一判定处）
 *
 * P1（`SqlCoreRepository`，主键 `card_number`）与 P2（`SqlFudabaRepository`，
 * 主键 `id`）各自保留自己的 SQL、主键与列，但「这一判决落到哪一列、要不要提升
 * 待审页」只在这里判定：两个仓储都把这个模块当成唯一规则表，失败恢复也不再各写
 * 一套。
 *
 * 队列里只有两类对象，两个仓储本来就按同一条件分支：
 * - `submission`：卡片本身还没上线（`publication_status` 为 `pending`/`approving`）；
 * - `revision`：已发布卡上有一份待审改版（`review_status='pending'`）。
 *
 * 失败恢复（本模块钉死的语义，也是 P1 一直以来的语义）：认领只把行推进到
 * `approving` 并 `revision+1`；判决抛错/冲突时**保留**这一状态供调用方重试，
 * 绝不回滚到 `pending`，也绝不再次推进 revision。
 * ---------------------------------------------------------------------- */

/** `fudaba_cards.review_status`：待审改版的判决，`null` 表示没有待审改版。 */
export type NamecardReviewRevisionStatus = 'pending' | 'rejected' | 'locked' | null;

/** 一条审核记录的判定输入；两列都按列值原样传入。 */
export interface NamecardReviewState {
    /** `fudaba_cards.publication_status`。 */
    readonly publicationStatus: string;
    /** `fudaba_cards.review_status`。 */
    readonly reviewStatus: string | null;
}

/** 判决对象：卡片本身的首投，或已发布卡上的待审改版。 */
export type NamecardReviewSubject = 'submission' | 'revision';

/** 审核动作：结论（通过/驳回/违规）与后台处置（锁定/解锁/删除）。 */
export type NamecardReviewAction =
    | 'publish'
    | 'reject'
    | 'flag'
    | 'lock'
    | 'unlock'
    | 'delete';

/** 判决被拒的原因；调用方映射到各自的结果词表（`withdrawn` → 410）。 */
export type NamecardReviewRefusal = 'withdrawn' | 'conflict';

export interface NamecardReviewVerdict {
    readonly subject: NamecardReviewSubject;
    /**
     * 判决后的 `publication_status`。列在数据库里是自由文本，不改动线上状态的
     * 判决（改版驳回/违规、删除）原样回传当前值，调用方直接绑定即可。
     */
    readonly publicationStatus: string;
    /** 判决后的 `review_status`；同上，`null` 表示没有待审改版。 */
    readonly reviewStatus: string | null;
    /**
     * 判决后要把待审页对象/页面行提升到线上：只有「改版通过」。
     * 提升本身由 `promoteCardPageObjects` 与仓储各自的页面行 SQL 完成，这里只判定。
     */
    readonly promotesPages: boolean;
    /** 删除判决：整行打上 `deleted_at`，不再出现在任何墙上。 */
    readonly tombstones: boolean;
    /** 每次判决恰好推进这么多 revision；失败不推进，调用方不得硬编码。 */
    readonly revisionDelta: 1;
}

export type NamecardReviewPlan =
    | { readonly allowed: false; readonly reason: NamecardReviewRefusal }
    | ({ readonly allowed: true } & NamecardReviewVerdict);

/** 首投三态：判决直接落在卡片自身。 */
const SUBMISSION_VERDICTS: Readonly<
    Record<'publish' | 'reject' | 'flag', NamecardLifecycleStatus>
> = {
    publish: 'published',
    reject: 'rejected',
    flag: 'locked'
};

/** 改版三态：判决落在待审副本上。 */
const REVISION_VERDICTS: Readonly<
    Record<'publish' | 'reject' | 'flag', NamecardReviewRevisionStatus>
> = {
    publish: null,
    reject: 'rejected',
    flag: 'locked'
};

/** 队列成员判定；`revision` 优先，与两个仓储的 `staged` 分支一致。 */
export function namecardReviewSubject(
    state: NamecardReviewState
): NamecardReviewSubject | null {
    if (state.reviewStatus === 'pending') return 'revision';
    return state.publicationStatus === 'pending' || state.publicationStatus === 'approving'
        ? 'submission'
        : null;
}

/**
 * 一次判决的落点。`lock`/`unlock`/`delete` 的判定就是它们各自的前置条件：
 * 已锁定的卡不能再锁，未锁定的卡不能解锁，删除对任何还存在的行都成立。
 */
export function planNamecardReview(
    state: NamecardReviewState,
    action: NamecardReviewAction
): NamecardReviewPlan {
    // 删除对任何还存在的行都成立（撤回不是障碍）：它不动线上状态，只把整行打上
    // `deleted_at` 并丢弃待审改版。
    if (action === 'delete') {
        return {
            allowed: true,
            subject: namecardReviewSubject(state) ?? 'submission',
            publicationStatus: state.publicationStatus,
            reviewStatus: null,
            promotesPages: false,
            tombstones: true,
            revisionDelta: 1
        };
    }
    // 已经撤回投稿的卡不再接受任何判决。
    if (state.publicationStatus === 'withdrawn') {
        return { allowed: false, reason: 'withdrawn' };
    }
    const subject = namecardReviewSubject(state);
    switch (action) {
        case 'publish':
        case 'reject':
        case 'flag': {
            if (!subject) return { allowed: false, reason: 'conflict' };
            if (subject === 'revision') {
                return {
                    allowed: true,
                    subject,
                    // 改版判决不动卡片本身的线上状态；通过时整份改版上线。
                    publicationStatus: action === 'publish'
                        ? 'published'
                        : state.publicationStatus,
                    reviewStatus: REVISION_VERDICTS[action],
                    promotesPages: action === 'publish',
                    tombstones: false,
                    revisionDelta: 1
                };
            }
            return {
                allowed: true,
                subject,
                publicationStatus: SUBMISSION_VERDICTS[action],
                reviewStatus: state.reviewStatus,
                promotesPages: false,
                tombstones: false,
                revisionDelta: 1
            };
        }
        case 'lock': {
            if (state.publicationStatus === 'locked') {
                return { allowed: false, reason: 'conflict' };
            }
            // 锁定是终态处置：待审改版与暂存载荷一起丢弃。
            return {
                allowed: true,
                subject: subject ?? 'submission',
                publicationStatus: 'locked',
                reviewStatus: null,
                promotesPages: false,
                tombstones: false,
                revisionDelta: 1
            };
        }
        case 'unlock': {
            if (state.publicationStatus !== 'locked') {
                return { allowed: false, reason: 'conflict' };
            }
            // 解锁把卡放回待审队列，revision 列不动。
            return {
                allowed: true,
                subject: 'submission',
                publicationStatus: 'pending',
                reviewStatus: state.reviewStatus,
                promotesPages: false,
                tombstones: false,
                revisionDelta: 1
            };
        }
    }
}

export type NamecardReviewRetryStatus = 'resumed' | 'withdrawn' | 'conflict';

export interface NamecardReviewRetryState extends NamecardReviewState {
    /** 行的当前 `revision`。 */
    readonly revision: number;
}

/**
 * 两阶段审核第一步（`begin*`）的 CAS 没命中时，这一行还能不能判。
 *
 * 幂等重试：上次尝试已经把行推进到 `approving` 并 `revision+1`，所以
 * `expectedRevision` 与 `expectedRevision+1` 都算「上次的残留」→ `resumed`。
 * 两个仓储都必须把 `resumed` 当成功处理，否则失败过的行永远无法再通过。
 */
export function classifyNamecardReviewRetry(
    state: NamecardReviewRetryState,
    expectedRevision: number
): NamecardReviewRetryStatus {
    if (state.publicationStatus === 'withdrawn') return 'withdrawn';
    if (!namecardReviewSubject(state)) return 'conflict';
    return state.revision === expectedRevision || state.revision === expectedRevision + 1
        ? 'resumed'
        : 'conflict';
}
