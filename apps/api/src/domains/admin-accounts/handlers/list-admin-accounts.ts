import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import type {
    AdminAccountListResponse
} from '@/domains/admin-accounts/response';
import { serializeAdminAccount } from '@/domains/admin-accounts/serializer';
import { adminAccountRepository } from '@/middleware/hono-context';

export async function handleListAdminAccounts(c: Context<AppEnvironment>): Promise<Response> {
    const accounts = await adminAccountRepository(c).listAdminAccounts();
    return c.json({
        success: true,
        accounts: accounts.map(serializeAdminAccount)
    } satisfies AdminAccountListResponse);
}
