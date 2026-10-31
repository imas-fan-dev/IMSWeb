import type { GuestSubmissionParamContext } from '@/domains/community/fudaba/guest-submissions/request';
import {
    toFudabaGuestSubmissionResponse,
    type FudabaGuestSubmissionDetailResponse,
    type GuestSubmissionErrorResponse,
} from '@/domains/community/fudaba/guest-submissions/response';
import {
    enforceSubmissionLimit,
    withdrawalTokenHash,
} from '@/domains/community/fudaba/guest-submissions/submission-guards';
import { namecardRepository } from '@/middleware/hono-context';

export async function handleGetFudabaGuestSubmission(
    c: GuestSubmissionParamContext,
): Promise<Response> {
    const { id } = c.req.valid('param');
    const limited = await enforceSubmissionLimit(c, id);
    if (limited) return limited;
    const tokenHash = await withdrawalTokenHash(c);
    const submission = tokenHash
        ? await namecardRepository(c).findSubmissionByTokenHash(id, tokenHash)
        : null;
    if (!submission) {
        return c.json(
            { error: 'Submission not found' } satisfies GuestSubmissionErrorResponse,
            404,
        );
    }
    return c.json({
        success: true,
        submission: toFudabaGuestSubmissionResponse(submission),
    } satisfies FudabaGuestSubmissionDetailResponse);
}
