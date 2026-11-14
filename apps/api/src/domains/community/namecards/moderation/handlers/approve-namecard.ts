import { NAMECARD_MIDDLE_IMAGE_LIMIT } from '@imsweb/contracts/fudaba/runtime';
import { writeAudit } from '@/domains/admin/audit/write-audit';
import type { NamecardMutationContext } from '@/domains/community/namecards/request';
import type {
    NamecardErrorResponse,
    NamecardMutationResponse
} from '@/domains/community/namecards/response';
import { namecardRepository, services } from '@/middleware/hono-context';
import {
    cardPageObjectKey,
    parseCardPageObjectKey
} from '@/utils/storage/business-object-keys';

export async function handleApproveNamecard(c: NamecardMutationContext): Promise<Response> {
    const { id } = c.req.valid('param');
    const { expected_revision: revision } = c.req.valid('json');
    try {
        const repository = namecardRepository(c);
        const claim = await repository.beginCardApproval(id, revision);
        if (claim.status === 'not-found') {
            return c.json({ error: 'Namecard not found' } satisfies NamecardErrorResponse, 404);
        }
        if (claim.status === 'conflict') {
            return c.json({
                error: 'Namecard changed; refresh and retry',
                revision: claim.revision
            } satisfies NamecardErrorResponse, 409);
        }
        if (claim.status === 'withdrawn') {
            return c.json({
                error: '用户已撤回',
                revision: claim.revision
            } satisfies NamecardErrorResponse, 410);
        }
        // A failed attempt leaves the row in `approving` on purpose: the retry
        // path recognises that claim (revision+1) and resumes it, whereas
        // reverting to `pending` would let a stale reviewer approve a newer
        // edit the owner submitted in the meantime.
        const runtime = services(c);
        const storage = runtime.storage;
        if (!storage) throw new Error('Object storage publication is unavailable');
        // Both layouts must end up in the canonical
        // community/namecards/assets/<stem>/image.<ext> shape before publication:
        // that is the only layout the thumbnail helper and the public key
        // reversal understand. Registered-user uploads still point at
        // community/fudaba/cards/<uuid>/front|back.<ext>, so copy those objects
        // across, rewrite the row, then publish as usual.
        // 页面行是唯一媒体来源；已发布/待审对象都必须使用版本化页面键。
        // 旧布局（community/namecards/assets/...）与无版本正/反键不再支持。
        const [frontKey, backKey] = await Promise.all([
            repository.findCardMediaKey(id, 'front', false),
            repository.findCardMediaKey(id, 'back', false)
        ]);
        for (const value of [frontKey, backKey]) {
            if (typeof value !== 'string') continue;
            if (!value.startsWith('community/fudaba/cards/')) {
                throw new Error(`Unsupported namecard object key: ${value}`);
            }
            if (!storage.publish) {
                throw new Error('Object storage publication is unavailable');
            }
            await storage.publish(value);
        }
        // 已发布卡的 staged 修订只把改动过的页写进 pending 队列。这些对象必须
        // 先搬到 live 路径再公开，否则页面行指向 pending 对象，公开路由 404。
        const stagedKeys = [
            await repository.findCardMediaKey(id, 'front', true),
            await repository.findCardMediaKey(id, 'back', true),
            ...await Promise.all(
                Array.from(
                    { length: NAMECARD_MIDDLE_IMAGE_LIMIT },
                    (_, index) => repository.findCardMediaKey(id, `middle-${index + 1}`, true)
                )
            )
        ];
        for (const key of stagedKeys) {
            if (typeof key !== 'string') continue;
            const parsed = parseCardPageObjectKey(key);
            if (!parsed || parsed.queue !== 'pending') continue;
            const liveKey = cardPageObjectKey(
                parsed.cardId,
                'live',
                parsed.pageId,
                parsed.version
            );
            // 审批失败后按设计会保留 approving 行并允许重试；已经搬过的对象
            // 不能再次 move。
            if (!await storage.exists(liveKey)) {
                if (!await storage.exists(key)) {
                    throw new Error(`Staged card page object not found: ${key}`);
                }
                await storage.move(key, liveKey);
            }
            if (!storage.publish) {
                throw new Error('Object storage publication is unavailable');
            }
            await storage.publish(liveKey);
        }
        const completed = await repository.completeCardApproval(id, claim.card.revision);
        if (completed.status !== 'updated') {
            return c.json({
                error: 'Namecard changed; refresh and retry',
                ...(completed.status === 'conflict' ? { revision: completed.revision } : {})
            } satisfies NamecardErrorResponse, 409);
        }
        await writeAudit(c, '审核图片通过', `card_id=${id};revision=${completed.card.revision}`);
        return c.json({
            success: true,
            revision: completed.card.revision
        } satisfies NamecardMutationResponse);
    } catch (error) {
        console.error('Failed to approve namecard', error);
        return c.json({ error: '服务器错误' } satisfies NamecardErrorResponse, 500);
    }
}
