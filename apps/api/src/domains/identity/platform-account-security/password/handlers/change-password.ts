import type { PlatformPasswordChangeResponse } from '@imsweb/contracts/platform/account-security';
import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import { matchesCurrentPlatformPassword } from '@/domains/identity/platform-account-security/password/current-password';
import { parsePlatformPasswordChangeRequest } from '@/domains/identity/platform-account-security/password/request';
import { isPlatformJsonContentType } from '@/domains/identity/platform-auth/contracts/credentials';
import {
    PLATFORM_ACCESS_TOKEN_TTL_SECONDS,
    PLATFORM_REFRESH_TOKEN_TTL_MS,
    createPlatformRefreshToken,
    hashPlatformAuthSecret,
    platformSecurityEvent,
    setPlatformAuthenticationCookies,
    wantsPlatformBearerTokens
} from '@/domains/identity/platform-auth/contracts/session';
import { platformAccountRepository, services } from '@/middleware/hono-context';

const BCRYPT_PARAMETERS_JSON = JSON.stringify({
    cost: 12,
    normalization: 'fudaba-trim'
});

function invalidInput(c: Context<AppEnvironment>): Response {
    return c.json({ success: false, code: 'PLATFORM_PASSWORD_INPUT_INVALID' }, 400);
}

// 403, not 401: the session is valid and stays valid, only the re-authentication
// proof failed. The Web platform client treats every 401 as an expired access
// token and answers it with a refresh-and-retry wave, so a mistyped current
// password would spend the refresh token instead of showing a form error.
function invalidCurrentPassword(c: Context<AppEnvironment>): Response {
    return c.json({ success: false, code: 'PLATFORM_PASSWORD_CURRENT_INVALID' }, 403);
}

export async function handleChangePlatformPassword(
    c: Context<AppEnvironment>
): Promise<Response> {
    if (!isPlatformJsonContentType(c.req.header('content-type'))) {
        return c.json({ success: false, code: 'PLATFORM_AUTH_JSON_REQUIRED' }, 415);
    }
    const parsed = parsePlatformPasswordChangeRequest(
        await c.req.json<unknown>().catch(() => null)
    );
    if (parsed.status === 'unchanged') {
        return c.json({ success: false, code: 'PLATFORM_PASSWORD_UNCHANGED' }, 400);
    }
    if (parsed.status === 'invalid') return invalidInput(c);

    const claims = c.get('platformUser')!;
    const account = c.get('platformAccount')!.account;
    const repository = platformAccountRepository(c);
    const runtime = services(c);
    const passwords = runtime.passwords;
    const tokenService = runtime.platformTokens;
    if (!passwords?.hash || !tokenService) {
        throw new Error('Platform password services unavailable');
    }
    // An OAuth-only account has no credential row to replace; it has to bind an
    // email password first, which is not this capability.
    const credential = await repository.findEmailCredentialByAccountId(account.id);
    if (!credential) {
        return c.json({ success: false, code: 'PLATFORM_PASSWORD_UNAVAILABLE' }, 409);
    }
    if (!await matchesCurrentPlatformPassword(
        c,
        parsed.submission.currentPassword,
        credential
    )) {
        return invalidCurrentPassword(c);
    }

    // token_version is about to move, which kills every access token including
    // the caller's. Mint the replacement pair for the surviving session up front
    // so the same transaction that invalidates the old one installs the new one.
    const now = Date.now();
    const nextTokenVersion = account.token_version + 1;
    const refreshToken = createPlatformRefreshToken(nextTokenVersion);
    const [passwordHash, accessToken, keepSessionTokenHash] = await Promise.all([
        passwords.hash(parsed.submission.newPassword),
        tokenService.sign({
            id: account.id,
            tokenVersion: nextTokenVersion,
            sessionId: claims.sessionId,
            csrfSecret: claims.csrfSecret
        }, PLATFORM_ACCESS_TOKEN_TTL_SECONDS),
        hashPlatformAuthSecret(refreshToken)
    ]);
    const result = await repository.updatePasswordForAccount({
        accountId: account.id,
        expectedPasswordHash: credential.password_hash,
        expectedUpdatedAt: credential.updated_at,
        passwordHash,
        parametersJson: BCRYPT_PARAMETERS_JSON,
        keepSessionId: claims.sessionId,
        keepSessionTokenHash,
        keepSessionExpiresAt: now + PLATFORM_REFRESH_TOKEN_TTL_MS,
        updatedAt: Math.max(now, credential.updated_at + 1),
        event: platformSecurityEvent(
            c,
            account.id,
            'auth.password.changed',
            'password_changed'
        )
    });
    if (result.status === 'unavailable') {
        return c.json({ success: false, code: 'PLATFORM_PASSWORD_UNAVAILABLE' }, 409);
    }
    if (result.status === 'conflict') {
        return c.json({ success: false, code: 'PLATFORM_PASSWORD_CONFLICT' }, 409);
    }
    // The CSRF secret is unchanged, so its cookie and the stored hash still
    // agree; only the two token cookies carry new values.
    setPlatformAuthenticationCookies(c, {
        accessToken,
        refreshToken,
        csrfSecret: claims.csrfSecret
    });
    const payload: PlatformPasswordChangeResponse = {
        success: true,
        revokedSessionCount: result.revokedSessionCount,
        ...(wantsPlatformBearerTokens(c) ? { accessToken, refreshToken } : {})
    };
    return c.json(payload);
}
