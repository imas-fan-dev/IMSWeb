import { positiveInteger } from '@/utils/validation/number';
import { invalidRequest, requestRecord } from '@/utils/validation/request-data';

export interface AdminAccountIdParams {
    id: number;
}

export function validateAdminAccountIdParams(value: unknown): AdminAccountIdParams {
    const params = requestRecord(value, '管理员账号 ID 无效');
    const id = positiveInteger(params.id);
    if (!id) invalidRequest('管理员账号 ID 无效');
    return { id };
}
