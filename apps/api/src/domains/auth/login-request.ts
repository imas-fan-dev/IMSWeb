export interface LoginRequest {
    username: string;
    password: string;
}

export function loginValidationError(
    message: string
): Record<string, string | boolean> {
    return { success: false, message };
}

export function validateLoginRequest(value: unknown): LoginRequest {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw Object.assign(new Error('用户名或密码格式错误'), { status: 400 });
    }
    const { username, password } = value as Record<string, unknown>;
    if (
        typeof username !== 'string' || typeof password !== 'string' ||
        username.length < 1 || username.length > 128 ||
        password.length < 1 || new TextEncoder().encode(password).byteLength > 1024
    ) {
        throw Object.assign(new Error('用户名或密码格式错误'), { status: 400 });
    }
    return { username, password };
}
