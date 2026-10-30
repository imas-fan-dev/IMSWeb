import type { AppEnvironment } from '@/app';
import type { AdminNamecardLockAuditQuery } from '@/domains/community/namecards/request';
import type { AdminNamecardLockAuditListResponse } from '@/domains/community/namecards/response';
import { namecardRepository } from '@/middleware/hono-context';
import type { ValidatedRequestContext } from '@/middleware/request-validation';

const PAGE_SIZE = 20;

/**
 * The lock audit only knows about cards that are locked right now: unlocking
 * deletes the row, so this table never grows into a history browser.
 */
export async function handleListAdminNamecardLockAudit(
    c: ValidatedRequestContext<AppEnvironment, 'query', AdminNamecardLockAuditQuery>
): Promise<Response> {
    const { page, owner, reason, handler } = c.req.valid('query');
    try {
        const audit = await namecardRepository(c).listNamecardLockAudit({
            page,
            pageSize: PAGE_SIZE,
            owner,
            reason,
            handler,
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
                reason: row.reason,
                handledBy: row.handledBy,
                lockedAt: row.lockedAt,
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
