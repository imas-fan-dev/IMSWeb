import {
    hasExactKeys,
    isRecord,
    normalizeMigratedPlatformEmail,
    normalizedLoginPassword
} from '@/domains/identity/platform-auth/contracts/credentials';

export interface PlatformLoginInput {
    normalizedEmail: string;
    password: string;
}

export function parsePlatformLoginInput(value: unknown): PlatformLoginInput | null {
    if (!isRecord(value) || !hasExactKeys(value, ['email', 'password'])) return null;
    const normalizedEmail = normalizeMigratedPlatformEmail(value.email);
    const password = normalizedLoginPassword(value.password);
    if (!normalizedEmail || !password) return null;
    return { normalizedEmail, password };
}
