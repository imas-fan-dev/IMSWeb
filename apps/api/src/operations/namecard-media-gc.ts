/**
 * 名片媒体 GC（`ops:namecards:media-gc`）。
 *
 * 迁移完成、观察期结束之后，旧布局对象、兼容资产、旧上传路径、写时缩略图、
 * 无引用的缓存与孤儿页面对象都可以清掉。判定只依赖「引用集 + 年龄」，不依赖
 * 执行时间点，因此可以重复运行：
 *
 * - 引用集 = `fudaba_card_pages` 每行算出的页面 key（`queue` 与 `object_queue`
 *   两种落点）+ 该 key 的四档缓存 key。引用集内的 key 绝不删除。
 * - `publication_status='approving'` 的卡片整卡跳过：审批正在读/写这些对象。
 * - 早于 `--older-than`（默认 7 天）的对象才允许删除，覆盖在途请求。
 * - 删除走 `deleteObjectWithCompensation`，失败进补偿队列。
 *
 * 默认 dry-run（只输出清单）；`--apply` 才真正删除。
 *
 *   pnpm --filter @imsweb/api ops:namecards:media-gc -- --json
 *   pnpm --filter @imsweb/api ops:namecards:media-gc -- --card=801 --older-than=7d
 *   pnpm --filter @imsweb/api ops:namecards:media-gc -- --apply
 */
import type { ObjectStorage } from '@/ports/object-storage';
import {
    deleteObjectWithCompensation,
    type ObjectCleanupServices
} from '@/utils/storage/delete-object';
import {
    CARD_PAGE_WIDTHS,
    cardPageCacheObjectKey,
    cardPageObjectKey
} from '@/utils/storage/business-object-keys';

/** 默认年龄窗口：7 天，足以让在途的旧地址请求走完。 */
export const DEFAULT_MEDIA_GC_OLDER_THAN_MS = 7 * 24 * 60 * 60 * 1000;

const CARD_ROOT = 'community/fudaba/cards/';
const COMPAT_ROOT = 'community/namecards/assets/';
const LEGACY_UPLOAD_ROOT = 'uploads/namecard/';

/** 默认扫描范围：新布局卡片目录 + 兼容资产 + 旧上传目录。 */
export const DEFAULT_MEDIA_GC_PREFIXES = [
    'community/fudaba/cards',
    'community/namecards/assets',
    'uploads/namecard'
] as const;

const PAGE_ID = '(?:front|back|page-[0-9a-f-]{8,})';
const IMAGE_EXTENSION = '(?:webp|jpg|jpeg|png|avif)';
const CARD_ID_KEY = new RegExp(`^${CARD_ROOT}([^/]+)/`);
const PAGE_OBJECT_KEY = new RegExp(
    `^${CARD_ROOT}([^/]+)/(live|pending)/(${PAGE_ID})\\.([0-9a-f-]{8,})\\.webp$`
);
const PAGE_CACHE_KEY = new RegExp(
    `^${CARD_ROOT}([^/]+)/(live|pending)/cache/(${PAGE_ID})\\.([0-9a-f-]{8,})\\.(\\d+)\\.webp$`
);
const LEGACY_ROOT_KEY = new RegExp(
    `^${CARD_ROOT}([^/]+)/(?:front|back|middle-\\d+)\\.${IMAGE_EXTENSION}$`
);
const LEGACY_VERSION_KEY = new RegExp(
    `^${CARD_ROOT}([^/]+)/versions/[^/]+/(?:media|front|back|middle-\\d+)\\.${IMAGE_EXTENSION}$`
);
const CARD_DIRECTORY_KEY = new RegExp(`^${CARD_ROOT}([^/]+)/(live|pending)/`);
const THUMBNAIL_KEY = /(?:^|\/)(?:[^/]+\.)?thumbnail\.(?:jpe?g|png|webp)$/;

export type NamecardMediaGcAction = 'delete' | 'keep' | 'skip';

export interface NamecardMediaGcVerdict {
    action: NamecardMediaGcAction;
    reason: string;
}

export interface NamecardMediaGcEntry extends NamecardMediaGcVerdict {
    key: string;
}

/**
 * 安全判定所需的数据：引用集、每张卡的 live/pending 行是否存在、审批中的卡。
 * 全部由数据库（`fudaba_card_pages` / `fudaba_cards`）派生，不含执行时间信息。
 */
export interface NamecardMediaGcReferenceContext {
    referencedKeys: ReadonlySet<string>;
    liveCardIds: ReadonlySet<string>;
    pendingCardIds: ReadonlySet<string>;
    approvingCardIds: ReadonlySet<string>;
}

export interface NamecardMediaGcListedKey {
    key: string;
    uploadedAt?: Date | null;
}

export interface NamecardMediaGcPlanInput {
    objects: readonly NamecardMediaGcListedKey[];
    context: NamecardMediaGcReferenceContext;
    now: Date;
    olderThanMs: number;
    limit?: number | null;
    /** 扫描结果通常不带时间戳，删除候选的年龄在此补齐（默认读对象存储）。 */
    ageOf?: (key: string) =>
        | Promise<Date | null | undefined>
        | Date
        | null
        | undefined;
}

export interface NamecardMediaGcPlan {
    scanned: number;
    kept: number;
    skipped: number;
    entries: NamecardMediaGcEntry[];
    deletions: string[];
}

export interface NamecardMediaGcSqlRunner {
    query<T>(
        text: string,
        values?: unknown[]
    ): Promise<{ rows: T[] }>;
}

export interface NamecardMediaGcDependencies {
    /** 只读普查专用连接由调用方创建（CLI/镜像启动器），src 不直接依赖 pg。 */
    database: NamecardMediaGcSqlRunner;
    storage?: Pick<ObjectStorage, 'list' | 'get'> | null;
    cleanup?: ObjectCleanupServices | null;
    clock?: () => Date;
}

export interface NamecardMediaGcOptions {
    apply?: boolean;
    olderThanMs?: number;
    card?: number | null;
    prefix?: string | null;
    limit?: number | null;
    now?: Date;
}

export interface NamecardMediaGcSummary {
    dryRun: boolean;
    olderThanMs: number;
    prefixes: string[];
    scanned: number;
    kept: number;
    deleted: number;
    failed: number;
    skipped: number;
    planned: number;
    entries: NamecardMediaGcEntry[];
    failures: Array<{ key: string; message: string }>;
}

interface CardPageRow {
    card_id: string;
    queue: string;
    page_id: string;
    object_version: string;
    object_queue: string | null;
}

interface CardStatusRow {
    id: string;
    publication_status: string;
}

const DURATION_UNITS: Record<string, number> = {
    ms: 1,
    s: 1000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000
};

/** `7d`、`12h`、`30m`、`90s`、`500ms`；纯数字按天。 */
export function parseNamecardMediaGcDuration(value: string): number {
    const match = /^(\d+)(ms|s|m|h|d)?$/.exec(value.trim());
    if (!match) throw new Error(`Unsupported duration: ${value}`);
    return Number(match[1]) * DURATION_UNITS[match[2] ?? 'd']!;
}

function cardIdFromKey(key: string): string | null {
    const match = CARD_ID_KEY.exec(key);
    return match ? match[1]! : null;
}

/**
 * 纯判定：给定引用集与卡状态，这个 key 该删、该留、还是因安全规则跳过。
 * 不做年龄与数量限制（那两件事在 `planNamecardMediaGc` 里）。
 */
export function classifyNamecardMediaObject(
    key: string,
    context: NamecardMediaGcReferenceContext
): NamecardMediaGcVerdict {
    const cardId = cardIdFromKey(key);
    if (cardId && context.approvingCardIds.has(cardId)) {
        return { action: 'skip', reason: 'approving-card' };
    }
    if (context.referencedKeys.has(key)) {
        return { action: 'keep', reason: 'referenced' };
    }
    if (cardId) {
        if (LEGACY_ROOT_KEY.test(key)) {
            return { action: 'delete', reason: 'legacy-root-layout' };
        }
        if (LEGACY_VERSION_KEY.test(key)) {
            return { action: 'delete', reason: 'legacy-version-layout' };
        }
        const page = PAGE_OBJECT_KEY.exec(key);
        if (page) {
            const queue = page[2] as 'live' | 'pending';
            if (queue === 'live' && !context.liveCardIds.has(cardId)) {
                return { action: 'delete', reason: 'orphan-live-directory' };
            }
            if (queue === 'pending' && !context.pendingCardIds.has(cardId)) {
                return { action: 'delete', reason: 'orphan-pending-directory' };
            }
            // 行还在，但版本已被旋转/替换：旧对象没人再引用。
            return { action: 'delete', reason: 'orphan-page-version' };
        }
        if (PAGE_CACHE_KEY.test(key)) {
            return { action: 'delete', reason: 'orphan-cache' };
        }
        if (THUMBNAIL_KEY.test(key)) {
            return { action: 'delete', reason: 'legacy-thumbnail' };
        }
        const directory = CARD_DIRECTORY_KEY.exec(key);
        if (directory) {
            const queue = directory[2] as 'live' | 'pending';
            if (queue === 'live' && !context.liveCardIds.has(cardId)) {
                return { action: 'delete', reason: 'orphan-live-directory' };
            }
            if (queue === 'pending' && !context.pendingCardIds.has(cardId)) {
                return { action: 'delete', reason: 'orphan-pending-directory' };
            }
        }
        return { action: 'keep', reason: 'not-a-cleanup-target' };
    }
    if (key.startsWith(COMPAT_ROOT)) {
        return THUMBNAIL_KEY.test(key)
            ? { action: 'delete', reason: 'legacy-thumbnail' }
            : { action: 'delete', reason: 'legacy-compat-asset' };
    }
    if (key.startsWith(LEGACY_UPLOAD_ROOT)) {
        return THUMBNAIL_KEY.test(key) ||
            key.startsWith(`${LEGACY_UPLOAD_ROOT}thumbnail/`)
            ? { action: 'delete', reason: 'legacy-thumbnail' }
            : { action: 'delete', reason: 'legacy-upload' };
    }
    if (THUMBNAIL_KEY.test(key)) {
        return { action: 'delete', reason: 'legacy-thumbnail' };
    }
    return { action: 'keep', reason: 'not-a-cleanup-target' };
}

/**
 * 引用集 + 年龄 + 上限：输出确定的删除清单。同一输入必得同一结果
 * （先按键排序再截断），因此 dry-run 清单与实际执行的集合一致。
 */
export async function planNamecardMediaGc(
    input: NamecardMediaGcPlanInput
): Promise<NamecardMediaGcPlan> {
    const cutoff = input.now.getTime() - input.olderThanMs;
    const entries: NamecardMediaGcEntry[] = [];
    const reasons = new Map<string, string>();
    const candidates: string[] = [];
    let kept = 0;
    let skipped = 0;

    for (const object of input.objects) {
        const verdict = classifyNamecardMediaObject(object.key, input.context);
        if (verdict.action !== 'delete') {
            if (verdict.action === 'keep') kept += 1;
            else skipped += 1;
            entries.push({ key: object.key, ...verdict });
            continue;
        }
        const uploadedAt =
            object.uploadedAt ?? (await input.ageOf?.(object.key)) ?? null;
        if (!uploadedAt) {
            skipped += 1;
            entries.push({
                key: object.key,
                action: 'skip',
                reason: 'unknown-age'
            });
            continue;
        }
        if (uploadedAt.getTime() > cutoff) {
            skipped += 1;
            entries.push({
                key: object.key,
                action: 'skip',
                reason: 'too-recent'
            });
            continue;
        }
        candidates.push(object.key);
        reasons.set(object.key, verdict.reason);
    }

    candidates.sort((left, right) => left.localeCompare(right));
    const limit = input.limit ?? null;
    const deletions =
        limit === null ? candidates : candidates.slice(0, Math.max(limit, 0));
    for (const key of deletions) {
        entries.push({ key, action: 'delete', reason: reasons.get(key)! });
    }
    for (const key of candidates.slice(deletions.length)) {
        skipped += 1;
        entries.push({ key, action: 'skip', reason: 'limit-reached' });
    }

    entries.sort((left, right) => left.key.localeCompare(right.key));
    return {
        scanned: input.objects.length,
        kept,
        skipped,
        entries,
        deletions
    };
}

function resolveScanPrefixes(input: {
    prefix: string | null;
    card: number | null;
    cardId: string | null;
}): string[] {
    if (input.prefix) return [input.prefix];
    if (input.cardId) {
        const roots = [`${CARD_ROOT}${input.cardId}`];
        // 兼容资产的历史 stem 形如 `card-<number>-<side>`。
        if (input.card !== null) roots.push(`${COMPAT_ROOT}card-${input.card}-`);
        return roots;
    }
    return [...DEFAULT_MEDIA_GC_PREFIXES];
}

async function loadReferenceContext(
    database: NamecardMediaGcSqlRunner,
    cardNumber: number | null
): Promise<{
    context: NamecardMediaGcReferenceContext;
    cardId: string | null;
}> {
    const pages = await database.query<CardPageRow>(
        `SELECT card_id, queue, page_id, object_version, object_queue
           FROM fudaba_card_pages`
    );
    const referencedKeys = new Set<string>();
    const liveCardIds = new Set<string>();
    const pendingCardIds = new Set<string>();
    for (const row of pages.rows) {
        // 属主暂存会让 pending 行指向 live 对象，两个落点都算引用。
        const queues =
            row.object_queue && row.object_queue !== row.queue
                ? [row.queue, row.object_queue]
                : [row.queue];
        for (const queue of queues) {
            referencedKeys.add(
                cardPageObjectKey(
                    row.card_id,
                    queue,
                    row.page_id,
                    row.object_version
                )
            );
            for (const width of CARD_PAGE_WIDTHS) {
                referencedKeys.add(
                    cardPageCacheObjectKey(
                        row.card_id,
                        queue,
                        row.page_id,
                        row.object_version,
                        width
                    )
                );
            }
        }
        if (row.queue === 'live') liveCardIds.add(row.card_id);
        else if (row.queue === 'pending') pendingCardIds.add(row.card_id);
    }

    const cards = await database.query<CardStatusRow>(
        `SELECT id, publication_status FROM fudaba_cards`
    );
    const approvingCardIds = new Set(
        cards.rows
            .filter((row) => row.publication_status === 'approving')
            .map((row) => row.id)
    );

    let cardId: string | null = null;
    if (cardNumber !== null) {
        const card = await database.query<{ id: string }>(
            `SELECT id FROM fudaba_cards WHERE card_number=$1`,
            [cardNumber]
        );
        if (!card.rows[0]) {
            throw new Error(`Card ${cardNumber} not found`);
        }
        cardId = card.rows[0].id;
    }

    return {
        context: {
            referencedKeys,
            liveCardIds,
            pendingCardIds,
            approvingCardIds
        },
        cardId
    };
}

export async function runNamecardMediaGc(
    options: NamecardMediaGcOptions,
    dependencies: NamecardMediaGcDependencies
): Promise<NamecardMediaGcSummary> {
    const apply = options.apply === true;
    const olderThanMs = options.olderThanMs ?? DEFAULT_MEDIA_GC_OLDER_THAN_MS;
    if (!Number.isFinite(olderThanMs) || olderThanMs < 0) {
        throw new Error('--older-than must be a non-negative duration');
    }
    const limit = options.limit ?? null;
    if (limit !== null && (!Number.isSafeInteger(limit) || limit <= 0)) {
        throw new Error('--limit must be a positive integer');
    }
    const card = options.card ?? null;
    const prefix = options.prefix ?? null;
    if (card !== null && prefix !== null) {
        throw new Error('Specify either --card or --prefix, not both');
    }
    const now = options.now ?? dependencies.clock?.() ?? new Date();

    const { context, cardId } = await loadReferenceContext(
        dependencies.database,
        card
    );
    const prefixes = resolveScanPrefixes({ prefix, card, cardId });

    const storage = dependencies.storage;
    if (!storage) throw new Error('Object storage is unavailable');

    const seen = new Set<string>();
    const objects: NamecardMediaGcListedKey[] = [];
    for (const scanPrefix of prefixes) {
        for (const listed of await storage.list(scanPrefix)) {
            if (seen.has(listed.key)) continue;
            seen.add(listed.key);
            objects.push({ key: listed.key });
        }
    }
    objects.sort((left, right) => left.key.localeCompare(right.key));

    const plan = await planNamecardMediaGc({
        objects,
        context,
        now,
        olderThanMs,
        limit,
        ageOf: async (key) => (await storage.get(key))?.uploadedAt ?? null
    });

    const base = {
        olderThanMs,
        prefixes,
        scanned: plan.scanned,
        kept: plan.kept,
        skipped: plan.skipped,
        planned: plan.deletions.length,
        entries: plan.entries
    };

    if (!apply) {
        return {
            ...base,
            dryRun: true,
            deleted: 0,
            failed: 0,
            failures: []
        };
    }

    const cleanup = dependencies.cleanup;
    if (!cleanup?.storage) {
        throw new Error('Object storage cleanup is unavailable; refusing to apply');
    }
    let deleted = 0;
    const failures: Array<{ key: string; message: string }> = [];
    for (const key of plan.deletions) {
        try {
            await deleteObjectWithCompensation(cleanup, key);
            deleted += 1;
        } catch (error) {
            failures.push({
                key,
                message: error instanceof Error ? error.message : String(error)
            });
        }
    }

    return {
        ...base,
        dryRun: false,
        deleted,
        failed: failures.length,
        failures
    };
}

export interface NamecardMediaGcArguments {
    apply: boolean;
    json: boolean;
    olderThanMs: number;
    card: number | null;
    prefix: string | null;
    limit: number | null;
}

export const NAMECARD_MEDIA_GC_USAGE =
    'Usage: ops:namecards:media-gc [--apply] [--json] ' +
    '[--older-than=7d] [--card=<number>] [--prefix=<key>] [--limit=<n>]';

function positiveInteger(
    value: string,
    name: string
): number {
    if (!/^\d+$/.test(value) || Number(value) < 1) {
        throw new Error(`${name} must be a positive integer`);
    }
    return Number(value);
}

export function parseNamecardMediaGcArguments(
    argv: readonly string[]
): NamecardMediaGcArguments {
    let apply = false;
    let json = false;
    let olderThan: string | null = null;
    let card: string | null = null;
    let prefix: string | null = null;
    let limit: string | null = null;

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index]!;
        const readValue = (name: string): string => {
            const inline = arg.slice(name.length);
            if (inline.startsWith('=')) return inline.slice(1);
            const next = argv[index + 1];
            if (next === undefined || next.startsWith('--')) {
                throw new Error(`${name} requires a value\n${NAMECARD_MEDIA_GC_USAGE}`);
            }
            index += 1;
            return next;
        };
        if (arg === '--apply') apply = true;
        else if (arg === '--dry-run') apply = false;
        else if (arg === '--json') json = true;
        else if (arg === '--older-than' || arg.startsWith('--older-than=')) {
            olderThan = readValue('--older-than');
        } else if (arg === '--card' || arg.startsWith('--card=')) {
            card = readValue('--card');
        } else if (arg === '--prefix' || arg.startsWith('--prefix=')) {
            prefix = readValue('--prefix');
        } else if (arg === '--limit' || arg.startsWith('--limit=')) {
            limit = readValue('--limit');
        } else {
            throw new Error(`Unknown argument: ${arg}\n${NAMECARD_MEDIA_GC_USAGE}`);
        }
    }

    if (prefix !== null) {
        prefix = prefix.trim();
        if (!prefix) throw new Error('--prefix must not be empty');
    }

    return {
        apply,
        json,
        olderThanMs:
            olderThan === null
                ? DEFAULT_MEDIA_GC_OLDER_THAN_MS
                : parseNamecardMediaGcDuration(olderThan),
        card: card === null ? null : positiveInteger(card, '--card'),
        prefix,
        limit: limit === null ? null : positiveInteger(limit, '--limit')
    };
}
