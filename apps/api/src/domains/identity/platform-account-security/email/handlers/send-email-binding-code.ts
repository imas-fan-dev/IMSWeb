import type {
    PlatformAuthError,
    PlatformRetryableAuthError
} from '@imsweb/contracts/platform';
import type {
    PlatformEmailVerificationCodeRequest,
    PlatformEmailVerificationCodeResponse
} from '@imsweb/contracts/platform/account-security';
import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import { createPlatformEmailDeliveryIdentityToken } from '@/domains/identity/platform-auth/contracts/email-delivery';
import {
    markPlatformEmailVerificationCooldown,
    readPlatformEmailVerificationCooldown
} from '@/domains/identity/platform-auth/registration/email-verification-cache';
import {
    createPlatformEmailBindingCode,
    hashPlatformEmailBindingCode
} from '@/domains/identity/platform-account-security/email/email-binding-code';
import { platformAccountRepository, services } from '@/middleware/hono-context';
import type { ValidatedRequestContext } from '@/middleware/request-validation';
import { withBoundedCacheOperation } from '@/utils/cache/bounded-operation';

function unavailable(c: Context<AppEnvironment>): Response {
    return c.json(
        { success: false, code: 'PLATFORM_EMAIL_VERIFICATION_UNAVAILABLE' } satisfies PlatformAuthError,
        503
    );
}

function cooldown(
    c: Context<AppEnvironment>,
    retryAfterSeconds: number
): Response {
    c.header('Retry-After', String(retryAfterSeconds));
    return c.json(
        {
            success: false,
            code: 'PLATFORM_EMAIL_VERIFICATION_COOLDOWN',
            retryAfterSeconds
        } satisfies PlatformRetryableAuthError,
        429
    );
}

/**
 * Issues a binding verification code for the signed-in account.
 *
 * The target address is pre-checked so the caller gets a distinct answer before
 * a mail is sent: `PLATFORM_EMAIL_UNCHANGED` when it is already theirs, and
 * `PLATFORM_EMAIL_CONFLICT` when another account owns it. The repository's
 * unique constraints still decide the write; this only avoids sending mail the
 * caller cannot use. The code hash uses the binding domain, so the row this
 * handler writes can never be consumed by the registration endpoint.
 */
export async function handleSendPlatformEmailBindingCode(
    c: ValidatedRequestContext<AppEnvironment, 'json', PlatformEmailVerificationCodeRequest>
): Promise<Response> {
    const input = c.req.valid('json');
    const claims = c.get('platformUser')!;
    const runtime = services(c);
    const queue = runtime.platformEmailDeliveryQueue;
    const payloadCipher = runtime.platformEmailJobPayloadCipher;
    const policyReader = runtime.platformEmailResendPolicy;
    if (!queue || !payloadCipher || !policyReader) return unavailable(c);

    const existing = await platformAccountRepository(c).findEmailIdentity(input.email);
    if (existing) {
        if (existing.account.id === claims.id) {
            return c.json({ success: false, code: 'PLATFORM_EMAIL_UNCHANGED' }, 400);
        }
        return c.json({ success: false, code: 'PLATFORM_EMAIL_CONFLICT' }, 409);
    }

    const cachedCooldownMs = await readPlatformEmailVerificationCooldown(
        runtime.cache,
        input.email
    );
    if (cachedCooldownMs !== null) {
        return cooldown(
            c,
            Math.min(600, Math.max(1, Math.ceil(cachedCooldownMs / 1000)))
        );
    }

    try {
        await policyReader.getPolicy();
        const code = createPlatformEmailBindingCode();
        const identity = {
            // The delivery pipeline only knows the `registration` purpose, and
            // changing that would mean migrations; the hash domain above is what
            // keeps the two uses from sharing a code space.
            jobId: createPlatformEmailDeliveryIdentityToken(),
            purpose: 'registration',
            deliveryToken: createPlatformEmailDeliveryIdentityToken(),
            payloadVersion: 1
        } as const;
        const prepared = payloadCipher.encrypt(identity, {
            purpose: 'registration',
            normalizedEmail: input.email,
            code,
            expiresInMinutes: 10
        });
        const now = Date.now();
        const issued = await queue.enqueueRegistration({
            ...prepared,
            codeHash: hashPlatformEmailBindingCode(input.email, code),
            createdAt: now
        });
        if (issued.status === 'cooldown') {
            await markPlatformEmailVerificationCooldown(runtime.cache, input.email, {
                enqueuedAt: issued.enqueuedAt,
                resendCooldownSeconds: issued.resendCooldownSeconds,
                retryAfterAt: issued.resendAfter
            });
            return cooldown(
                c,
                Math.min(600, Math.max(1, Math.ceil(issued.retryAfterMs / 1000)))
            );
        }

        await markPlatformEmailVerificationCooldown(runtime.cache, input.email, {
            enqueuedAt: now,
            resendCooldownSeconds: issued.retryAfterSeconds,
            retryAfterAt: issued.resendAfter
        });
        const resendPolicyCache = runtime.platformEmailResendPolicyCache;
        if (resendPolicyCache) {
            await withBoundedCacheOperation((signal) =>
                resendPolicyCache.writeIfNewer(
                    {
                        resendCooldownSeconds: issued.retryAfterSeconds,
                        updatedAt: issued.policyUpdatedAt
                    },
                    signal
                )
            ).catch(() => undefined);
        }
        const payload: PlatformEmailVerificationCodeResponse = {
            success: true,
            queued: true,
            retryAfterSeconds: issued.retryAfterSeconds
        };
        return c.json(payload, 202);
    } catch {
        return unavailable(c);
    }
}
