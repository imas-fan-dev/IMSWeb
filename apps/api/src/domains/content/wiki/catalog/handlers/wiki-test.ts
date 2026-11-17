import type { Context, Env } from 'hono';
import type {
    WikiTestResponse
} from '@/domains/content/wiki/response';

export function handleWikiTest<E extends Env>(context: Context<E>): Response {
    return context.json({ status: 'ok' } satisfies WikiTestResponse);
}
