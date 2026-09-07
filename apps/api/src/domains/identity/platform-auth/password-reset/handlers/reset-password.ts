import type {
    PasswordResetIssueResponse,
    PlatformAuthError
} from '@imsweb/contracts/platform';
import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import type { ValidatedRequestContext } from '@/middleware/request-validation';
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
        { success: false, code: 'PLATFORM_PASSWORD_RESET_UNAVAILABLE' } satisfies PlatformAuthError,
        503
    );
}

export async function handlePlatformPasswordResetVerification(
    c: ValidatedRequestContext<AppEnvironment, 'json', { email: string }>
): Promise<Response> {
    const input = c.req.valid('json');
    const runtime = services(c);
    const sender = runtime.platformEmailSender;
    if (!sender?.available || !sender.sendPasswordResetVerification) {
        return unavailable(c);
    }
    const cachedCooldownMs = await readPlatformPasswordResetCooldown(
        runtime.cache,
        input.email
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
        normalizedEmail: input.email,
        deliveryToken,
        codeHash: hashPlatformPasswordResetCode(input.email, code),
        expiresAt: now + PLATFORM_PASSWORD_RESET_CODE_TTL_MS,
        resendAfter: now + PLATFORM_PASSWORD_RESET_CODE_RESEND_MS,
        attemptsRemaining: PLATFORM_PASSWORD_RESET_CODE_ATTEMPTS,
        createdAt: now
    });
    if (issued.status === 'cooldown') {
        await markPlatformPasswordResetCooldown(runtime.cache, input.email, issued.retryAfterMs);
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
        return c.json({ success: true, sent: true } satisfies PasswordResetIssueResponse, 202);
    }

    try {
        await sender.sendPasswordResetVerification({
            email: input.email,
            code,
            expiresInMinutes: PLATFORM_PASSWORD_RESET_CODE_TTL_MS / 60_000
        });
    } catch {
        await platformAccountRepository(c).revokePasswordReset(input.email, deliveryToken);
        await clearPlatformPasswordResetCooldown(runtime.cache, input.email);
        return unavailable(c);
    }
    const delivered = await platformAccountRepository(c).completePasswordResetDelivery(
        input.email,
        deliveryToken
    );
    if (!delivered) return unavailable(c);
    await markPlatformPasswordResetCooldown(
        runtime.cache,
        input.email,
        PLATFORM_PASSWORD_RESET_CODE_RESEND_MS
    );
    return c.json(
        { success: true, sent: true, retryAfterSeconds: 60 } satisfies PasswordResetIssueResponse,
        202
    );
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
