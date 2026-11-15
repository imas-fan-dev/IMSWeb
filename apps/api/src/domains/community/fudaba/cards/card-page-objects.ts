import type { ObjectStorage } from '@/ports/object-storage';
import {
    cardPageObjectKey,
    parseCardPageObjectKey
} from '@/utils/storage/business-object-keys';

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
 * 细节：
 * - 只有 `pending` 队列的对象需要提升；未改动的页在待审快照里仍指向线上对象，
 *   非页面键一律跳过。
 * - 已经提升过的对象（上次尝试已成功、这次是重试）直接跳过，因此可重复执行。
 * - 源对象缺失时报错，交给调用方的重试路径处理。
 * - 成功后必须发布；失败即抛，调用方不会走「成功」分支。
 */
export async function promoteCardPageObjects(
    runtime: CardPageObjectRuntime,
    keys: readonly (string | null | undefined)[]
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
        await storage.publish(liveKey);
    }
}
