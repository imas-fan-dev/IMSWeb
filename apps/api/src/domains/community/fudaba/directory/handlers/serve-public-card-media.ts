import type { AppEnvironment } from '@/app';
import { NAMECARD_MEDIA_NOT_FOUND } from '@/domains/community/namecards/response';
import {
    fudabaRepository,
    namecardRepository
} from '@/middleware/hono-context';
import type { ValidatedRequestContext } from '@/middleware/request-validation';
import { isCardPageObjectKey } from '@/utils/storage/business-object-keys';
import { respondCardMedia } from '@/domains/community/fudaba/cards/card-media-response';

/**
 * 已收集者专用的缓存意图。`/api/community/exchange/*` 上有前缀中间件 `privateFudabaResponse`，
 * 它在 handler 之后把最终头覆盖为 `private, no-store`（公开分支的 `public` 同样被覆盖），
 * 所以这里的值只表达意图，不是客户端实际收到的头。
 */
const HELD_MEDIA_CACHE = 'private, max-age=300';

/**
 * Public exchange-wall media, addressed by the card UUID. Reads the same page
 * rows and delivery policy as `/api/cards/:number/media/:pageId`; the UUID
 * route exists because exchange payloads already carry the UUID.
 *
 * 原卡被持有者下线（`hidden`）后不再对所有人放行，但**已经收到这张卡的人**仍能看图（doc §5）。
 */
export async function handleServeExchangeCardMedia(
    c: ValidatedRequestContext<
        AppEnvironment,
        'param' | 'query',
        { cardId: string; side: string } & {
            w?: '160' | '400' | '800' | '1400' | undefined;
        }
    >
): Promise<Response> {
    const { cardId, side } = c.req.valid('param');
    const { w } = c.req.valid('query');
    const key = await fudabaRepository(c).findPublishedCardPageKeyById(
        cardId,
        side
    );
    if (key) {
        return respondCardMedia(c, {
            key,
            width: w,
            cacheControl: 'public, max-age=300',
            sizedCacheControl: isCardPageObjectKey(key)
                ? 'public, max-age=31536000, immutable'
                : 'public, max-age=300',
            notFound: NAMECARD_MEDIA_NOT_FOUND
        });
    }
    // 下线之后只对「名片册里已经有这张卡」的人放行，其余一律 404（不解释原因）。
    const viewerAccountId = c.get('platformUser')?.id ?? null;
    if (!viewerAccountId) return c.text(NAMECARD_MEDIA_NOT_FOUND, 404);
    const heldKey = await namecardRepository(c).findHeldCardPageKey({
        viewerAccountId,
        cardId,
        pageId: side
    });
    if (!heldKey) return c.text(NAMECARD_MEDIA_NOT_FOUND, 404);
    return respondCardMedia(c, {
        key: heldKey,
        width: w,
        cacheControl: HELD_MEDIA_CACHE,
        sizedCacheControl: HELD_MEDIA_CACHE,
        vary: 'Cookie, Authorization',
        notFound: NAMECARD_MEDIA_NOT_FOUND
    });
}
