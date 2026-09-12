import type { AdminAccountIdParams as AdminAccountIdParamsWire } from '@imsweb/contracts/admin';
import { positiveInteger } from '@/utils/validation/number';
import { invalidRequest } from '@/utils/validation/request-data';

export interface AdminAccountIdParams {
    id: number;
}

export function normalizeAdminAccountIdParams(
    value: AdminAccountIdParamsWire
): AdminAccountIdParams {
    const id = positiveInteger(value.id);
    if (!id) invalidRequest('管理员账号 ID 无效');
    return { id };
}
