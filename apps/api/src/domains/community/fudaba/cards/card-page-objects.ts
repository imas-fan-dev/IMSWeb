import type { ObjectStorage } from '@/ports/object-storage';
import {
    cardPageObjectKey,
    parseCardPageObjectKey
} from '@/utils/storage/business-object-keys';
import {
    protectObjectWithCompensation,
    type ObjectCleanupServices
} from '@/utils/storage/delete-object';

/**
 * 提升只需要对象存储：不读数据库、不发布页面行。
 */
export interface CardPageObjectRuntime {
    storage?: ObjectStorage | undefined;
}

/**
 * 把 `pending` 队列的页面对象提升到 `live` 队列并公开。
 *
 * 调用点：审批通过（`approve-namecard.ts`）与后台改版保存
 * （`update-admin-namecard.ts`）。两处语义完全一致，因此合并到这一处。
 *
 * 用 `copy` 而不是 `move`：审批/保存失败后必须能重试，源对象得留着。
 * `pending` 行由审批事务自己删除（`promoteNamecardPages`），残留的源对象由
 * 媒体 GC 回收（`operations/namecard-media-gc.ts`），而 GC 会整卡跳过
 * `publication_status = 'approving'` 的卡——正好保住「失败可重试」。
 *
 * `published` 是调用方传进来的收集器：本次公开过的 live 键会**先追加再公开**，
 * 因此即便中途抛错，调用方也能拿着已追加的部分把副本退回受保护态
 * （`protectPromotedCardPages`）。live 对象在公开前一定已经存在（要么刚 copy
 * 过去，要么上次尝试就建好了），所以回退时不会碰到不存在的键。
 *
 * 细节：
 * - 只有 `pending` 队列的对象需要提升；未改动的页在待审快照里仍指向线上对象，
 *   非页面键一律跳过。
 * - 已经提升过的对象（上次尝试已成功、这次是重试）直接跳过复制，因此可重复执行。
 * - 源对象缺失时报错，交给调用方的重试路径处理。
 * - 成功后必须发布；失败即抛，调用方不会走「成功」分支。
 */
export async function promoteCardPageObjects(
    runtime: CardPageObjectRuntime,
    keys: readonly (string | null | undefined)[],
    published: string[] = []
): Promise<void> {
    const storage = runtime.storage;
    if (!storage) throw new Error('Object storage publication is unavailable');
    for (const key of keys) {
        if (typeof key !== 'string') continue;
        const parsed = parseCardPageObjectKey(key);
        if (!parsed || parsed.queue !== 'pending') continue;
        const liveKey = cardPageObjectKey(
            parsed.cardId,
            'live',
            parsed.pageId,
            parsed.version
        );
        // 重试路径会再次调用这里：已经提升过的对象不能再复制一次。
        if (!(await storage.exists(liveKey))) {
            if (!(await storage.exists(key))) {
                throw new Error(`Staged card page object not found: ${key}`);
            }
            await storage.copy(key, liveKey);
        }
        if (!storage.publish) {
            throw new Error('Object storage publication is unavailable');
        }
        // 记在公开之前：抛出时调用方仍能拿到这一条并回退。
        published.push(liveKey);
        await storage.publish(liveKey);
    }
}

/**
 * 把提升时公开过的副本退回受保护态。
 *
 * 用在「对象已经公开、但后面的落库没成功」的出口：页面行还没指过去，卡也没
 * 上墙，公开的副本只是「未通过审核的图片能被按 URL 直接取到」。失败只记日志，
 * 由 `protectObjectWithCompensation` 的补偿队列兜底，不改调用方原本要给的响应。
 */
export async function protectPromotedCardPages(
    runtime: ObjectCleanupServices,
    published: readonly string[]
): Promise<void> {
    await Promise.all(
        published.map((key) =>
            protectObjectWithCompensation(runtime, key).catch((error) => {
                console.error(
                    'Failed to protect promoted namecard page object',
                    key,
                    error
                );
            })
        )
    );
}
