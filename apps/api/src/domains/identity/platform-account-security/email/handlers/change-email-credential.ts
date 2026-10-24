import type {
    PlatformEmailBindingResponse,
    PlatformEmailChangeRequest
} from '@imsweb/contracts/platform/account-security';
import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import { matchesCurrentPlatformPassword } from '@/domains/identity/platform-account-security/password/current-password';
import { platformSecurityEvent } from '@/domains/identity/platform-auth/contracts/session';
import { hashPlatformEmailBindingCode } from '@/domains/identity/platform-account-security/email/email-binding-code';
import { platformAccountRepository } from '@/middleware/hono-context';
import type { ValidatedRequestContext } from '@/middleware/request-validation';
import { randomHex } from '@/utils/crypto/random';

function invalidCurrentPassword(c: Context<AppEnvironment>): Response {
    // 403, matching the password-change endpoint. A 401 would make the platform
    // client spend its refresh token on a retry wave instead of surfacing the
    // form error.
    return c.json({ success: false, code: 'PLATFORM_PASSWORD_CURRENT_INVALID' }, 403);
}

/**
 * Moves an existing email credential to a new address without touching the
 * password.
 *
 * The stored `password_hash` is what lets the account keep signing in after the
 * move, so the repository only rewrites `normalized_email` and `updated_at`.
 * The current password is re-proved here, and the repository fences the update
 * on the exact credential fields this handler read (`password_hash` and
 * `updated_at`), so a concurrent password change or a second migration makes
 * this one lose instead of silently overwriting the other.
 */
export async function handleChangePlatformEmailCredential(
    c: ValidatedRequestContext<AppEnvironment, 'json', PlatformEmailChangeRequest>
): Promise<Response> {
    const input = c.req.valid('json');
    const claims = c.get('platformUser')!;
    const repository = platformAccountRepository(c);

    const credential = await repository.findEmailCredentialByAccountId(claims.id);
    if (!credential) {
        return c.json({ success: false, code: 'PLATFORM_EMAIL_NOT_BOUND' }, 409);
    }
    if (credential.normalized_email === input.email) {
        return c.json({ success: false, code: 'PLATFORM_EMAIL_UNCHANGED' }, 400);
    }
    const owner = await repository.findEmailIdentity(input.email);
    if (owner && owner.account.id !== claims.id) {
        return c.json({ success: false, code: 'PLATFORM_EMAIL_CONFLICT' }, 409);
    }
    if (!await matchesCurrentPlatformPassword(c, input.currentPassword, credential)) {
        return invalidCurrentPassword(c);
    }

    const now = Date.now();
    const result = await repository.migrateEmailCredentialForAccount({
        accountId: claims.id,
        currentNormalizedEmail: credential.normalized_email,
        newNormalizedEmail: input.email,
        expectedPasswordHash: credential.password_hash,
        expectedUpdatedAt: credential.updated_at,
        // `updated_at` must move; it is also half of the optimistic fence, so it
        // is forced forward past the value just read.
        updatedAt: Math.max(now, credential.updated_at + 1),
        verification: {
            codeHash: hashPlatformEmailBindingCode(input.email, input.code),
            consumedToken: randomHex(32),
            verifiedAt: now
        },
        event: platformSecurityEvent(c, claims.id, 'auth.email.changed', 'email_changed_by_owner')
    });
    if (result.status === 'migrated') {
        const payload: PlatformEmailBindingResponse = {
            success: true,
            email: result.credential.normalized_email
        };
        return c.json(payload);
    }
    if (result.status === 'email-conflict') {
        return c.json({ success: false, code: 'PLATFORM_EMAIL_CONFLICT' }, 409);
    }
    if (result.status === 'not-bound') {
        return c.json({ success: false, code: 'PLATFORM_EMAIL_NOT_BOUND' }, 409);
    }
    if (result.status === 'state-conflict') {
        return c.json({ success: false, code: 'PLATFORM_EMAIL_STATE_CONFLICT' }, 409);
    }
    return c.json({ success: false, code: 'PLATFORM_EMAIL_VERIFICATION_INVALID' }, 400);
}
