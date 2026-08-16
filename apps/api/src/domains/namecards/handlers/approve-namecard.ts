import { writeAudit } from '@/domains/audit/hono-service';
import { publishNamecardMedia } from '@/domains/namecards/media-assets';
import type { NamecardMutationContext } from '@/domains/namecards/request';
import type {
    NamecardErrorResponse,
    NamecardMutationResponse
} from '@/domains/namecards/response';
import { namecardRepository, services } from '@/middleware/hono-context';

export async function handleApproveNamecard(c: NamecardMutationContext): Promise<Response> {
    const { id } = c.req.valid('param');
    const { expected_revision: revision } = c.req.valid('json');
    try {
        const repository = namecardRepository(c);
        const claim = await repository.beginCardApproval(id, revision);
        if (claim.status === 'not-found') {
            return c.json({ error: 'Namecard not found' } satisfies NamecardErrorResponse, 404);
        }
        if (claim.status === 'conflict') {
            return c.json({
                error: 'Namecard changed; refresh and retry',
                revision: claim.revision
            } satisfies NamecardErrorResponse, 409);
        }
        if (claim.status === 'withdrawn') {
            return c.json({
                error: '用户已撤回',
                revision: claim.revision
            } satisfies NamecardErrorResponse, 410);
        }
        const storage = services(c).storage;
        if (!storage) throw new Error('Object storage publication is unavailable');
        await publishNamecardMedia(storage, [claim.card.image1_url, claim.card.image2_url]);
        const completed = await repository.completeCardApproval(id, claim.card.revision);
        if (completed.status !== 'updated') {
            return c.json({
                error: 'Namecard changed; refresh and retry',
                ...(completed.status === 'conflict' ? { revision: completed.revision } : {})
            } satisfies NamecardErrorResponse, 409);
        }
        await writeAudit(c, '审核图片通过', `card_id=${id};revision=${completed.card.revision}`);
        return c.json({
            success: true,
            revision: completed.card.revision
        } satisfies NamecardMutationResponse);
    } catch (error) {
        console.error('Failed to approve namecard', error);
        return c.json({ error: '服务器错误' } satisfies NamecardErrorResponse, 500);
    }
}
