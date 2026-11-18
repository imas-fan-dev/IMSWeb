import type { AppEnvironment } from '@/app';
import type { Context } from 'hono';
import { namecardPagesView } from '@/domains/community/fudaba/cards/artwork-view';
import type { AdminNamecardDiffResponse } from '@/domains/community/namecards/response';
import { services } from '@/middleware/hono-context';

/**
 * 管理窗保存后会用响应里的 diff 重播槽位；PUT 和 GET 必须给出同一份
 * 页面视图，否则保存成功反而把画廊清空。作用域固定为 admin（live/draft）。
 */
export async function withAdminNamecardPages(
    c: Context<AppEnvironment>,
    id: number,
    response: AdminNamecardDiffResponse
): Promise<AdminNamecardDiffResponse> {
    const pagesByNumber =
        (await services(c).fudaba?.listCardPagesBatchByNumbers?.([id])) ??
        new Map();
    const rows = pagesByNumber.get(id);
    // 装配只有一处（`namecardPagesView`）；`pending` 已含「无待审 → null」。
    const view = namecardPagesView(rows, {
        scope: 'admin',
        cardNumber: id,
        cardId: String(id)
    });
    const live = view.live;
    const pending = view.pending;
    return {
        ...response,
        live: {
            ...response.live,
            ...(live.length > 0 ? { pages: live } : {})
        },
        pending:
            response.pending && pending
                ? { ...response.pending, pages: pending }
                : response.pending
    };
}
