import type {
    PlatformAuthError,
    PlatformRegistrationVerificationResponse,
    PlatformRetryableAuthError
} from '@imsweb/contracts/platform';
import type { Context } from "hono";
import type { AppEnvironment } from "@/app";
import type { ValidatedRequestContext } from '@/middleware/request-validation';
import {
    clearPlatformEmailVerificationCooldown,
    markPlatformEmailVerificationCooldown,
    readPlatformEmailVerificationCooldown,
} from "@/domains/identity/platform-auth/registration/email-verification-cache";
import {
    PLATFORM_EMAIL_CODE_ATTEMPTS,
    PLATFORM_EMAIL_CODE_RESEND_MS,
    PLATFORM_EMAIL_CODE_TTL_MS,
    createPlatformEmailVerificationCode,
    createPlatformEmailVerificationDeliveryToken,
    hashPlatformEmailVerificationCode,
} from "@/domains/identity/platform-auth/registration/email-verification";
import { platformAccountRepository, services } from "@/middleware/hono-context";

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
    const sender = runtime.platformEmailSender;
    if (!sender?.available) return unavailable(c);

    const cachedCooldownMs = await readPlatformEmailVerificationCooldown(
        runtime.cache,
        input.email,
    );
    if (cachedCooldownMs !== null) {
        const retryAfterSeconds = Math.max(
            1,
            Math.ceil(cachedCooldownMs / 1000),
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

    const code = createPlatformEmailVerificationCode();
    const deliveryToken = createPlatformEmailVerificationDeliveryToken();
    const codeHash = hashPlatformEmailVerificationCode(input.email, code);
    const now = Date.now();
    const issued = await platformAccountRepository(c).issueEmailVerification({
        normalizedEmail: input.email,
        deliveryToken,
        codeHash,
        expiresAt: now + PLATFORM_EMAIL_CODE_TTL_MS,
        resendAfter: now + PLATFORM_EMAIL_CODE_RESEND_MS,
        attemptsRemaining: PLATFORM_EMAIL_CODE_ATTEMPTS,
        createdAt: now,
    });
    if (issued.status === "cooldown") {
        await markPlatformEmailVerificationCooldown(
            runtime.cache,
            input.email,
            issued.retryAfterMs,
        );
        const retryAfterSeconds = Math.max(
            1,
            Math.ceil(issued.retryAfterMs / 1000),
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
        await sender.sendRegistrationVerification({
            email: input.email,
            code,
            expiresInMinutes: PLATFORM_EMAIL_CODE_TTL_MS / 60_000,
        });
    } catch {
        await platformAccountRepository(c).revokeEmailVerification(
            input.email,
            deliveryToken,
        );
        await clearPlatformEmailVerificationCooldown(runtime.cache, input.email);
        return unavailable(c);
    }

    const delivered = await platformAccountRepository(
        c,
    ).completeEmailVerificationDelivery(input.email, deliveryToken);
    if (!delivered) return unavailable(c);
    await markPlatformEmailVerificationCooldown(
        runtime.cache,
        input.email,
        PLATFORM_EMAIL_CODE_RESEND_MS,
    );

    return c.json(
        {
            success: true,
            retryAfterSeconds: PLATFORM_EMAIL_CODE_RESEND_MS / 1000,
        } satisfies PlatformRegistrationVerificationResponse,
        202,
    );
}
