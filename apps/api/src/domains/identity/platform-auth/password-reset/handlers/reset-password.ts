import type {
    PasswordResetIssueResponse,
    PlatformAuthError,
    PlatformRetryableAuthError
} from '@imsweb/contracts/platform';
import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import type { ValidatedRequestContext } from '@/middleware/request-validation';
import {
    clearPlatformPasswordResetCooldown,
    markPlatformPasswordResetCooldown,
    platformPasswordResetRecipientKey,
    readPlatformPasswordResetCooldown
} from '@/domains/identity/platform-auth/password-reset/password-reset-cache';
import { createPlatformEmailDeliveryIdentityToken } from '@/domains/identity/platform-auth/contracts/email-delivery';
import {
    createPlatformPasswordResetCode,
    hashPlatformPasswordResetCode
} from '@/domains/identity/platform-auth/password-reset/password-reset';
import {
    platformAccountRepository,
    services
} from '@/middleware/hono-context';
import { platformSecurityEvent } from '@/domains/identity/platform-auth/contracts/session';
import { withBoundedCacheOperation } from '@/utils/cache/bounded-operation';

function unavailable(c: Context<AppEnvironment>): Response {
    return c.json(
        { success: false, code: 'PLATFORM_PASSWORD_RESET_UNAVAILABLE' } satisfies PlatformAuthError,
        503
    );
}

export async function handlePlatformPasswordResetVerification(
    c: ValidatedRequestContext<AppEnvironment, 'json', { email: string }>
): Promise<Response> {
    const input = c.req.valid('json');
    const runtime = services(c);
    const queue = runtime.platformEmailDeliveryQueue;
    const payloadCipher = runtime.platformEmailJobPayloadCipher;
    const policyReader = runtime.platformEmailResendPolicy;
    if (!queue || !payloadCipher || !policyReader) return unavailable(c);

    const cachedCooldownMs = await readPlatformPasswordResetCooldown(
        runtime.cache,
        input.email
    );
    if (cachedCooldownMs !== null) {
        const retryAfterSeconds = Math.min(
            600,
            Math.max(1, Math.ceil(cachedCooldownMs / 1000))
        );
        c.header('Retry-After', String(retryAfterSeconds));
        return c.json(
            {
                success: false,
                code: 'PLATFORM_PASSWORD_RESET_COOLDOWN',
                retryAfterSeconds
            } satisfies PlatformRetryableAuthError,
            429
        );
    }

    try {
        await policyReader.getPolicy();
        const code = createPlatformPasswordResetCode();
        const identity = {
            jobId: createPlatformEmailDeliveryIdentityToken(),
            purpose: 'password_reset',
            deliveryToken: createPlatformEmailDeliveryIdentityToken(),
            payloadVersion: 1,
        } as const;
        const prepared = payloadCipher.encrypt(identity, {
            purpose: 'password_reset',
            normalizedEmail: input.email,
            code,
            expiresInMinutes: 15,
        });
        const requestAcceptedAt = Date.now();
        const issued = await queue.enqueuePasswordReset({
            ...prepared,
            codeHash: hashPlatformPasswordResetCode(input.email, code),
            createdAt: requestAcceptedAt,
            recipientKey: platformPasswordResetRecipientKey(input.email),
        });
        if (issued.status === 'cooldown') {
            await markPlatformPasswordResetCooldown(runtime.cache, input.email, {
                enqueuedAt: issued.enqueuedAt,
                resendCooldownSeconds: issued.resendCooldownSeconds,
                retryAfterAt: issued.resendAfter,
            });
            const retryAfterSeconds = Math.min(
                600,
                Math.max(1, Math.ceil(issued.retryAfterMs / 1000))
            );
            c.header('Retry-After', String(retryAfterSeconds));
            return c.json(
                {
                    success: false,
                    code: 'PLATFORM_PASSWORD_RESET_COOLDOWN',
                    retryAfterSeconds
                } satisfies PlatformRetryableAuthError,
                429
            );
        }

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
        await markPlatformPasswordResetCooldown(runtime.cache, input.email, {
            enqueuedAt: issued.status === 'queued'
                ? requestAcceptedAt
                : issued.enqueuedAt,
            resendCooldownSeconds: issued.status === 'queued'
                ? issued.retryAfterSeconds
                : issued.resendCooldownSeconds,
            retryAfterAt: issued.resendAfter,
        });
        return c.json(
            {
                success: true,
                queued: true,
                retryAfterSeconds: issued.retryAfterSeconds,
            } satisfies PasswordResetIssueResponse,
            202
        );
    } catch {
        return unavailable(c);
    }
}

export async function handlePlatformPasswordReset(
    c: ValidatedRequestContext<AppEnvironment, 'json', {
        code: string;
        email: string;
        password: string;
    }>
): Promise<Response> {
    const input = c.req.valid('json');
    const passwords = services(c).passwords;
    if (!passwords?.hash) return unavailable(c);
    const passwordHash = await passwords.hash(input.password);
    const result = await platformAccountRepository(c).completePasswordReset({
        normalizedEmail: input.email,
        codeHash: hashPlatformPasswordResetCode(input.email, input.code),
        passwordHash,
        parametersJson: JSON.stringify({ cost: 12, normalization: 'fudaba-trim' }),
        updatedAt: Date.now(),
        event: platformSecurityEvent(
            c,
            '',
            'auth.password_reset.completed',
            'password_reset'
        )
    });
    if (result.status !== 'completed') {
        return c.json(
            { success: false, code: 'PLATFORM_PASSWORD_RESET_INVALID' } satisfies PlatformAuthError,
            400
        );
    }
    await clearPlatformPasswordResetCooldown(services(c).cache, input.email);
    return c.json({ success: true });
}
