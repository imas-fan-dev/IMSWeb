import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import type { CheckAuthResponse } from '@/domains/admin/backoffice-auth/response';

export function handleCheckBackofficeAuth(c: Context<AppEnvironment>): Response {
    return c.json({
        success: true,
        user: c.get('backofficeUser')!
    } satisfies CheckAuthResponse);
}
