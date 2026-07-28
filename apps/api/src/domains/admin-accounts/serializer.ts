import type { AdminAccountRecord } from '@/ports/repositories';

export function serializeAdminAccount(account: AdminAccountRecord) {
    return {
        id: account.id,
        username: account.username,
        producername: account.producername || '',
        adminRole: account.admin_role
    };
}
