import crypto from 'node:crypto';
import { PLATFORM_JWT_SECRET } from '@/config/env';

/**
 * Verification-code material for the email binding capability.
 *
 * Binding and registration share `platform_email_verification_codes`, whose
 * primary key is the email. Without a purpose-specific domain the same
 * `(email, code)` pair would hash identically in both flows, so a code issued
 * for registration could be consumed by the binding endpoint and vice versa.
 * The `\0`-terminated prefix keeps the two code spaces disjoint on shared
 * storage, exactly like `platform-password-reset\0` does for recovery.
 */
const EMAIL_BINDING_HASH_DOMAIN = 'platform-email-binding\0';

export function createPlatformEmailBindingCode(): string {
    return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
}

export function hashPlatformEmailBindingCode(
    normalizedEmail: string,
    code: string
): string {
    return crypto.createHmac('sha256', PLATFORM_JWT_SECRET)
        .update(EMAIL_BINDING_HASH_DOMAIN, 'utf8')
        .update(normalizedEmail, 'utf8')
        .update('\0', 'utf8')
        .update(code, 'utf8')
        .digest('hex');
}
