import type {
    NamecardUnitConflict,
    NamecardUnitDelete
} from '@imsweb/contracts/fudaba/admin-units';
import type { FailureMessageResponse } from '@imsweb/contracts/common';
import {
    NAMECARD_UNIT_ACTIONS,
    namecardUnitAuditTarget
} from '@/domains/admin/namecard-units/audit-actions';
import type { NamecardUnitDeleteRequestContext } from '@/domains/admin/namecard-units/request';
import { writeAudit } from '@/domains/admin/audit/write-audit';
import { namecardUnitRepository } from '@/middleware/hono-context';

export async function handleDeleteAdminNamecardUnit(
    c: NamecardUnitDeleteRequestContext
): Promise<Response> {
    const { id } = c.req.valid('param');
    const { revision } = c.req.valid('query');
    const result = await namecardUnitRepository(c).deleteNamecardUnit(
        id,
        revision
    );
    if (result.status === 'not-found') {
        return c.json(
            { success: false, message: '名片组合不存在' } satisfies FailureMessageResponse,
            404
        );
    }
    if (result.status === 'conflict') {
        return c.json(
            {
                success: false,
                code: 'NAMECARD_UNIT_STATE_CONFLICT',
                revision: result.revision
            } satisfies NamecardUnitConflict,
            409
        );
    }
    await writeAudit(
        c,
        NAMECARD_UNIT_ACTIONS.delete,
        namecardUnitAuditTarget(result.id)
    );
    const payload: NamecardUnitDelete = {
        success: true,
        id: result.id
    };
    return c.json(payload);
}
