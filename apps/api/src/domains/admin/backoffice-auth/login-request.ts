import type { LoginErrorResponse } from '@/domains/admin/backoffice-auth/response';
import {
    invalidRequest,
    requestRecord
} from '@/utils/validation/request-data';

export interface LoginRequest {
    username: string;
    password: string;
}

export function loginValidationError(
    message: string
): LoginErrorResponse & Record<string, string | boolean> {
    return { success: false, message } satisfies LoginErrorResponse;
}

export function validateLoginRequest(value: unknown): LoginRequest {
    const { username, password } = requestRecord(value, '用户名或密码格式错误');
    if (
        typeof username !== 'string' || typeof password !== 'string' ||
        username.length < 1 || username.length > 128 ||
        password.length < 1 || new TextEncoder().encode(password).byteLength > 1024
    ) {
        invalidRequest('用户名或密码格式错误');
    }
    return { username, password };
}
