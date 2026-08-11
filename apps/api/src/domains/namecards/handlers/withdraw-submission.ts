import { writeAudit } from '@/domains/audit/hono-service';
import type { NamecardWithdrawalContext } from '@/domains/namecards/request';
import {
    toNamecardSubmissionResponse,
    type NamecardErrorResponse,
    type NamecardWithdrawalResponse
} from '@/domains/namecards/response';
import {
    enforceSubmissionLimit,
    withdrawalTokenHash
} from '@/domains/namecards/submission-support';
import { namecardRepository, services } from '@/middleware/hono-context';
import { deleteObjectWithCompensation } from '@/utils/storage/delete-object';
import { publicMediaObjectKey } from '@/utils/storage/business-object-keys';

export async function handleWithdrawNamecardSubmission(
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
    const result = await namecardRepository(c).withdrawSubmission(
        id,
        tokenHash,
        expectedRevision
    );
    if (result.status === 'not-found') {
        return c.json({ error: 'Submission not found' } satisfies NamecardErrorResponse, 404);
    }
    if (result.status === 'conflict') {
        return c.json({
            error: 'Submission changed; refresh and retry',
            revision: result.revision
        } satisfies NamecardErrorResponse, 409);
    }
    try {
        await Promise.all([result.card.image1_url, result.card.image2_url].map((url) =>
            deleteObjectWithCompensation(services(c), publicMediaObjectKey(url))
        ));
    } catch (error) {
        console.error('Failed to clean withdrawn namecard media', error);
    }
    await writeAudit(c, '撤回名片投稿', `card_id=${id};revision=${result.card.revision}`);
    return c.json({
        success: true,
        submission: toNamecardSubmissionResponse(result.card)
    } satisfies NamecardWithdrawalResponse);
}
