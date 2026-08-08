import type { Handler } from 'hono';
import type { AppEnvironment } from '@/app';
import {
    type ReactionRequest,
    reactionMutationBody
} from '@/domains/reactions/reaction-input';
import { reactionRepository } from '@/middleware/hono-context';
import type { ValidatedRequestInput } from '@/middleware/request-validation';

export function createHandleAddReaction(
    route: string
): Handler<AppEnvironment, string, ValidatedRequestInput<'json', ReactionRequest>> {
    return async (c) => {
        const { id, emoji } = c.req.valid('json');
        try {
            if (!await reactionRepository(c).findApprovedCard(id)) {
                return c.json({ error: 'Card not found' }, 404);
            }
            await reactionRepository(c).incrementReaction(id, emoji);
            return c.json(reactionMutationBody(route));
        } catch {
            return c.json({ error: 'Database error' }, 500);
        }
    };
}
