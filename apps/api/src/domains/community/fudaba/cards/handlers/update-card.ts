import type { FudabaCardUpdateRequest } from '@imsweb/contracts/fudaba';
import type { AppEnvironment } from '@/app';
import { fudabaOwnerCardView, validFudabaCardId } from '@/domains/community/fudaba/contracts/card';
import { ownerCardArtwork } from '@/domains/community/fudaba/cards/artwork-view';
import { parseFudabaCardUpdate } from '@/domains/community/fudaba/cards/request';
import { fudabaRepository, namecardTagRepository } from '@/middleware/hono-context';
import type { ValidatedRequestContext } from '@/middleware/request-validation';
import { messageFromError, statusFromError } from '@/utils/http/error-response';

/**
 * 字段规则由路由上的 `fudabaCardUpdateRequestSchema` 判定（唯一一层）；这里只
 * 把正文补上缺省与派生字段，收成仓储接受的形态，规则不再判第二遍。
 *
 * 正文取的是 schema 的输出（含 trim 等转换）：再读一次原始正文会绕过转换，让
 * 落库值与校验结果不一致。
 */
export async function handleUpdateFudabaCard(
    c: ValidatedRequestContext<AppEnvironment, 'json', FudabaCardUpdateRequest>
): Promise<Response> {
    try {
        const cardId = c.req.param('cardId') || '';
        if (!validFudabaCardId(cardId)) {
            return c.json({ success: false, code: 'FUDABA_CARD_NOT_FOUND' }, 404);
        }
        const update = parseFudabaCardUpdate(c.req.valid('json'));
        const { tags, ...cardFields } = update;
        const result = await fudabaRepository(c).updateCardMetadataForOwner({
            cardId,
            ownerAccountId: c.get('platformUser')!.id,
            ...cardFields,
            updatedAt: new Date().toISOString()
        });
        if (result.status === 'unavailable') {
            return c.json({ success: false, code: 'FUDABA_CARD_NOT_FOUND' }, 404);
        }
        if (result.status === 'conflict') {
            return c.json({
                success: false,
                code: 'FUDABA_CARD_CONFLICT',
                revision: result.revision
            }, 409);
        }
        // 标签即时生效；内容保存成功后整组替换，失败时保留原标签。
        if (tags !== undefined) {
            result.card.tags = await namecardTagRepository(c).replace({
                cardId,
                names: tags,
            });
        }
        const pages = await fudabaRepository(c).listCardPages(cardId);
        const artwork = ownerCardArtwork(result.card, pages);
        return c.json({
            success: true,
            card: fudabaOwnerCardView(
                result.card,
                artwork.live,
                artwork.pending ?? undefined
            )
        });
    } catch (error) {
        const status = statusFromError(error);
        if (status >= 500) console.error('Failed to update Fudaba card', error);
        return c.json({
            success: false,
            code: status >= 500 ? 'FUDABA_CARD_SAVE_FAILED' : 'FUDABA_CARD_INVALID',
            message: status >= 500 ? '名片保存失败' : messageFromError(error)
        }, status as 400 | 500);
    }
}
