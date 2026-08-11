import { writeAudit } from '@/domains/audit/hono-service';
import type { NamecardDeleteContext } from '@/domains/namecards/request';
import type {
    NamecardErrorResponse,
    NamecardMutationResponse
} from '@/domains/namecards/response';
import { namecardRepository, services } from '@/middleware/hono-context';
import { deleteObjectWithCompensation } from '@/utils/storage/delete-object';
import { publicMediaObjectKey } from '@/utils/storage/business-object-keys';

export async function handleDeleteNamecard(c: NamecardDeleteContext): Promise<Response> {
    const { id } = c.req.valid('param');
    const { expected_revision: expectedRevision } = c.req.valid('query');
    if (expectedRevision === null) {
        return c.json({ error: 'expected_revision is required' } satisfies NamecardErrorResponse, 428);
    }
    const result = await namecardRepository(c).deleteCard(id, expectedRevision);
    if (result.status === 'not-found') {
        return c.json({ error: 'Namecard not found' } satisfies NamecardErrorResponse, 404);
    }
    if (result.status === 'conflict') {
        return c.json({
            error: 'Namecard changed; refresh and retry',
            revision: result.revision
        } satisfies NamecardErrorResponse, 409);
    }
    try {
        await Promise.all([result.card.image1_url, result.card.image2_url].map((url) =>
            deleteObjectWithCompensation(services(c), publicMediaObjectKey(url))
        ));
    } catch (error) {
        console.error('Failed to clean media for committed namecard deletion', error);
    }
    await writeAudit(c, '删除图片', `card_id=${id};revision=${expectedRevision}`);
    return c.json({ success: true } satisfies NamecardMutationResponse);
}
