import type { AppEnvironment } from '@/app';
import type {
    CreateAdminAccountRequest
} from '@/domains/admin-accounts/create-admin-account-request';
import type {
    AdminAccountErrorResponse,
    CreateAdminAccountResponse
} from '@/domains/admin-accounts/response';
import { writeAudit } from '@/domains/audit/hono-service';
import { serializeAdminAccount } from '@/domains/admin-accounts/serializer';
import { adminAccountRepository, services } from '@/middleware/hono-context';
import type { ValidatedRequestContext } from '@/middleware/request-validation';

export async function handleCreateAdminAccount(
    c: ValidatedRequestContext<AppEnvironment, 'json', CreateAdminAccountRequest>
): Promise<Response> {
    const { username, producername, password } = c.req.valid('json');
    const passwordService = services(c).passwords;
    if (!passwordService?.hash) throw new Error('Password hashing service is unavailable');
    try {
        const account = await adminAccountRepository(c).createAdminAccount({
            username,
            producername,
            passwordHash: await passwordService.hash(password)
        });
        await writeAudit(c, '新增管理员', username);
        return c.json({
            success: true,
            account: serializeAdminAccount(account)
        } satisfies CreateAdminAccountResponse, 201);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (/unique|constraint|duplicate/i.test(message)) {
            return c.json({
                success: false,
                message: '用户名已存在'
            } satisfies AdminAccountErrorResponse, 409);
        }
        throw error;
    }
}
