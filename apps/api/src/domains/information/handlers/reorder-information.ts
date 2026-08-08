import type { AppEnvironment } from '@/app';
import { writeAudit } from '@/domains/audit/hono-service';
import { updateInformationIndex } from '@/domains/information/content-store';
import { services } from '@/middleware/hono-context';
import type { ValidatedRequestContext } from '@/middleware/request-validation';
import { messageFromError, statusFromError } from '@/utils/http/error-response';

export async function handleReorderInformation(
    c: ValidatedRequestContext<AppEnvironment, 'json', string[]>
): Promise<Response> {
    const runtime = services(c);
    if (!runtime.storage) throw new Error('Object storage unavailable');
    try {
        const ids = c.req.valid('json');
        await updateInformationIndex(runtime.storage, (index) => {
            const byId = new Map(index.cards.map((card) => [card.id, card]));
            if (ids.length !== index.cards.length || ids.some((id) => !byId.has(id))) {
                throw Object.assign(new Error('活动列表已变化，请刷新后重新排序'), {
                    status: 409
                });
            }
            return { ...index, cards: ids.map((id) => byId.get(id)!) };
        });
        await writeAudit(c, '调整活动内容顺序', `${ids.length} 条内容`);
        return c.json({ success: true });
    } catch (error) {
        const status = statusFromError(error);
        if (status >= 500) console.error('Failed to reorder information cards', error);
        return c.json({
            error: status >= 500 ? '活动内容排序失败' : messageFromError(error)
        }, status as 400 | 409 | 500);
    }
}
