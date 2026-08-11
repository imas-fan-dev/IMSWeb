import type { NamecardIdParams, NamecardParamContext } from '@/domains/namecards/request';
import {
    toNamecardSubmissionResponse,
    type NamecardErrorResponse,
    type NamecardSubmissionDetailResponse
} from '@/domains/namecards/response';
import {
    enforceSubmissionLimit,
    withdrawalTokenHash
} from '@/domains/namecards/submission-support';
import { namecardRepository } from '@/middleware/hono-context';

export async function handleGetNamecardSubmission(
    c: NamecardParamContext<NamecardIdParams>
): Promise<Response> {
    const { id } = c.req.valid('param');
    const limited = await enforceSubmissionLimit(c, id);
    if (limited) return limited;
    const tokenHash = await withdrawalTokenHash(c);
    const submission = tokenHash
        ? await namecardRepository(c).findSubmissionByTokenHash(id, tokenHash)
        : null;
    if (!submission) {
        return c.json({ error: 'Submission not found' } satisfies NamecardErrorResponse, 404);
    }
    return c.json({
        submission: toNamecardSubmissionResponse(submission)
    } satisfies NamecardSubmissionDetailResponse);
}
