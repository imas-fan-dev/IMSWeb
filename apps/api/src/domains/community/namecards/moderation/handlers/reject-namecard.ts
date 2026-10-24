import { writeAudit } from '@/domains/admin/audit/write-audit';
import type { NamecardMutationContext } from '@/domains/community/namecards/request';
import type {
    NamecardErrorResponse,
    NamecardMutationResponse
} from '@/domains/community/namecards/response';
import { namecardRepository } from '@/middleware/hono-context';

export async function handleRejectNamecard(c: NamecardMutationContext): Promise<Response> {
    const { id } = c.req.valid('param');
    const { expected_revision: expectedRevision } = c.req.valid('json');
    const result = await namecardRepository(c).rejectSubmission(id, expectedRevision);
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
    await writeAudit(c, '驳回名片投稿', `card_id=${id};revision=${result.card.revision}`);
    return c.json({ success: true } satisfies NamecardMutationResponse);
}
