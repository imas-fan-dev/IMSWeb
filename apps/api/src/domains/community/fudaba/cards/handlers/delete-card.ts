import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import { validFudabaCardId } from '@/domains/community/fudaba/contracts/card';
import { parseFudabaDelete } from '@/domains/community/fudaba/cards/request';
import { fudabaRepository } from '@/middleware/hono-context';
import { messageFromError, statusFromError } from '@/utils/http/error-response';

export async function handleDeleteFudabaCard(
    c: Context<AppEnvironment>
): Promise<Response> {
    try {
        const cardId = c.req.param('cardId') || '';
        if (!validFudabaCardId(cardId)) {
            return c.json({ success: false, code: 'FUDABA_CARD_NOT_FOUND' }, 404);
        }
        const body = await c.req.json().catch(() => {
            throw Object.assign(new Error('请求体必须是有效 JSON'), { status: 400 });
        });
        const expectedRevision = parseFudabaDelete(body);
        const result = await fudabaRepository(c).softDeleteCardForOwner({
            cardId,
            ownerAccountId: c.get('platformUser')!.id,
            expectedRevision,
            deletedAt: new Date().toISOString()
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
        // The card is only hidden: its media stays in storage so the
        // backoffice can still review it.
        return c.json({ success: true, revision: result.card.revision });
    } catch (error) {
        const status = statusFromError(error);
        if (status >= 500) console.error('Failed to delete Fudaba card', error);
        return c.json({
            success: false,
            code: status >= 500 ? 'FUDABA_CARD_DELETE_FAILED' : 'FUDABA_CARD_INVALID',
            message: status >= 500 ? '名片删除失败' : messageFromError(error)
        }, status as 400 | 500);
    }
}
