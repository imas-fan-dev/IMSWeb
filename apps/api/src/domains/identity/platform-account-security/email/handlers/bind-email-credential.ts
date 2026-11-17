import type {
    PlatformEmailBindRequest,
    PlatformEmailBindingResponse
} from '@imsweb/contracts/platform/account-security';
import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import { platformSecurityEvent } from '@/domains/identity/platform-auth/contracts/session';
import { hashPlatformEmailBindingCode } from '@/domains/identity/platform-account-security/email/email-binding-code';
import { platformAccountRepository, services } from '@/middleware/hono-context';
import type { ValidatedRequestContext } from '@/middleware/request-validation';
import { randomHex } from '@/utils/crypto/random';

// Same bcrypt shape the other three credential writers use, so an account's
// stored parameters never depend on which endpoint created the credential.
const BCRYPT_PARAMETERS_JSON = JSON.stringify({
    cost: 12,
    normalization: 'fudaba-trim'
});

/**
 * Provisions the account's first email credential.
 *
 * The code is not verified here. It is hashed with the binding domain and
 * handed to the repository, which consumes it and writes the credential inside
 * one transaction fenced on `consumed_token`: a code that fails validation
 * leaves no credential behind, and a consumed code whose insert lost the race
 * stays consumed and can never be replayed.
 */
export async function handleBindPlatformEmailCredential(
    c: ValidatedRequestContext<AppEnvironment, 'json', PlatformEmailBindRequest>
): Promise<Response> {
    const input = c.req.valid('json');
    const claims = c.get('platformUser')!;
    const repository = platformAccountRepository(c);
    const passwords = services(c).passwords;
    if (!passwords?.hash) {
        throw new Error('Platform password services unavailable');
    }

    const current = await repository.findEmailCredentialByAccountId(claims.id);
    if (current) {
        return c.json({ success: false, code: 'PLATFORM_EMAIL_ALREADY_BOUND' }, 409);
    }
    const owner = await repository.findEmailIdentity(input.email);
    if (owner && owner.account.id !== claims.id) {
        return c.json({ success: false, code: 'PLATFORM_EMAIL_CONFLICT' }, 409);
    }

    const now = Date.now();
    const passwordHash = await passwords.hash(input.newPassword);
    const result = await repository.createVerifiedEmailCredentialForAccount({
        accountId: claims.id,
        credential: {
            normalizedEmail: input.email,
            algorithm: 'bcrypt',
            parametersJson: BCRYPT_PARAMETERS_JSON,
            passwordHash,
            createdAt: now,
            updatedAt: now
        },
        verification: {
            codeHash: hashPlatformEmailBindingCode(input.email, input.code),
            // The caller-generated token is the transaction's cursor: every
            // later statement in the repository batch is fenced on this exact
            // value, and the code row is deleted only after the credential
            // exists.
            consumedToken: randomHex(32),
            verifiedAt: now
        },
        event: platformSecurityEvent(c, claims.id, 'auth.email.bound', 'email_bound_by_owner')
    });
    if (result.status === 'created') {
        const payload: PlatformEmailBindingResponse = {
            success: true,
            email: result.credential.normalized_email
        };
        return c.json(payload);
    }
    if (result.status === 'already-bound') {
        return c.json({ success: false, code: 'PLATFORM_EMAIL_ALREADY_BOUND' }, 409);
    }
    if (result.status === 'email-conflict') {
        return c.json({ success: false, code: 'PLATFORM_EMAIL_CONFLICT' }, 409);
    }
    return c.json({ success: false, code: 'PLATFORM_EMAIL_VERIFICATION_INVALID' }, 400);
}
