import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import type { PlatformAccountAdminRecord } from '@/ports/repositories';
import { platformAccountRepository } from '@/middleware/hono-context';

/**
 * The detail read is an id search with `limit: 1`, so it reuses the list SQL
 * instead of growing a second projection that could drift and start leaking a
 * column the list deliberately omits. Accounts with `deleted_at` set never
 * match.
 */
export async function findAdminPlatformUser(
    c: Context<AppEnvironment>,
    accountId: string
): Promise<PlatformAccountAdminRecord | null> {
    const rows = await platformAccountRepository(c).listPlatformAccountsForAdmin({
        field: 'id',
        query: accountId,
        limit: 1,
        offset: 0,
        activeAt: Date.now()
    });
    return rows[0] ?? null;
}
