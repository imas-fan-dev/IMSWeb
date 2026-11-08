/**
 * 把旧布局的名片页面迁移到统一布局。
 *
 * 每一步只做「读旧对象 → 写新 key → 重写页面行」，不删除任何旧对象：
 * - 已在统一布局且页面行存在的槽位直接复用，不重复写对象；
 * - 幂等：重复执行结果一致；
 * - 失败即停，输出可重跑的卡片列表。
 *
 *   pnpm --filter @imsweb/api ops:namecards:migrate-pages -- --dry-run
 *   pnpm --filter @imsweb/api ops:namecards:migrate-pages -- --card=801
 */
import { createNodeServices } from '@/runtime/node-services';
import { storeCardPage } from '@/domains/community/fudaba/cards/artwork-store';
import type { FudabaCardPageWrite } from '@/ports/repositories';
import {
    cardPageObjectKey,
    parseCardPageObjectKey
} from '@/utils/storage/business-object-keys';

/** 历史投稿里存在超过默认 40MP 的扫描图；迁移一次性处理，放大到 100MP。 */
const LEGACY_IMAGE_MAX_PIXELS = 100_000_000;

interface CardRow {
    id: string;
    card_number: number;
    publication_status: string;
    front_object_key: string;
    back_object_key: string | null;
    pending_front_object_key: string | null;
    pending_back_object_key: string | null;
    pending_middle_object_keys: string[] | null;
}

interface PageRow {
    page_id: string;
    object_version: string;
    width: number;
    height: number;
}

interface MigrationResult {
    cardNumber: number;
    live: number;
    pending: number;
    copied: number;
    skipped: string[];
}

export interface MigrationSqlRunner {
    query<T>(
        text: string,
        values?: unknown[]
    ): Promise<{ rows: T[] }>;
}

export interface NamecardPagesMigrationOptions {
    dryRun?: boolean;
    onlyCard?: number | null;
    /** 迁移专用连接由调用方创建（CLI/镜像启动器），src 不直接依赖 pg。 */
    database: MigrationSqlRunner;
}

export interface NamecardPagesMigrationSummary {
    dryRun: boolean;
    cards: number;
    copied: number;
    results: MigrationResult[];
}

export async function runNamecardPagesMigration(
    options: NamecardPagesMigrationOptions
): Promise<NamecardPagesMigrationSummary> {
    const dryRun = options.dryRun === true;
    const onlyCard = options.onlyCard ?? null;
    const client = options.database;
    const services = await createNodeServices();
    const repository = services.fudaba;
    const storage = services.storage;
    const images = services.images;
    if (!storage || !images?.validate) {
        throw new Error('Object storage or image processing is unavailable');
    }

    const results: MigrationResult[] = [];
    {
        const cards = await client.query<CardRow>(
            `SELECT id, card_number, publication_status, front_object_key,
                    back_object_key, pending_front_object_key,
                    pending_back_object_key, pending_middle_object_keys
               FROM fudaba_cards
              WHERE deleted_at IS NULL
                ${onlyCard ? 'AND card_number=$1' : ''}
              ORDER BY card_number`,
            onlyCard ? [onlyCard] : []
        );
        // 兼容表只用于识别迁移前的中间页；表被 DROP 后本轮迁移已无旧数据可读，
        // 直接按空集合继续（页行存在时本来就会跳过）。
        const middleRows = await client
            .query<{ card_id: string; object_key: string }>(
                `SELECT card_id, object_key FROM fudaba_card_media
                  ORDER BY card_id, display_order`
            )
            .catch((error: { code?: string }) => {
                if (error.code === '42P01') return { rows: [] };
                throw error;
            });
        const middlesByCard = new Map<string, string[]>();
        for (const row of middleRows.rows) {
            const list = middlesByCard.get(row.card_id) ?? [];
            list.push(row.object_key);
            middlesByCard.set(row.card_id, list);
        }

        for (const card of cards.rows) {
            const existing = await repository.listCardPages(card.id);
            const byKey = new Map<string, PageRow>();
            for (const [queue, rows] of [
                ['live', existing.live],
                ['pending', existing.pending]
            ] as const) {
                for (const row of rows) {
                    byKey.set(
                        cardPageObjectKey(
                            card.id,
                            queue,
                            row.page_id,
                            row.object_version
                        ),
                        {
                            page_id: row.page_id,
                            object_version: row.object_version,
                            width: row.width,
                            height: row.height
                        }
                    );
                }
            }

            const resolve = async (
                queue: 'live' | 'pending',
                key: string
            ): Promise<{ page: FudabaCardPageWrite; copied: boolean }> => {
                const known = byKey.get(key);
                const parsed = parseCardPageObjectKey(key);
                if (
                    known &&
                    parsed &&
                    parsed.cardId === card.id &&
                    parsed.queue === queue &&
                    parsed.pageId === known.page_id &&
                    parsed.version === known.object_version
                ) {
                    return {
                        page: {
                            pageId: known.page_id,
                            objectVersion: known.object_version,
                            width: known.width,
                            height: known.height
                        },
                        copied: false
                    };
                }
                const object = await storage.get(key);
                if (!object) throw new Error(`object missing: ${key}`);
                // 旧布局可能是 PNG/JPEG；统一转成 webp 再写入页面对象。
                const sourceType =
                    object.contentType?.split(';')[0]?.trim().toLowerCase() ||
                    'image/webp';
                let sourceInfo;
                try {
                    sourceInfo = await images!.validate!(
                        object.body,
                        sourceType,
                        { maxInputPixels: LEGACY_IMAGE_MAX_PIXELS }
                    );
                } catch {
                    sourceInfo = await images!.validate!(
                        object.body,
                        'image/webp',
                        { maxInputPixels: LEGACY_IMAGE_MAX_PIXELS }
                    );
                }
                if (dryRun) {
                    return {
                        page: {
                            pageId: `page-${crypto.randomUUID()}`,
                            objectVersion: crypto.randomUUID(),
                            width: sourceInfo.width,
                            height: sourceInfo.height
                        },
                        copied: true
                    };
                }
                const body =
                    sourceType === 'image/webp'
                        ? object.body
                        : await images!.toWebp!(object.body, 85, {
                              maxInputPixels: LEGACY_IMAGE_MAX_PIXELS,
                              // 历史扫描图转码后可能仍有几十 MP，限制输出体积。
                              maxOutputPixels: 25_000_000
                          });
                const info =
                    sourceType === 'image/webp'
                        ? sourceInfo
                        : await images!.validate!(body, 'image/webp', {
                          maxInputPixels: LEGACY_IMAGE_MAX_PIXELS
                      });
                const stored = await storeCardPage(
                    { storage, images },
                    {
                        cardId: card.id,
                        queue,
                        pageId: `page-${crypto.randomUUID()}`,
                        body,
                        width: info.width,
                        height: info.height,
                        accountId: 'migration'
                    }
                );
                if (queue === 'live' && card.publication_status === 'published') {
                    if (!storage.publish) {
                        throw new Error('Object storage publication is unavailable');
                    }
                    await storage.publish(stored.key);
                }
                return {
                    page: {
                        pageId: stored.pageId,
                        objectVersion: stored.version,
                        width: stored.width,
                        height: stored.height
                    },
                    copied: true
                };
            };

            const keyOfPage = (
                queue: 'live' | 'pending',
                page: { page_id: string; object_version: string }
            ) => cardPageObjectKey(card.id, queue, page.page_id, page.object_version);
            // 已经在新布局里的卡以页面行为准；旧列/旧中间页表只补页面集里缺的槽位，
            // 否则重跑迁移会把新建卡的多页集合缩成正反面两张。
            const existingLiveKeys = existing.live.map((page) =>
                keyOfPage('live', page)
            );
            const existingPendingKeys = existing.pending.map((page) =>
                keyOfPage('pending', page)
            );
            const legacyLiveKeys = [
                card.front_object_key,
                ...(middlesByCard.get(card.id) ?? []),
                ...(card.back_object_key ? [card.back_object_key] : [])
            ];
            const liveKeys =
                existingLiveKeys.length > 0
                    ? [
                          ...existingLiveKeys,
                          ...legacyLiveKeys.filter(
                              (key) => !existingLiveKeys.includes(key)
                          )
                      ]
                    : legacyLiveKeys;
            const pendingArtwork =
                card.pending_front_object_key !== null ||
                card.pending_back_object_key !== null ||
                (card.pending_middle_object_keys?.length ?? 0) > 0;
            const legacyPendingKeys = pendingArtwork
                ? [
                      card.pending_front_object_key ?? card.front_object_key,
                      ...((card.pending_middle_object_keys?.length ?? 0) > 0
                          ? card.pending_middle_object_keys!
                          : (middlesByCard.get(card.id) ?? [])),
                      ...(card.pending_back_object_key ?? card.back_object_key
                          ? [
                                (card.pending_back_object_key ??
                                    card.back_object_key)!
                            ]
                          : [])
                  ]
                : [];
            const pendingKeys =
                existingPendingKeys.length > 0
                    ? [
                          ...existingPendingKeys,
                          ...legacyPendingKeys.filter(
                              (key) => !existingPendingKeys.includes(key)
                          )
                      ]
                    : legacyPendingKeys;

            const livePages: FudabaCardPageWrite[] = [];
            const pendingPages: FudabaCardPageWrite[] = [];
            let copied = 0;
            try {
                for (const key of liveKeys) {
                    const resolved = await resolve('live', key);
                    livePages.push(resolved.page);
                    if (resolved.copied) copied += 1;
                }
                for (const key of pendingKeys) {
                    const resolved = await resolve('pending', key);
                    pendingPages.push(resolved.page);
                    if (resolved.copied) copied += 1;
                }
            } catch (error) {
                // 超大/损坏的历史图先跳过整张卡，交给管理员后续处理；
                // 不阻断部署，也不写出半套页面行。
                results.push({
                    cardNumber: card.card_number,
                    live: 0,
                    pending: 0,
                    copied: 0,
                    skipped: [error instanceof Error ? error.message : String(error)]
                });
                continue;
            }
            if (!dryRun) {
                const now = new Date().toISOString();
                await repository.replaceCardPages(card.id, 'live', livePages, now);
                if (pendingKeys.length > 0) {
                    await repository.replaceCardPages(
                        card.id,
                        'pending',
                        pendingPages,
                        now
                    );
                }
                // 双写期保持列与页面行指向同一批 key，避免新旧读取源分叉。
                const keyOf = (
                    queue: 'live' | 'pending',
                    page: FudabaCardPageWrite
                ) =>
                    cardPageObjectKey(
                        card.id,
                        queue,
                        page.pageId,
                        page.objectVersion
                    );
                const liveKeysNext = livePages.map((page) =>
                    keyOf('live', page)
                );
                await client.query(
                    `UPDATE fudaba_cards
                        SET front_object_key=$1, back_object_key=$2
                      WHERE id=$3`,
                    [
                        liveKeysNext[0],
                        liveKeysNext.length > 1
                            ? liveKeysNext[liveKeysNext.length - 1]
                            : null,
                        card.id
                    ]
                );
                if (pendingKeys.length > 0) {
                    const pendingKeysNext = pendingPages.map((page) =>
                        keyOf('pending', page)
                    );
                    await client.query(
                        `UPDATE fudaba_cards
                            SET pending_front_object_key=$1,
                                pending_back_object_key=$2,
                                pending_middle_object_keys=$3
                          WHERE id=$4`,
                        [
                            pendingKeysNext[0],
                            pendingKeysNext.length > 1
                                ? pendingKeysNext[pendingKeysNext.length - 1]
                                : null,
                            pendingKeysNext.slice(
                                1,
                                Math.max(1, pendingKeysNext.length - 1)
                            ),
                            card.id
                        ]
                    );
                }
            }
            results.push({
                cardNumber: card.card_number,
                live: livePages.length,
                pending: pendingPages.length,
                copied,
                skipped: []
            });
        }
        return {
            dryRun,
            cards: results.length,
            copied: results.reduce((sum, row) => sum + row.copied, 0),
            results
        };
}
}
