import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import { isPlatformJsonContentType } from '@/domains/identity/platform-auth/contracts/credentials';
import { parsePlatformPasswordResetRequest, parsePlatformPasswordResetSubmission } from '@/domains/identity/platform-auth/password-reset/request';
import {
    clearPlatformPasswordResetCooldown,
    markPlatformPasswordResetCooldown,
    readPlatformPasswordResetCooldown
} from '@/domains/identity/platform-auth/password-reset/password-reset-cache';
import {
    createPlatformPasswordResetCode,
    createPlatformPasswordResetDeliveryToken,
    hashPlatformPasswordResetCode,
    PLATFORM_PASSWORD_RESET_CODE_ATTEMPTS,
    PLATFORM_PASSWORD_RESET_CODE_RESEND_MS,
    PLATFORM_PASSWORD_RESET_CODE_TTL_MS
} from '@/domains/identity/platform-auth/password-reset/password-reset';
import {
    platformAccountRepository,
    services
} from '@/middleware/hono-context';
import { platformSecurityEvent } from '@/domains/identity/platform-auth/contracts/session';

function unavailable(c: Context<AppEnvironment>): Response {
    return c.json(
        { success: false, code: 'PLATFORM_PASSWORD_RESET_UNAVAILABLE' },
        503
    );
}

export async function handlePlatformPasswordResetVerification(
    c: Context<AppEnvironment>
): Promise<Response> {
    if (!isPlatformJsonContentType(c.req.header('content-type'))) {
        return c.json({ success: false, code: 'PLATFORM_AUTH_JSON_REQUIRED' }, 415);
    }
    const input = parsePlatformPasswordResetRequest(
        await c.req.json<unknown>().catch(() => null)
    );
    if (!input) {
        return c.json({ success: false, code: 'PLATFORM_AUTH_INPUT_INVALID' }, 400);
    }
    const runtime = services(c);
    const sender = runtime.platformEmailSender;
    if (!sender?.available || !sender.sendPasswordResetVerification) {
        return unavailable(c);
    }
    const cachedCooldownMs = await readPlatformPasswordResetCooldown(
        runtime.cache,
        input.normalizedEmail
    );
    if (cachedCooldownMs !== null) {
        const retryAfterSeconds = Math.max(1, Math.ceil(cachedCooldownMs / 1000));
        c.header('Retry-After', String(retryAfterSeconds));
        return c.json(
            {
                success: false,
                code: 'PLATFORM_PASSWORD_RESET_COOLDOWN',
                retryAfterSeconds
            },
            429
        );
    }

    const now = Date.now();
    const code = createPlatformPasswordResetCode();
    const deliveryToken = createPlatformPasswordResetDeliveryToken();
    const issued = await platformAccountRepository(c).issuePasswordReset({
        normalizedEmail: input.normalizedEmail,
        deliveryToken,
        codeHash: hashPlatformPasswordResetCode(input.normalizedEmail, code),
        expiresAt: now + PLATFORM_PASSWORD_RESET_CODE_TTL_MS,
        resendAfter: now + PLATFORM_PASSWORD_RESET_CODE_RESEND_MS,
        attemptsRemaining: PLATFORM_PASSWORD_RESET_CODE_ATTEMPTS,
        createdAt: now
    });
    if (issued.status === 'cooldown') {
        await markPlatformPasswordResetCooldown(
            runtime.cache,
            input.normalizedEmail,
            issued.retryAfterMs
        );
        const retryAfterSeconds = Math.max(1, Math.ceil(issued.retryAfterMs / 1000));
        c.header('Retry-After', String(retryAfterSeconds));
        return c.json(
            {
                success: false,
                code: 'PLATFORM_PASSWORD_RESET_COOLDOWN',
                retryAfterSeconds
            },
            429
        );
    }
    if (issued.status === 'email-not-found') {
        return c.json({ success: true, sent: true }, 202);
    }

    try {
        await sender.sendPasswordResetVerification({
            email: input.normalizedEmail,
            code,
            expiresInMinutes: PLATFORM_PASSWORD_RESET_CODE_TTL_MS / 60_000
        });
    } catch {
        await platformAccountRepository(c).revokePasswordReset(
            input.normalizedEmail,
            deliveryToken
        );
        await clearPlatformPasswordResetCooldown(
            runtime.cache,
            input.normalizedEmail
        );
        return unavailable(c);
    }
    const delivered = await platformAccountRepository(c).completePasswordResetDelivery(
        input.normalizedEmail,
        deliveryToken
    );
    if (!delivered) return unavailable(c);
    await markPlatformPasswordResetCooldown(
        runtime.cache,
        input.normalizedEmail,
        PLATFORM_PASSWORD_RESET_CODE_RESEND_MS
    );
    return c.json({ success: true, sent: true, retryAfterSeconds: 60 }, 202);
}

export async function handlePlatformPasswordReset(
    c: Context<AppEnvironment>
): Promise<Response> {
    if (!isPlatformJsonContentType(c.req.header('content-type'))) {
        return c.json({ success: false, code: 'PLATFORM_AUTH_JSON_REQUIRED' }, 415);
    }
    const input = parsePlatformPasswordResetSubmission(
        await c.req.json<unknown>().catch(() => null)
    );
    if (!input) {
        return c.json({ success: false, code: 'PLATFORM_AUTH_INPUT_INVALID' }, 400);
    }
    const passwords = services(c).passwords;
    if (!passwords?.hash) return unavailable(c);
    const passwordHash = await passwords.hash(input.password);
    const result = await platformAccountRepository(c).completePasswordReset({
        normalizedEmail: input.normalizedEmail,
        codeHash: hashPlatformPasswordResetCode(input.normalizedEmail, input.code),
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
        return c.json({ success: false, code: 'PLATFORM_PASSWORD_RESET_INVALID' }, 400);
    }
    await clearPlatformPasswordResetCooldown(services(c).cache, input.normalizedEmail);
    return c.json({ success: true });
}
