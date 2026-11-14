import type { AppEnvironment } from '@/app';
import type { AdminNamecardFeedbackAuditQuery } from '@/domains/community/namecards/request';
import type { AdminNamecardFeedbackAuditListResponse } from '@/domains/community/namecards/response';
import { namecardRepository } from '@/middleware/hono-context';
import type { ValidatedRequestContext } from '@/middleware/request-validation';

const PAGE_SIZE = 20;

function tally(ids: readonly (string | null)[]): Map<string, number> {
    const counts = new Map<string, number>();
    for (const id of ids) {
        if (!id) continue;
        counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    return counts;
}

/** Reports that already carry a verdict; pending ones still live in the queue. */
export async function handleListAdminNamecardFeedbackAudit(
    c: ValidatedRequestContext<AppEnvironment, 'query', AdminNamecardFeedbackAuditQuery>
): Promise<Response> {
    const { page, owner, reporter, outcome, handler } = c.req.valid('query');
    try {
        const audit = await namecardRepository(c).listNamecardFeedbackAudit({
            page,
            pageSize: PAGE_SIZE,
            owner,
            reporter,
            outcome,
            handler,
        });
        const ownerCounts = tally(audit.rows.map((row) => row.ownerAccountId));
        const reporterCounts = tally(audit.rows.map((row) => row.reporterAccountId));
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
                          pageCount: ownerCounts.get(row.ownerAccountId) ?? 1,
                      }
                    : null,
                reporter: {
                    name: row.reporterName,
                    total: audit.reporterTotals[row.reporterAccountId] ?? 0,
                    pageCount: reporterCounts.get(row.reporterAccountId) ?? 1,
                },
                reason: row.reason,
                outcome: row.outcome,
                handledBy: row.handledBy,
                handledAt: row.handledAt,
            })),
            pageInfo: {
                page,
                pageSize: PAGE_SIZE,
                total: audit.total,
                totalPages,
                hasNextPage: page < totalPages,
            },
        } satisfies AdminNamecardFeedbackAuditListResponse);
    } catch (error) {
        console.error('[admin-namecard-feedback-audit]', error);
        return c.json({ success: false } satisfies AdminNamecardFeedbackAuditListResponse);
    }
}
