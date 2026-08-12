import { writeAudit } from '@/domains/audit/hono-service';
import type { NamecardWithdrawalContext } from '@/domains/namecards/request';
import {
    type NamecardErrorResponse,
    type NamecardMessageResponse,
    type NamecardResubmitResponse,
    toNamecardSubmissionResponse
} from '@/domains/namecards/response';
import {
    enforceSubmissionLimit,
    withdrawalTokenHash
} from '@/domains/namecards/submission-support';
import { namecardRepository } from '@/middleware/hono-context';

export async function handleResubmitNamecardSubmission(
    c: NamecardWithdrawalContext
): Promise<Response> {
    const { id } = c.req.valid('param');
    const limited = await enforceSubmissionLimit(c, id);
    if (limited) return limited;
    const tokenHash = await withdrawalTokenHash(c);
    if (!tokenHash) {
        return c.json({ error: 'Submission not found' } satisfies NamecardErrorResponse, 404);
    }
    const { expected_revision: expectedRevision } = c.req.valid('json');
    const submission = await namecardRepository(c).findSubmissionWithHashesByTokenHash(id, tokenHash);
    if (!submission) {
        return c.json({ error: 'Submission not found' } satisfies NamecardErrorResponse, 404);
    }
    if (
        submission.revision !== expectedRevision ||
        (submission.status !== 'withdrawn' && submission.status !== 'rejected')
    ) {
        return c.json({
            error: 'Submission changed; refresh and retry',
            revision: submission.revision
        } satisfies NamecardErrorResponse, 409);
    }
    const duplicate = await namecardRepository(c).findCardByOrderedHashes(
        submission.hash1,
        submission.hash2
    );
    if (duplicate && duplicate.id !== id) {
        return c.json({ msg: '重复上传' } satisfies NamecardMessageResponse, 409);
    }
    const result = await namecardRepository(c).resubmitSubmission(id, tokenHash, expectedRevision);
    if (result.status === 'not-found') {
        return c.json({ error: 'Submission not found' } satisfies NamecardErrorResponse, 404);
    }
    if (result.status === 'conflict') {
        return c.json({
            error: 'Submission changed; refresh and retry',
            revision: result.revision
        } satisfies NamecardErrorResponse, 409);
    }
    await writeAudit(c, '重新送审名片投稿', `card_id=${id};revision=${result.card.revision}`);
    return c.json({
        success: true,
        submission: toNamecardSubmissionResponse(result.card)
    } satisfies NamecardResubmitResponse);
}
