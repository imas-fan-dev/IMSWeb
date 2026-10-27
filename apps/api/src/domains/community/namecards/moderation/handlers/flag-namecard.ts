import { writeAudit } from '@/domains/admin/audit/write-audit';
import type { NamecardLockContext } from '@/domains/community/namecards/request';
import type {
    NamecardErrorResponse,
    NamecardMutationResponse
} from '@/domains/community/namecards/response';
import { namecardRepository } from '@/middleware/hono-context';

/**
 * Marks the submission as breaking the rules. A revision of a published card
 * only loses its own verdict; a first submission is locked outright.
 */
export async function handleFlagNamecard(c: NamecardLockContext): Promise<Response> {
    const { id } = c.req.valid('param');
    const { expected_revision: expectedRevision, reason } = c.req.valid('json');
    const result = await namecardRepository(c).flagSubmission(id, expectedRevision, reason);
    if (result.status === 'not-found') {
        return c.json({ error: 'Namecard not found' } satisfies NamecardErrorResponse, 404);
    }
    if (result.status === 'withdrawn') {
        return c.json({
            error: '用户已撤回',
            revision: result.revision
        } satisfies NamecardErrorResponse, 410);
    }
    if (result.status === 'conflict') {
        return c.json({
            error: 'Namecard changed; refresh and retry',
            revision: result.revision
        } satisfies NamecardErrorResponse, 409);
    }
    await writeAudit(c, '标记违规名片', `card_id=${id};reason=${reason};revision=${result.card.revision}`);
    return c.json({
        success: true,
        revision: result.card.revision
    } satisfies NamecardMutationResponse);
}
