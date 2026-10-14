import {
    hasExactKeys,
    isRecord,
    normalizePlatformEmail,
    normalizedRegistrationPassword
} from '@/domains/identity/platform-auth/contracts/credentials';

export interface PlatformRegisterInput {
    normalizedEmail: string;
    password: string;
    displayName: string;
    code: string;
}

export interface PlatformEmailVerificationRequest {
    normalizedEmail: string;
}

export function parsePlatformRegisterInput(value: unknown): PlatformRegisterInput | null {
    if (
        !isRecord(value) ||
        !hasExactKeys(value, ['code', 'displayName', 'email', 'password'])
    ) {
        return null;
    }
    const normalizedEmail = normalizePlatformEmail(value.email);
    const password = normalizedRegistrationPassword(value.password);
    const displayName = typeof value.displayName === 'string'
        ? value.displayName.trim()
        : '';
    if (
        !normalizedEmail || !password ||
        typeof value.code !== 'string' || !/^\d{6}$/.test(value.code) ||
        Array.from(displayName).length < 1 || Array.from(displayName).length > 80
    ) {
        return null;
    }
    return {
        normalizedEmail,
        displayName,
        password,
        code: value.code
    };
}

export function parsePlatformEmailVerificationRequest(
    value: unknown
): PlatformEmailVerificationRequest | null {
    if (!isRecord(value) || !hasExactKeys(value, ['email'])) return null;
    const normalizedEmail = normalizePlatformEmail(value.email);
    return normalizedEmail ? { normalizedEmail } : null;
}
