import type { AppEnvironment } from '@/app';
import type { AdminNamecardLockAuditQuery } from '@/domains/community/namecards/request';
import type { AdminNamecardLockAuditListResponse } from '@/domains/community/namecards/response';
import { namecardRepository } from '@/middleware/hono-context';
import type { ValidatedRequestContext } from '@/middleware/request-validation';

const PAGE_SIZE = 20;

/**
 * Every lock decision is appended, so the table shows both the moment a card
 * was taken down and the moment it came back.
 */
export async function handleListAdminNamecardLockAudit(
    c: ValidatedRequestContext<AppEnvironment, 'query', AdminNamecardLockAuditQuery>
): Promise<Response> {
    const { page, owner, reason, handler, action } = c.req.valid('query');
    try {
        const audit = await namecardRepository(c).listNamecardLockAudit({
            page,
            pageSize: PAGE_SIZE,
            owner,
            reason,
            handler,
            action,
        });
        const pageCounts = new Map<string, number>();
        for (const row of audit.rows) {
            if (!row.ownerAccountId) continue;
            pageCounts.set(
                row.ownerAccountId,
                (pageCounts.get(row.ownerAccountId) ?? 0) + 1
            );
        }
        const totalPages = Math.ceil(audit.total / PAGE_SIZE);
        return c.json({
            success: true,
            data: audit.rows.map((row) => ({
                id: row.id,
                cardNumber: row.cardNumber,
                producerName: row.producerName,
                owner: row.ownerAccountId
                    ? {
                          name: row.ownerName ?? row.ownerAccountId,
                          total: audit.ownerTotals[row.ownerAccountId] ?? 0,
                          pageCount: pageCounts.get(row.ownerAccountId) ?? 1,
                      }
                    : null,
                action: row.action,
                reason: row.reason,
                handledBy: row.handledBy,
                occurredAt: row.occurredAt,
            })),
            pageInfo: {
                page,
                pageSize: PAGE_SIZE,
                total: audit.total,
                totalPages,
                hasNextPage: page < totalPages,
            },
        } satisfies AdminNamecardLockAuditListResponse);
    } catch (error) {
        console.error('[admin-namecard-lock-audit]', error);
        return c.json({ success: false } satisfies AdminNamecardLockAuditListResponse);
    }
}
