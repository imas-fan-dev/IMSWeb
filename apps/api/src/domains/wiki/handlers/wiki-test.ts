import type { Context, Env } from 'hono';

export function handleWikiTest<E extends Env>(context: Context<E>): Response {
    return context.json({ status: 'ok' });
}
