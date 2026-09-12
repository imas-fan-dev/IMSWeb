import type { AdminAccountResponse } from '@/domains/admin/admin-accounts/response';
import type { AdminAccountRecord } from '@/ports/repositories';

export function serializeAdminAccount(account: AdminAccountRecord): AdminAccountResponse {
    return {
        id: account.id,
        username: account.username,
        producername: account.producername || '',
        adminRole: account.admin_role
    };
}
