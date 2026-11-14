import type {
    NamecardCharacterConflict,
    NamecardCharacterMutation
} from '@imsweb/contracts/fudaba/admin-characters';
import type { FailureMessageResponse } from '@imsweb/contracts/common';
import { NAMECARD_CHARACTER_ACTIONS, namecardCharacterAuditTarget } from '@/domains/admin/namecard-characters/audit-actions';
import { writeAudit } from '@/domains/admin/audit/write-audit';
import type { NamecardCharacterUpdateRequestContext } from '@/domains/admin/namecard-characters/request';
import { toNamecardCharacter } from '@/domains/admin/namecard-characters/response';
import { namecardCharacterRepository } from '@/middleware/hono-context';

export async function handleUpdateAdminNamecardCharacter(
    c: NamecardCharacterUpdateRequestContext
): Promise<Response> {
    const { id } = c.req.valid('param');
    const fields = c.req.valid('json');
    const actorId = c.get('backofficeUser')!.id;
    const result = await namecardCharacterRepository(c).updateNamecardCharacter({
        ...fields,
        id,
        actorId
    });
    if (result.status === 'not-found') {
        return c.json(
            { success: false, message: '名片角色不存在' } satisfies FailureMessageResponse,
            404
        );
    }
    if (result.status === 'agency-not-found') {
        return c.json(
            { success: false, message: '企划不存在' } satisfies FailureMessageResponse,
            400
        );
    }
    if (result.status === 'duplicate') {
        return c.json(
            { success: false, message: '该企划下已存在同名角色' } satisfies FailureMessageResponse,
            409
        );
    }
    if (result.status === 'fallback-exists') {
        return c.json(
            { success: false, message: '该分类已存在兜底条目' } satisfies FailureMessageResponse,
            409
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
        NAMECARD_CHARACTER_ACTIONS.update,
        namecardCharacterAuditTarget(result.character.id, result.character.agency_id)
    );
    const payload: NamecardCharacterMutation = {
        success: true,
        character: toNamecardCharacter(result.character)
    };
    return c.json(payload);
}
