import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import { createPlatformEmailDeliveryIdentityToken } from '@/domains/identity/platform-auth/contracts/email-delivery';
import {
    markPlatformPasswordResetCooldown,
    platformPasswordResetRecipientKey,
    readPlatformPasswordResetCooldown
} from '@/domains/identity/platform-auth/password-reset/password-reset-cache';
import {
    createPlatformPasswordResetCode,
    hashPlatformPasswordResetCode
} from '@/domains/identity/platform-auth/password-reset/password-reset';
import { services } from '@/middleware/hono-context';
import { withBoundedCacheOperation } from '@/utils/cache/bounded-operation';

/**
 * The outcome of asking the platform to email a password-reset code.
 *
 * The function is deliberately transport-free: it neither writes a response
 * body nor a `Retry-After` header. The public reset endpoint and the admin
 * platform-user endpoint share the issuance rules but answer with different
 * contracts, so each wrapper owns its own status line.
 */
export type IssuePlatformPasswordResetResult =
    | { status: 'queued'; retryAfterSeconds: number }
    | { status: 'cooldown'; retryAfterSeconds: number }
    | { status: 'unavailable' };

// Both the cached cooldown and the queue's own cooldown report a millisecond
// remainder; the wire contract allows 1..600 seconds.
function retryAfterSecondsFromMs(milliseconds: number): number {
    return Math.min(600, Math.max(1, Math.ceil(milliseconds / 1000)));
}

/**
 * Generates a reset code, enqueues the delivery, and records the resend
 * cooldown. `normalizedEmail` must already be trimmed and lowercased, which is
 * what the request schemas produce.
 */
export async function issuePlatformPasswordReset(
    c: Context<AppEnvironment>,
    normalizedEmail: string
): Promise<IssuePlatformPasswordResetResult> {
    const runtime = services(c);
    const queue = runtime.platformEmailDeliveryQueue;
    const payloadCipher = runtime.platformEmailJobPayloadCipher;
    const policyReader = runtime.platformEmailResendPolicy;
    if (!queue || !payloadCipher || !policyReader) {
        return { status: 'unavailable' };
    }

    const cachedCooldownMs = await readPlatformPasswordResetCooldown(
        runtime.cache,
        normalizedEmail
    );
    if (cachedCooldownMs !== null) {
        return {
            status: 'cooldown',
            retryAfterSeconds: retryAfterSecondsFromMs(cachedCooldownMs)
        };
    }

    try {
        await policyReader.getPolicy();
        const code = createPlatformPasswordResetCode();
        const identity = {
            jobId: createPlatformEmailDeliveryIdentityToken(),
            purpose: 'password_reset',
            deliveryToken: createPlatformEmailDeliveryIdentityToken(),
            payloadVersion: 1
        } as const;
        const prepared = payloadCipher.encrypt(identity, {
            purpose: 'password_reset',
            normalizedEmail,
            code,
            expiresInMinutes: 15
        });
        const requestAcceptedAt = Date.now();
        const issued = await queue.enqueuePasswordReset({
            ...prepared,
            codeHash: hashPlatformPasswordResetCode(normalizedEmail, code),
            createdAt: requestAcceptedAt,
            recipientKey: platformPasswordResetRecipientKey(normalizedEmail)
        });
        if (issued.status === 'cooldown') {
            await markPlatformPasswordResetCooldown(runtime.cache, normalizedEmail, {
                enqueuedAt: issued.enqueuedAt,
                resendCooldownSeconds: issued.resendCooldownSeconds,
                retryAfterAt: issued.resendAfter
            });
            return {
                status: 'cooldown',
                retryAfterSeconds: retryAfterSecondsFromMs(issued.retryAfterMs)
            };
        }

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
        await markPlatformPasswordResetCooldown(runtime.cache, normalizedEmail, {
            enqueuedAt: issued.status === 'queued'
                ? requestAcceptedAt
                : issued.enqueuedAt,
            resendCooldownSeconds: issued.status === 'queued'
                ? issued.retryAfterSeconds
                : issued.resendCooldownSeconds,
            retryAfterAt: issued.resendAfter
        });
        return { status: 'queued', retryAfterSeconds: issued.retryAfterSeconds };
    } catch {
        return { status: 'unavailable' };
    }
}
