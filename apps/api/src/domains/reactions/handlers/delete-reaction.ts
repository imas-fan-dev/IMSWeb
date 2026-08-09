import type { Handler } from 'hono';
import type { AppEnvironment } from '@/app';
import type { ReactionRequest } from '@/domains/reactions/reaction-input';
import {
    type ReactionErrorResponse,
    type ReactionMutationResponse,
    reactionMutationBody
} from '@/domains/reactions/response';
import { reactionRepository } from '@/middleware/hono-context';
import type { ValidatedRequestInput } from '@/middleware/request-validation';

export function createHandleDeleteReaction(
    route: string
): Handler<AppEnvironment, string, ValidatedRequestInput<'json', ReactionRequest>> {
    return async (c) => {
        const { id, emoji } = c.req.valid('json');
        try {
            if (!await reactionRepository(c).findApprovedCard(id)) {
                return c.json(
                    { error: 'Card not found' } satisfies ReactionErrorResponse,
                    404
                );
            }
            await reactionRepository(c).decrementAndPruneReaction(id, emoji);
            return c.json(
                reactionMutationBody(route) satisfies ReactionMutationResponse
            );
        } catch {
            return c.json(
                { error: 'Database error' } satisfies ReactionErrorResponse,
                500
            );
        }
    };
}
