import {
    hasExactKeys,
    isRecord,
    normalizePlatformEmail,
    normalizedRegistrationPassword
} from '@/domains/identity/platform-auth/contracts/credentials';

export interface PlatformPasswordResetRequest {
    normalizedEmail: string;
}

export interface PlatformPasswordResetSubmission {
    normalizedEmail: string;
    code: string;
    password: string;
}

export function parsePlatformPasswordResetRequest(
    value: unknown
): PlatformPasswordResetRequest | null {
    if (!isRecord(value) || !hasExactKeys(value, ['email'])) return null;
    const normalizedEmail = normalizePlatformEmail(value.email);
    return normalizedEmail ? { normalizedEmail } : null;
}

export function parsePlatformPasswordResetSubmission(
    value: unknown
): PlatformPasswordResetSubmission | null {
    if (
        !isRecord(value) ||
        !hasExactKeys(value, ['code', 'email', 'password'])
    ) return null;
    const normalizedEmail = normalizePlatformEmail(value.email);
    const password = normalizedRegistrationPassword(value.password);
    if (
        !normalizedEmail || !password ||
        typeof value.code !== 'string' || !/^\d{6}$/.test(value.code)
    ) return null;
    return { normalizedEmail, code: value.code, password };
}
