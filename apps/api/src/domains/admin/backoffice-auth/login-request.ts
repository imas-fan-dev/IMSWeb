import type {
    // pi-lens-ignore: ts:2305
    AdminBackofficeFailureResponse,
    // pi-lens-ignore: ts:2305
    AdminLoginRequest
} from '@imsweb/contracts/admin';
import { invalidRequest } from '@/utils/validation/request-data';

export function loginValidationError(message: string): AdminBackofficeFailureResponse {
    return { success: false, message };
}

export function normalizeLoginRequest(value: AdminLoginRequest): AdminLoginRequest {
    const { username, password } = value;
    if (
        username.length < 1 || username.length > 128 ||
        password.length < 1 || new TextEncoder().encode(password).byteLength > 1024
    ) {
        invalidRequest('用户名或密码格式错误');
    }
    return { username, password };
}
