import type { Handler } from 'hono';
import type { AppEnvironment } from '@/app';
import {
    ALLOWED_REACTIONS,
    reactionBody,
    reactionMutationBody
} from '@/domains/reactions/reaction-input';
import { reactionRepository } from '@/middleware/hono-context';
import { positiveInteger } from '@/utils/validation/number';

export function createHandleDeleteReaction(route: string): Handler<AppEnvironment> {
    return async (c) => {
        const payload = await reactionBody(c);
        if (typeof payload.emoji !== 'string' || !ALLOWED_REACTIONS.has(payload.emoji)) {
            return c.json({ error: 'Unsupported reaction' }, 400);
        }
        const id = positiveInteger(payload.id);
        if (!id) return c.json({ error: 'Invalid card id' }, 400);
        try {
            if (!await reactionRepository(c).findApprovedCard(id)) {
                return c.json({ error: 'Card not found' }, 404);
            }
            await reactionRepository(c).decrementAndPruneReaction(id, payload.emoji);
            return c.json(reactionMutationBody(route));
        } catch {
            return c.json({ error: 'Database error' }, 500);
        }
    };
}
