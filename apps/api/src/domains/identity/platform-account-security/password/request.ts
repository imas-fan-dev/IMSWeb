import {
    normalizedLoginPassword,
    normalizedRegistrationPassword
} from '@/domains/identity/platform-auth/contracts/credentials';

export interface PlatformPasswordChangeSubmission {
    currentPassword: string;
    newPassword: string;
}

export type PlatformPasswordChangeParseResult =
    | { status: 'parsed'; submission: PlatformPasswordChangeSubmission }
    | { status: 'invalid' }
    | { status: 'unchanged' };

// The current password is only ever compared against a stored digest, so it is
// normalized with the login rule: a legacy credential may sit outside today's
// strength floor and its owner must still be able to replace it. The new
// password goes through the registration rule instead, which is where the
// 8-128 character and 72-byte bcrypt limits live.
export function parsePlatformPasswordChangeRequest(
    value: unknown
): PlatformPasswordChangeParseResult {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return { status: 'invalid' };
    }
    const body = value as Record<string, unknown>;
    const allowed = new Set(['currentPassword', 'newPassword']);
    if (
        Object.keys(body).length !== allowed.size ||
        Object.keys(body).some((key) => !allowed.has(key))
    ) {
        return { status: 'invalid' };
    }
    const currentPassword = normalizedLoginPassword(body.currentPassword);
    const newPassword = normalizedRegistrationPassword(body.newPassword);
    if (!currentPassword || !newPassword) return { status: 'invalid' };
    // Re-submitting the same secret would still bump token_version and drop
    // every other device, which is a surprising amount of damage for a no-op.
    if (currentPassword === newPassword) return { status: 'unchanged' };
    return { status: 'parsed', submission: { currentPassword, newPassword } };
}
