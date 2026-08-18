import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import {
    toAuditLogResponse,
    type AuditLogListResponse,
    type AuditLogResponse
} from '@/domains/admin/audit/response';
import { auditRepository } from '@/middleware/hono-context';

export async function handleListAuditLogs(c: Context<AppEnvironment>): Promise<Response> {
    let data: AuditLogResponse[] = [];
    try {
        data = (await auditRepository(c).listRecentAuditLogs(100)).map(toAuditLogResponse);
    } catch {
        // The legacy endpoint deliberately returns an empty/partial result.
    }
    return c.json({ success: true, data } satisfies AuditLogListResponse);
}
