import { writeAudit } from '@/domains/admin/audit/write-audit';
import type { GuestSubmissionWithdrawalContext } from '@/domains/community/fudaba/guest-submissions/request';
import {
    toFudabaGuestSubmissionResponse,
    type FudabaGuestSubmissionWithdrawalResponse,
    type GuestSubmissionErrorResponse,
} from '@/domains/community/fudaba/guest-submissions/response';
import {
    enforceSubmissionLimit,
    withdrawalTokenHash,
} from '@/domains/community/fudaba/guest-submissions/submission-guards';
import { namecardRepository } from '@/middleware/hono-context';

export async function handleWithdrawFudabaGuestSubmission(
    c: GuestSubmissionWithdrawalContext,
): Promise<Response> {
    const { id } = c.req.valid('param');
    const limited = await enforceSubmissionLimit(c, id);
    if (limited) return limited;
    const tokenHash = await withdrawalTokenHash(c);
    if (!tokenHash) {
        return c.json(
            { error: 'Submission not found' } satisfies GuestSubmissionErrorResponse,
            404,
        );
    }
    const { expectedRevision } = c.req.valid('json');
    const result = await namecardRepository(c).withdrawSubmission(
        id,
        tokenHash,
        expectedRevision,
    );
    if (result.status === 'not-found') {
        return c.json(
            { error: 'Submission not found' } satisfies GuestSubmissionErrorResponse,
            404,
        );
    }
    if (result.status === 'conflict' || result.status === 'withdrawn') {
        return c.json({
            error: 'Submission changed; refresh and retry',
            revision: result.revision,
        } satisfies GuestSubmissionErrorResponse, 409);
    }
    await writeAudit(c, '撤回名片投稿', `card_id=${id};revision=${result.card.revision}`);
    return c.json({
        success: true,
        submission: toFudabaGuestSubmissionResponse(result.card),
    } satisfies FudabaGuestSubmissionWithdrawalResponse);
}
