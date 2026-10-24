import type { NamecardUnitMutation } from '@imsweb/contracts/fudaba/admin-units';
import type { FailureMessageResponse } from '@imsweb/contracts/common';
import {
    NAMECARD_UNIT_ACTIONS,
    namecardUnitAuditTarget
} from '@/domains/admin/namecard-units/audit-actions';
import type { NamecardUnitCreateRequestContext } from '@/domains/admin/namecard-units/request';
import { toNamecardUnit } from '@/domains/admin/namecard-units/response';
import { writeAudit } from '@/domains/admin/audit/write-audit';
import { namecardUnitRepository } from '@/middleware/hono-context';

export async function handleCreateAdminNamecardUnit(
    c: NamecardUnitCreateRequestContext
): Promise<Response> {
    const fields = c.req.valid('json');
    // `backofficeAuth` + `opOnly` run before this handler, so the claims exist.
    const actorId = c.get('backofficeUser')!.id;
    const result = await namecardUnitRepository(c).createNamecardUnit({
        ...fields,
        actorId
    });
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
    await writeAudit(
        c,
        NAMECARD_UNIT_ACTIONS.create,
        namecardUnitAuditTarget(result.unit.id, fields.agencyIds)
    );
    const payload: NamecardUnitMutation = {
        success: true,
        unit: toNamecardUnit(result.unit)
    };
    return c.json(payload, 201);
}
