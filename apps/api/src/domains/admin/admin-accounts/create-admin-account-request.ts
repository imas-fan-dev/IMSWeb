import type {
    AdminAccountErrorResponse,
    AdminCreateAccountRequest
} from '@imsweb/contracts/admin';

export function createAdminAccountValidationError(
    message: string
): AdminAccountErrorResponse {
    return { success: false, message };
}

export interface CreateAdminAccountInput {
    username: string;
    producername: string;
    password: string;
}

function printable(value: string): boolean {
    return !/[\0-\x1f\x7f]/.test(value);
}

export function normalizeCreateAdminAccountRequest(
    value: AdminCreateAccountRequest
): CreateAdminAccountInput {
    const username = typeof value.username === 'string' ? value.username.trim() : '';
    const producername = typeof value.producername === 'string' ? value.producername.trim() : '';
    const password = typeof value.password === 'string' ? value.password : '';
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
