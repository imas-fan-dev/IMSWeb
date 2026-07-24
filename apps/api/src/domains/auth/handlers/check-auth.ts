import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';

export function handleCheckAuth(c: Context<AppEnvironment>): Response {
    return c.json({ success: true, user: c.get('user') });
}
