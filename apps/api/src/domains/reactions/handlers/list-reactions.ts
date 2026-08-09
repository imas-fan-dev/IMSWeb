import type { AppEnvironment } from '@/app';
import {
    ALLOWED_REACTIONS,
    type ReactionListQuery
} from '@/domains/reactions/reaction-input';
import type {
    ReactionErrorResponse,
    ReactionListResponse
} from '@/domains/reactions/response';
import { reactionRepository } from '@/middleware/hono-context';
import type { ValidatedRequestContext } from '@/middleware/request-validation';

export async function handleListReactions(
    c: ValidatedRequestContext<AppEnvironment, 'query', ReactionListQuery>
): Promise<Response> {
    const { id } = c.req.valid('query');
    try {
        if (!await reactionRepository(c).findApprovedCard(id)) {
            return c.json(
                { error: 'Card not found' } satisfies ReactionErrorResponse,
                404
            );
        }
        const result: ReactionListResponse = Object.create(null) as ReactionListResponse;
        for (const reaction of await reactionRepository(c).listReactions(id)) {
            if (ALLOWED_REACTIONS.has(reaction.emoji)) result[reaction.emoji] = reaction.count;
        }
        return c.json(result satisfies ReactionListResponse);
    } catch {
        return c.json(
            { error: 'Database error' } satisfies ReactionErrorResponse,
            500
        );
    }
}
