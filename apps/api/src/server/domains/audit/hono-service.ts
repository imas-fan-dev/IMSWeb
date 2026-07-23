import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import { coreRepository, getClientAddress } from '@/shared/hono-utils';

export async function writeAudit(
    c: Context<AppEnvironment>,
    action: string,
    target: string
): Promise<void> {
    const user = c.get('user');
    try {
        await coreRepository(c).insertAuditLog({
            username: user?.username || 'anonymous',
            producername: user?.producername || '',
            action,
            target,
            ip: getClientAddress(c),
            time: new Date().toISOString()
        });
    } catch (error) {
        console.error(error);
    }
}
