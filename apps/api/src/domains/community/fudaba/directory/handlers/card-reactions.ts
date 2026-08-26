import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import { NAMECARD_REACTION_EMOJIS } from '@imsweb/contracts/fudaba';
import { validFudabaCardId } from '@/domains/community/fudaba/contracts/card';
import { fudabaRepository } from '@/middleware/hono-context';
import { messageFromError, statusFromError } from '@/utils/http/error-response';

const ALLOWED_REACTIONS = new Set<string>(NAMECARD_REACTION_EMOJIS);

function notFound(c: Context<AppEnvironment>): Response {
    return c.json({
        success: false,
        code: 'FUDABA_CARD_REACTION_NOT_FOUND'
    }, 404);
}

async function reactionList(
    c: Context<AppEnvironment>,
    cardId: string
): Promise<Response> {
    const reactions = await fudabaRepository(c).listPublicCardReactions(cardId);
    return c.json({ success: true, cardId, reactions });
}

function reactionFailure(
    c: Context<AppEnvironment>,
    error: unknown
): Response {
    const status = statusFromError(error);
    if (status >= 500) {
        console.error('Failed to serve Fudaba card reactions', error);
    }
    return c.json({
        success: false,
        code: status >= 500
            ? 'FUDABA_CARD_REACTION_FAILED'
            : 'FUDABA_CARD_REACTION_INVALID',
        message: status >= 500 ? '名片表情更新失败' : messageFromError(error)
    }, status as 400 | 500);
}

export async function handleListFudabaCardReactions(
    c: Context<AppEnvironment>
): Promise<Response> {
    try {
        const cardId = c.req.param('cardId') || '';
        if (!validFudabaCardId(cardId)) return notFound(c);
        return await reactionList(c, cardId);
    } catch (error) {
        return reactionFailure(c, error);
    }
}

// Reactions stay anonymous like the compatibility namecard pages, so the write
// is a counter delta guarded by the shared reaction rate limit instead of an
// account-scoped record.
export function createHandleFudabaCardReaction(
    delta: 1 | -1
): (c: Context<AppEnvironment>) => Promise<Response> {
    return async (c) => {
        try {
            const cardId = c.req.param('cardId') || '';
            if (!validFudabaCardId(cardId)) return notFound(c);
            let payload: unknown;
            try {
                payload = await c.req.json();
            } catch {
                return c.json({
                    success: false,
                    code: 'FUDABA_CARD_REACTION_INVALID',
                    message: '表情不受支持'
                }, 400);
            }
            const emoji = (payload as { emoji?: unknown } | null)?.emoji;
            if (typeof emoji !== 'string' || !ALLOWED_REACTIONS.has(emoji)) {
                return c.json({
                    success: false,
                    code: 'FUDABA_CARD_REACTION_INVALID',
                    message: '表情不受支持'
                }, 400);
            }
            const applied = await fudabaRepository(c).applyPublicCardReaction({
                cardId,
                emoji,
                delta
            });
            if (!applied) return notFound(c);
            return await reactionList(c, cardId);
        } catch (error) {
            return reactionFailure(c, error);
        }
    };
}
