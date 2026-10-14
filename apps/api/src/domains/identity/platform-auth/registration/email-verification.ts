import crypto from 'node:crypto';
import { PLATFORM_JWT_SECRET } from '@/config/env';

export function createPlatformEmailVerificationCode(): string {
    return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
}

export function hashPlatformEmailVerificationCode(
    normalizedEmail: string,
    code: string
): string {
    return crypto.createHmac('sha256', PLATFORM_JWT_SECRET)
        .update('platform-email-registration\0', 'utf8')
        .update(normalizedEmail, 'utf8')
        .update('\0', 'utf8')
        .update(code, 'utf8')
        .digest('hex');
}
