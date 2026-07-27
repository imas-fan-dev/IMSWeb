import type { ImsHonoApp } from '@/app';
import { handleCreateAdminAccount } from '@/domains/admin-accounts/handlers/create-admin-account';
import { handleDeleteAdminAccount } from '@/domains/admin-accounts/handlers/delete-admin-account';
import { handleListAdminAccounts } from '@/domains/admin-accounts/handlers/list-admin-accounts';
import { coreAuth, coreCsrf, opOnly, superAdminOnly } from '@/middleware/hono-auth';

export function registerAdminAccountRoutes(app: ImsHonoApp): void {
    app.get(
        '/api/admin/accounts',
        coreAuth,
        opOnly,
        superAdminOnly,
        handleListAdminAccounts
    );
    app.post(
        '/api/admin/accounts',
        coreAuth,
        opOnly,
        superAdminOnly,
        coreCsrf,
        handleCreateAdminAccount
    );
    app.delete(
        '/api/admin/accounts/:id',
        coreAuth,
        opOnly,
        superAdminOnly,
        coreCsrf,
        handleDeleteAdminAccount
    );
}
