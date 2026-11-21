import type { NamecardCardLayoutRequest } from '@imsweb/contracts/namecards';
import { NAMECARD_EXCHANGE_CARD_LIMIT } from '@imsweb/contracts/namecards/runtime';
import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import { normalizeCardLayout } from '@/domains/community/namecards/exchange/layout';
import type {
    NamecardCardLayoutResponse,
    NamecardErrorResponse,
} from '@/domains/community/namecards/response';
import { fudabaRepository, namecardRepository } from '@/middleware/hono-context';
import type { ValidatedRequestContext } from '@/middleware/request-validation';
import { NamecardCardLayoutError } from '@/ports/repositories/namecards';

/**
 * 属主清单的当前状态：归一后的布局 + 快速清单 + 上限。
 *
 * 归一在这里做（而不是让前端推导）：卡片被删除、编号失效、保存后新建的卡，
 * 都由服务端收口成同一份结果，编辑界面与公开主页各拿一份。
 */
async function cardLayoutState(
    c: Context<AppEnvironment>
): Promise<NamecardCardLayoutResponse> {
    const accountId = c.get('platformUser')!.id;
    const repository = namecardRepository(c);
    const [cards, layout, quick] = await Promise.all([
        fudabaRepository(c).listCardsForOwner(accountId),
        repository.getCardLayout(accountId),
        repository.listQuickExchangeCards(accountId)
    ]);
    const normalized = normalizeCardLayout(
        layout,
        cards.map((card) => Number(card.card_number))
    );
    return {
        groups: normalized.groups,
        defaultCardNumbers: normalized.defaultCardNumbers,
        quickCardNumbers: quick.map((card) =>
            Number(card.card_number ?? card.id)
        ),
        limit: NAMECARD_EXCHANGE_CARD_LIMIT
    };
}

export async function handleGetCardLayout(
    c: Context<AppEnvironment>
): Promise<Response> {
    return c.json(
        (await cardLayoutState(c)) satisfies NamecardCardLayoutResponse
    );
}

/** 整份保存：布局 + 快速清单 + 批量字段，要么全成要么全不成。 */
export async function handlePutCardLayout(
    c: ValidatedRequestContext<AppEnvironment, 'json', NamecardCardLayoutRequest>
): Promise<Response> {
    const accountId = c.get('platformUser')!.id;
    const body = c.req.valid('json');
    try {
        await namecardRepository(c).saveCardLayout({
            accountId,
            groups: body.groups,
            defaultCardNumbers: body.defaultCardNumbers,
            quickCardNumbers: body.quickCardNumbers,
            cardSettings: body.cardSettings,
            at: new Date().toISOString()
        });
    } catch (error) {
        if (error instanceof NamecardCardLayoutError) {
            return c.json(
                { error: error.message } satisfies NamecardErrorResponse,
                400
            );
        }
        console.error('Failed to save namecard layout', error);
        return c.json(
            { error: '名片布局保存失败' } satisfies NamecardErrorResponse,
            500
        );
    }
    return c.json(
        (await cardLayoutState(c)) satisfies NamecardCardLayoutResponse
    );
}
