import type {
    NamecardCharacterConflict,
    NamecardCharacterDelete
} from '@imsweb/contracts/fudaba/admin-characters';
import type { FailureMessageResponse } from '@imsweb/contracts/common';
import { NAMECARD_CHARACTER_ACTIONS, namecardCharacterAuditTarget } from '@/domains/admin/namecard-characters/audit-actions';
import { writeAudit } from '@/domains/admin/audit/write-audit';
import type { NamecardCharacterDeleteRequestContext } from '@/domains/admin/namecard-characters/request';
import { namecardCharacterRepository } from '@/middleware/hono-context';

export async function handleDeleteAdminNamecardCharacter(
    c: NamecardCharacterDeleteRequestContext
): Promise<Response> {
    const { id } = c.req.valid('param');
    const { revision } = c.req.valid('query');
    const result = await namecardCharacterRepository(c).deleteNamecardCharacter(
        id,
        revision
    );
    if (result.status === 'not-found') {
        return c.json(
            { success: false, message: '名片角色不存在' } satisfies FailureMessageResponse,
            404
        );
    }
    if (result.status === 'conflict') {
        return c.json(
            {
                success: false,
                code: 'NAMECARD_CHARACTER_STATE_CONFLICT',
                revision: result.revision
            } satisfies NamecardCharacterConflict,
            409
        );
    }
    await writeAudit(
        c,
        NAMECARD_CHARACTER_ACTIONS.delete,
        namecardCharacterAuditTarget(result.id)
    );
    const payload: NamecardCharacterDelete = {
        success: true,
        id: result.id
    };
    return c.json(payload);
}
