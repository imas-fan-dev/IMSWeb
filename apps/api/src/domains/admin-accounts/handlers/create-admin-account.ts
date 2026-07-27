import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import { writeAudit } from '@/domains/audit/hono-service';
import { serializeAdminAccount } from '@/domains/admin-accounts/serializer';
import { adminAccountRepository, services } from '@/middleware/hono-context';

function printable(value: string): boolean {
    return !/[\0-\x1f\x7f]/.test(value);
}

export async function handleCreateAdminAccount(c: Context<AppEnvironment>): Promise<Response> {
    let body: Record<string, unknown>;
    try {
        body = await c.req.json<Record<string, unknown>>();
    } catch {
        return c.json({ success: false, message: '管理员账号信息格式错误' }, 400);
    }
    const username = typeof body.username === 'string' ? body.username.trim() : '';
    const producername = typeof body.producername === 'string' ? body.producername.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    if (
        !username || username.length > 128 || !printable(username) ||
        !producername || producername.length > 80 || !printable(producername) ||
        password.length < 12 || new TextEncoder().encode(password).byteLength > 1024
    ) {
        return c.json({ success: false, message: '用户名、制作人名称或密码不符合要求' }, 400);
    }
    const passwordService = services(c).passwords;
    if (!passwordService?.hash) throw new Error('Password hashing service is unavailable');
    try {
        const account = await adminAccountRepository(c).createAdminAccount({
            username,
            producername,
            passwordHash: await passwordService.hash(password)
        });
        await writeAudit(c, '新增管理员', username);
        return c.json({ success: true, account: serializeAdminAccount(account) }, 201);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (/unique|constraint|duplicate/i.test(message)) {
            return c.json({ success: false, message: '用户名已存在' }, 409);
        }
        throw error;
    }
}
