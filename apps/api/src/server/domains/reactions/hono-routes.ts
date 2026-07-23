import type { Context } from 'hono';
import type { AppEnvironment, ImsHonoApp } from '@/app';
import { coreRepository, positiveInteger } from '@/shared/hono-utils';

const ALLOWED_REACTIONS = new Set([
    '❤️', '👍', '😂', '🤣', '😭', '😍', '🥰', '😘', '🤯', '😱',
    '😎', '🤩', '😤', '🙏', '👏', '✨', '💯', '🎉', '💥', '🌟',
    '🐵', '🐶', '🐱', '🦊', '🐼', '🐳', '🔥', '💀', '👀', '🍀',
    '🌈', '🐛', '💎', '🚀', '🏆', '🍕', '🍔', '🎮', '🌹', '🍭',
    '🔨', '🔫', '❓', '🧒', '😙', '🔘'
]);

async function body(c: Context<AppEnvironment>): Promise<Record<string, unknown>> {
    try {
        return await c.req.json<Record<string, unknown>>();
    } catch {
        return {};
    }
}

function mutationBody(path: string): { success: true } | { ok: true } {
    return path === '/api/emojis' ? { success: true } : { ok: true };
}

export function registerReactionRoutes(app: ImsHonoApp): void {
    for (const route of ['/api/emojis', '/api/reactions'] as const) {
        app.get(route, async (c) => {
            const id = positiveInteger(c.req.query('id'));
            if (!id) return c.json({ error: 'Invalid card id' }, 400);
            try {
                if (!await coreRepository(c).findApprovedCard(id)) {
                    return c.json({ error: 'Card not found' }, 404);
                }
                const result: Record<string, number> = Object.create(null) as Record<string, number>;
                for (const reaction of await coreRepository(c).listReactions(id)) {
                    if (ALLOWED_REACTIONS.has(reaction.emoji)) result[reaction.emoji] = reaction.count;
                }
                return c.json(result);
            } catch {
                return c.json({ error: 'Database error' }, 500);
            }
        });

        app.post(route, async (c) => {
            const payload = await body(c);
            if (typeof payload.emoji !== 'string' || !ALLOWED_REACTIONS.has(payload.emoji)) {
                return c.json({ error: 'Unsupported reaction' }, 400);
            }
            const id = positiveInteger(payload.id);
            if (!id) return c.json({ error: 'Invalid card id' }, 400);
            try {
                if (!await coreRepository(c).findApprovedCard(id)) {
                    return c.json({ error: 'Card not found' }, 404);
                }
                await coreRepository(c).incrementReaction(id, payload.emoji);
                return c.json(mutationBody(route));
            } catch {
                return c.json({ error: 'Database error' }, 500);
            }
        });

        app.delete(route, async (c) => {
            const payload = await body(c);
            if (typeof payload.emoji !== 'string' || !ALLOWED_REACTIONS.has(payload.emoji)) {
                return c.json({ error: 'Unsupported reaction' }, 400);
            }
            const id = positiveInteger(payload.id);
            if (!id) return c.json({ error: 'Invalid card id' }, 400);
            try {
                if (!await coreRepository(c).findApprovedCard(id)) {
                    return c.json({ error: 'Card not found' }, 404);
                }
                await coreRepository(c).decrementAndPruneReaction(id, payload.emoji);
                return c.json(mutationBody(route));
            } catch {
                return c.json({ error: 'Database error' }, 500);
            }
        });
    }
}
