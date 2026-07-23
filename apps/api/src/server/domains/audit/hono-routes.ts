import type { ImsHonoApp } from '@/app';
import { coreAuth, opOnly } from '@/middleware/hono-auth';
import { coreRepository } from '@/shared/hono-utils';

export function registerAuditRoutes(app: ImsHonoApp): void {
    app.get('/api/admin/logs', coreAuth, opOnly, async (c) => {
        let data: Record<string, unknown>[] = [];
        try {
            data = await coreRepository(c).listRecentAuditLogs(100);
        } catch {
            // The legacy endpoint deliberately returns an empty/partial result.
        }
        return c.json({ success: true, data });
    });
}
