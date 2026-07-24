import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import { ALLOWED_REACTIONS } from '@/domains/reactions/reaction-input';
import { reactionRepository } from '@/middleware/hono-context';
import { positiveInteger } from '@/utils/validation/number';

export async function handleListReactions(c: Context<AppEnvironment>): Promise<Response> {
    const id = positiveInteger(c.req.query('id'));
    if (!id) return c.json({ error: 'Invalid card id' }, 400);
    try {
        if (!await reactionRepository(c).findApprovedCard(id)) {
            return c.json({ error: 'Card not found' }, 404);
        }
        const result: Record<string, number> = Object.create(null) as Record<string, number>;
        for (const reaction of await reactionRepository(c).listReactions(id)) {
            if (ALLOWED_REACTIONS.has(reaction.emoji)) result[reaction.emoji] = reaction.count;
        }
        return c.json(result);
    } catch {
        return c.json({ error: 'Database error' }, 500);
    }
}
