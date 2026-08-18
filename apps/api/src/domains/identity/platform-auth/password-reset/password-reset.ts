import crypto from 'node:crypto';
import { PLATFORM_JWT_SECRET } from '@/config/env';

export const PLATFORM_PASSWORD_RESET_CODE_ATTEMPTS = 5;
export const PLATFORM_PASSWORD_RESET_CODE_TTL_MS = 15 * 60_000;
export const PLATFORM_PASSWORD_RESET_CODE_RESEND_MS = 60_000;

export function createPlatformPasswordResetCode(): string {
    return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
}

export function createPlatformPasswordResetDeliveryToken(): string {
    return crypto.randomBytes(32).toString('hex');
}

export function hashPlatformPasswordResetCode(
    normalizedEmail: string,
    code: string
): string {
    return crypto
        .createHmac('sha256', PLATFORM_JWT_SECRET)
        .update('platform-password-reset\0', 'utf8')
        .update(normalizedEmail, 'utf8')
        .update('\0', 'utf8')
        .update(code, 'utf8')
        .digest('hex');
}
