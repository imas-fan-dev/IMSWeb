import { writeAudit } from '@/domains/admin/audit/write-audit';
import type { NamecardDeleteContext } from '@/domains/community/namecards/request';
import type {
    NamecardErrorResponse,
    NamecardMutationResponse
} from '@/domains/community/namecards/response';
import { namecardRepository } from '@/middleware/hono-context';

/**
 * Removes the card from every surface at once by stamping `deleted_at`. The row
 * and its media stay, so a database operator can still restore it.
 */
export async function handleDeleteAdminNamecard(c: NamecardDeleteContext): Promise<Response> {
    const { id } = c.req.valid('param');
    const { expected_revision: expectedRevision } = c.req.valid('json');
    const result = await namecardRepository(c).deleteCardAsAdmin(id, expectedRevision);
    if (result.status === 'not-found') {
        return c.json({ error: 'Namecard not found' } satisfies NamecardErrorResponse, 404);
    }
    if (result.status === 'conflict') {
        return c.json({
            success: false,
            error: 'Namecard changed; refresh and retry',
            revision: result.revision
        } satisfies NamecardErrorResponse, 409);
    }
    await writeAudit(c, '删除名片', `card_id=${id};revision=${result.revision}`);
    return c.json({
        success: true,
        revision: result.revision
    } satisfies NamecardMutationResponse);
}
