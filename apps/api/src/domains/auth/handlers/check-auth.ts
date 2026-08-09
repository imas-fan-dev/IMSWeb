import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import type { CheckAuthResponse } from '@/domains/auth/response';

export function handleCheckAuth(c: Context<AppEnvironment>): Response {
    return c.json({
        success: true,
        user: c.get('user')!
    } satisfies CheckAuthResponse);
}
