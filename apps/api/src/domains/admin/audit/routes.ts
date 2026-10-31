import { adminApiPath } from '@imsweb/contracts/paths';
import type { ImsHonoApp } from '@/app';
import { handleListAuditLogs } from '@/domains/admin/audit/handlers/list-audit-logs';
import { backofficeAuth, opOnly } from '@/middleware/hono-auth';

export function registerAuditRoutes(app: ImsHonoApp): void {
    app.get(adminApiPath('/logs'), backofficeAuth, opOnly, handleListAuditLogs);
}
