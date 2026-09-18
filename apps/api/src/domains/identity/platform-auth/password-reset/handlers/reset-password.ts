import type {
    PasswordResetIssueResponse,
    PlatformAuthError,
    PlatformRetryableAuthError
} from '@imsweb/contracts/platform';
import type { AppEnvironment } from '@/app';
import type { ValidatedRequestContext } from '@/middleware/request-validation';
import { issuePlatformPasswordReset } from '@/domains/identity/platform-auth/password-reset/issue-password-reset';
import {
    clearPlatformPasswordResetCooldown
} from '@/domains/identity/platform-auth/password-reset/password-reset-cache';
import { hashPlatformPasswordResetCode } from '@/domains/identity/platform-auth/password-reset/password-reset';
import { platformAccountRepository, services } from '@/middleware/hono-context';
import { platformSecurityEvent } from '@/domains/identity/platform-auth/contracts/session';

export async function handlePlatformPasswordResetVerification(
    c: ValidatedRequestContext<AppEnvironment, 'json', { email: string }>
): Promise<Response> {
    const result = await issuePlatformPasswordReset(c, c.req.valid('json').email);
    if (result.status === 'queued') {
        return c.json(
            {
                success: true,
                queued: true,
                retryAfterSeconds: result.retryAfterSeconds
            } satisfies PasswordResetIssueResponse,
            202
        );
    }
    if (result.status === 'cooldown') {
        c.header('Retry-After', String(result.retryAfterSeconds));
        return c.json(
            {
                success: false,
                code: 'PLATFORM_PASSWORD_RESET_COOLDOWN',
                retryAfterSeconds: result.retryAfterSeconds
            } satisfies PlatformRetryableAuthError,
            429
        );
    }
    return c.json(
        { success: false, code: 'PLATFORM_PASSWORD_RESET_UNAVAILABLE' } satisfies PlatformAuthError,
        503
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
    if (!passwords?.hash) {
        return c.json(
            { success: false, code: 'PLATFORM_PASSWORD_RESET_UNAVAILABLE' } satisfies PlatformAuthError,
            503
        );
    }
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
