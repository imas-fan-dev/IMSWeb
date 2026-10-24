import type {
    NamecardUnitConflict,
    NamecardUnitMutation
} from '@imsweb/contracts/fudaba/admin-units';
import type { FailureMessageResponse } from '@imsweb/contracts/common';
import {
    NAMECARD_UNIT_ACTIONS,
    namecardUnitAuditTarget
} from '@/domains/admin/namecard-units/audit-actions';
import type { NamecardUnitUpdateRequestContext } from '@/domains/admin/namecard-units/request';
import { toNamecardUnit } from '@/domains/admin/namecard-units/response';
import { writeAudit } from '@/domains/admin/audit/write-audit';
import { namecardUnitRepository } from '@/middleware/hono-context';

export async function handleUpdateAdminNamecardUnit(
    c: NamecardUnitUpdateRequestContext
): Promise<Response> {
    const { id } = c.req.valid('param');
    const fields = c.req.valid('json');
    const actorId = c.get('backofficeUser')!.id;
    const result = await namecardUnitRepository(c).updateNamecardUnit({
        ...fields,
        id,
        actorId
    });
    if (result.status === 'not-found') {
        return c.json(
            { success: false, message: '名片组合不存在' } satisfies FailureMessageResponse,
            404
        );
    }
    if (result.status === 'agency-not-found') {
        return c.json(
            {
                success: false,
                message: `企划不存在：${result.missingIds.join('、')}`
            } satisfies FailureMessageResponse,
            400
        );
    }
    if (result.status === 'member-not-found') {
        return c.json(
            {
                success: false,
                message: `名片角色不存在：${result.missingIds.join('、')}`
            } satisfies FailureMessageResponse,
            400
        );
    }
    if (result.status === 'duplicate') {
        return c.json(
            {
                success: false,
                message: '已存在同名名片组合'
            } satisfies FailureMessageResponse,
            409
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
        NAMECARD_UNIT_ACTIONS.update,
        namecardUnitAuditTarget(result.unit.id, fields.agencyIds)
    );
    const payload: NamecardUnitMutation = {
        success: true,
        unit: toNamecardUnit(result.unit)
    };
    return c.json(payload);
}
