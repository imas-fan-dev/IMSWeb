import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import type { FudabaCardInteractionKind } from '@imsweb/contracts/fudaba';
import { validFudabaCardId } from '@/domains/community/fudaba/contracts/card';
import { fudabaCardInteractionsView } from '@/domains/community/fudaba/cards/response';
import { fudabaRepository } from '@/middleware/hono-context';
import { messageFromError, statusFromError } from '@/utils/http/error-response';

export function createHandleFudabaCardInteraction(
    kind: FudabaCardInteractionKind,
    active: boolean
): (c: Context<AppEnvironment>) => Promise<Response> {
    return async (c) => {
        try {
            const cardId = c.req.param('cardId') || '';
            if (!validFudabaCardId(cardId)) {
                return c.json({
                    success: false,
                    code: 'FUDABA_CARD_INTERACTION_NOT_FOUND'
                }, 404);
            }
            const accountId = c.get('platformUser')!.id;
            const repository = fudabaRepository(c);
            await repository.setCardInteraction({
                kind,
                cardId,
                accountId,
                active,
                createdAt: new Date().toISOString()
            });
            const state = await repository.findPublicCardInteractions(
                cardId,
                accountId
            );
            if (!state) {
                return c.json({
                    success: false,
                    code: 'FUDABA_CARD_INTERACTION_NOT_FOUND'
                }, 404);
            }
            return c.json({
                success: true,
                cardId,
                interactions: fudabaCardInteractionsView(state)
            });
        } catch (error) {
            const status = statusFromError(error);
            if (status >= 500) {
                console.error('Failed to update Fudaba card interaction', error);
            }
            return c.json({
                success: false,
                code: status >= 500
                    ? 'FUDABA_CARD_INTERACTION_FAILED'
                    : 'FUDABA_CARD_INTERACTION_INVALID',
                message: status >= 500
                    ? '名片互动更新失败'
                    : messageFromError(error)
            }, status as 400 | 500);
        }
    };
}
