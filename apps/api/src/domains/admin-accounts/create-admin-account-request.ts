export interface CreateAdminAccountRequest {
    username: string;
    producername: string;
    password: string;
}

export function createAdminAccountValidationError(
    message: string
): Record<string, string | boolean> {
    return { success: false, message };
}

function printable(value: string): boolean {
    return !/[\0-\x1f\x7f]/.test(value);
}

export function validateCreateAdminAccountRequest(value: unknown): CreateAdminAccountRequest {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw Object.assign(new Error('管理员账号信息格式错误'), { status: 400 });
    }
    const body = value as Record<string, unknown>;
    const username = typeof body.username === 'string' ? body.username.trim() : '';
    const producername = typeof body.producername === 'string' ? body.producername.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    if (
        !username || username.length > 128 || !printable(username) ||
        !producername || producername.length > 80 || !printable(producername) ||
        password.length < 12 || new TextEncoder().encode(password).byteLength > 1024
    ) {
        throw Object.assign(
            new Error('用户名、制作人名称或密码不符合要求'),
            { status: 400 }
        );
    }
    return { username, producername, password };
}
