import type { NamecardCardShareLinkContext } from '@/domains/community/namecards/exchange/request';
import type {
    NamecardCardShareLinkResponse,
    NamecardErrorResponse,
} from '@/domains/community/namecards/response';
import { namecardRepository } from '@/middleware/hono-context';

/**
 * 属主侧单卡分享链接。只读（不加写护栏）：短链在首次取用时补一行，之后永远是同一个值。
 * 卡片不属于该账号（或已删除）时回 404，不区分「不存在」与「不是你的」。
 */
export async function handleGetCardShareLink(
    c: NamecardCardShareLinkContext,
): Promise<Response> {
    const { cardNumber } = c.req.valid('param');
    const viewerId = c.get('platformUser')?.id;
    const slug = viewerId
        ? await namecardRepository(c).ensureExchangeSlugForOwnerCard({
              ownerAccountId: viewerId,
              cardNumber: Number(cardNumber),
          })
        : null;
    if (!slug) {
        return c.json(
            { error: '找不到这张名片' } satisfies NamecardErrorResponse,
            404,
        );
    }
    return c.json({ slug } satisfies NamecardCardShareLinkResponse);
}
