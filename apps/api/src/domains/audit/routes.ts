import type { ImsHonoApp } from '@/app';
import { handleListAuditLogs } from '@/domains/audit/handlers/list-audit-logs';
import { coreAuth, opOnly } from '@/middleware/hono-auth';

export function registerAuditRoutes(app: ImsHonoApp): void {
    app.get('/api/admin/logs', coreAuth, opOnly, handleListAuditLogs);
}
