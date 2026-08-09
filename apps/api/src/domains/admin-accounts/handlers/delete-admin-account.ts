import type { AppEnvironment } from '@/app';
import type { AdminAccountIdParams } from '@/domains/admin-accounts/request';
import type {
    AdminAccountErrorResponse,
    AdminAccountMutationResponse
} from '@/domains/admin-accounts/response';
import { writeAudit } from '@/domains/audit/hono-service';
import { adminAccountRepository, authRepository } from '@/middleware/hono-context';
import type { ValidatedRequestContext } from '@/middleware/request-validation';

export async function handleDeleteAdminAccount(
    c: ValidatedRequestContext<AppEnvironment, 'param', AdminAccountIdParams>
): Promise<Response> {
    const { id } = c.req.valid('param');
    const actor = c.get('user')!;
    const target = await authRepository(c).findUserById(id);
    if (!target || target.dept !== 'op') {
        return c.json({
            success: false,
            message: '管理员账号不存在'
        } satisfies AdminAccountErrorResponse, 404);
    }
    if (target.id === actor.id) {
        return c.json({
            success: false,
            message: '不能删除当前登录账号'
        } satisfies AdminAccountErrorResponse, 409);
    }
    if (target.admin_role === 'super_admin') {
        return c.json({
            success: false,
            message: '不能删除最高管理员'
        } satisfies AdminAccountErrorResponse, 409);
    }
    if (!await adminAccountRepository(c).deleteAdminAccount(id)) {
        return c.json({
            success: false,
            message: '管理员账号状态已发生变化'
        } satisfies AdminAccountErrorResponse, 409);
    }
    await writeAudit(c, '删除管理员', target.username);
    return c.json({ success: true } satisfies AdminAccountMutationResponse);
}
