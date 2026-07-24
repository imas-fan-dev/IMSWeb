import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import { auditRepository } from '@/middleware/hono-context';

export async function handleListAuditLogs(c: Context<AppEnvironment>): Promise<Response> {
    let data: Record<string, unknown>[] = [];
    try {
        data = await auditRepository(c).listRecentAuditLogs(100);
    } catch {
        // The legacy endpoint deliberately returns an empty/partial result.
    }
    return c.json({ success: true, data });
}
