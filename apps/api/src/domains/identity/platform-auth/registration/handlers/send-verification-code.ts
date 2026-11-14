import type {
    PlatformAuthError,
    PlatformRegistrationVerificationResponse,
    PlatformRetryableAuthError
} from '@imsweb/contracts/platform';
import type { Context } from "hono";
import type { AppEnvironment } from "@/app";
import type { ValidatedRequestContext } from '@/middleware/request-validation';
import {
    markPlatformEmailVerificationCooldown,
    readPlatformEmailVerificationCooldown,
} from "@/domains/identity/platform-auth/registration/email-verification-cache";
import { createPlatformEmailDeliveryIdentityToken } from '@/domains/identity/platform-auth/contracts/email-delivery';
import {
    createPlatformEmailVerificationCode,
    hashPlatformEmailVerificationCode,
} from "@/domains/identity/platform-auth/registration/email-verification";
import { services } from "@/middleware/hono-context";
import { withBoundedCacheOperation } from '@/utils/cache/bounded-operation';

function unavailable(c: Context<AppEnvironment>): Response {
    return c.json(
        {
            success: false,
            code: "PLATFORM_EMAIL_VERIFICATION_UNAVAILABLE",
        } satisfies PlatformAuthError,
        503,
    );
}

export async function handlePlatformRegistrationVerification(
    c: ValidatedRequestContext<AppEnvironment, 'json', { email: string }>,
): Promise<Response> {
    const input = c.req.valid('json');
    const runtime = services(c);
    const queue = runtime.platformEmailDeliveryQueue;
    const payloadCipher = runtime.platformEmailJobPayloadCipher;
    const policyReader = runtime.platformEmailResendPolicy;
    if (!queue || !payloadCipher || !policyReader) return unavailable(c);

    const cachedCooldownMs = await readPlatformEmailVerificationCooldown(
        runtime.cache,
        input.email,
    );
    if (cachedCooldownMs !== null) {
        const retryAfterSeconds = Math.min(
            600,
            Math.max(1, Math.ceil(cachedCooldownMs / 1000)),
        );
        c.header("Retry-After", String(retryAfterSeconds));
        return c.json(
            {
                success: false,
                code: "PLATFORM_EMAIL_VERIFICATION_COOLDOWN",
                retryAfterSeconds,
            } satisfies PlatformRetryableAuthError,
            429,
        );
    }

    try {
        await policyReader.getPolicy();
        const code = createPlatformEmailVerificationCode();
        const identity = {
            jobId: createPlatformEmailDeliveryIdentityToken(),
            purpose: 'registration',
            deliveryToken: createPlatformEmailDeliveryIdentityToken(),
            payloadVersion: 1,
        } as const;
        const prepared = payloadCipher.encrypt(identity, {
            purpose: 'registration',
            normalizedEmail: input.email,
            code,
            expiresInMinutes: 10,
        });
        const now = Date.now();
        const issued = await queue.enqueueRegistration({
            ...prepared,
            codeHash: hashPlatformEmailVerificationCode(input.email, code),
            createdAt: now,
        });
        if (issued.status === "cooldown") {
            await markPlatformEmailVerificationCooldown(runtime.cache, input.email, {
                enqueuedAt: issued.enqueuedAt,
                resendCooldownSeconds: issued.resendCooldownSeconds,
                retryAfterAt: issued.resendAfter,
            });
            const retryAfterSeconds = Math.min(
                600,
                Math.max(1, Math.ceil(issued.retryAfterMs / 1000)),
            );
            c.header("Retry-After", String(retryAfterSeconds));
            return c.json(
                {
                    success: false,
                    code: "PLATFORM_EMAIL_VERIFICATION_COOLDOWN",
                    retryAfterSeconds,
                } satisfies PlatformRetryableAuthError,
                429,
            );
        }

        await markPlatformEmailVerificationCooldown(runtime.cache, input.email, {
            enqueuedAt: now,
            resendCooldownSeconds: issued.retryAfterSeconds,
            retryAfterAt: issued.resendAfter,
        });
        const resendPolicyCache = runtime.platformEmailResendPolicyCache;
        if (resendPolicyCache) {
            await withBoundedCacheOperation((signal) =>
                resendPolicyCache.writeIfNewer(
                    {
                        resendCooldownSeconds: issued.retryAfterSeconds,
                        updatedAt: issued.policyUpdatedAt,
                    },
                    signal,
                ),
            ).catch(() => undefined);
        }
        return c.json(
            {
                success: true,
                queued: true,
                retryAfterSeconds: issued.retryAfterSeconds,
            } satisfies PlatformRegistrationVerificationResponse,
            202,
        );
    } catch {
        return unavailable(c);
    }
}
