import { createHash } from 'node:crypto';
import type {
    PlatformAuthError,
    PlatformOAuthExchangeRequest,
    PlatformSession
} from '@imsweb/contracts/platform';
import type { AppEnvironment } from '@/app';
import {
    establishPlatformSession,
    platformSessionPayload,
    wantsPlatformBearerTokens
} from '@/domains/identity/platform-auth/contracts/session';
import { platformAccountRepository } from '@/middleware/hono-context';
import type { ValidatedRequestContext } from '@/middleware/request-validation';
import { constantTimeEqual } from '@/utils/crypto/constant-time';
import { sha256Hex } from '@/utils/crypto/sha256';

/**
 * OAuth app exchange endpoint.
 *
 * Wave 1 owner: `09-18-oauth-login-mobile-adaptation`. The callback for an
 * `app` client target mints a single-use code and hands it to the app through a
 * custom-scheme deep link (see `oauth-app-branch.ts`). This endpoint is the
 * other half: the app proves possession of the ephemeral PKCE verifier that
 * never left its process and receives a bearer session in return.
 *
 * The code row is consumed before the challenge is compared. Validation and
 * invalidation happen in one `DELETE ... RETURNING`, so two concurrent
 * exchanges cannot both redeem the same code, and a wrong verifier cannot be
 * brute-forced against a still-valid row.
 */

/**
 * The exchange body is attacker-reachable, so a rejected body never echoes
 * validation detail back; the app only needs to know redemption failed.
 *
 * Lives here rather than in the route module because the architecture check
 * forbids any arrow function inside a route module.
 */
export const oauthExchangeInputInvalid = (): Record<string, string | boolean> => ({
    success: false,
    code: 'PLATFORM_OAUTH_EXCHANGE_INVALID'
});

const PLATFORM_OAUTH_APP_SESSION_STATUSES = ['active', 'restricted'];

/**
 * The same derivation the app performs before `/start`:
 * `base64url(sha256(codeVerifier))`. Kept here rather than shared with the
 * provider PKCE helper because this one binds the app, not the provider.
 */
function appCodeChallenge(codeVerifier: string): string {
    return createHash('sha256').update(codeVerifier).digest('base64url');
}

export async function handlePlatformOAuthExchange(
    c: ValidatedRequestContext<
        AppEnvironment,
        'json',
        PlatformOAuthExchangeRequest
    >
): Promise<Response> {
    if (!wantsPlatformBearerTokens(c)) {
        return c.json(
            {
                success: false,
                code: 'PLATFORM_OAUTH_EXCHANGE_BEARER_REQUIRED'
            } satisfies PlatformAuthError,
            400
        );
    }
    const input = c.req.valid('json');
    const consumed = await platformAccountRepository(c).consumeOAuthExchangeCode(
        await sha256Hex(new TextEncoder().encode(input.code)),
        Date.now()
    );
    if (!consumed) {
        return c.json(
            {
                success: false,
                code: 'PLATFORM_OAUTH_EXCHANGE_EXPIRED'
            } satisfies PlatformAuthError,
            401
        );
    }
    if (
        !constantTimeEqual(
            appCodeChallenge(input.codeVerifier),
            consumed.code_challenge
        )
    ) {
        return c.json(
            {
                success: false,
                code: 'PLATFORM_OAUTH_EXCHANGE_INVALID'
            } satisfies PlatformAuthError,
            401
        );
    }
    const identity = await platformAccountRepository(
        c
    ).findAccountWithProfileById(consumed.account_id);
    if (
        !identity ||
        !PLATFORM_OAUTH_APP_SESSION_STATUSES.includes(identity.account.status)
    ) {
        return c.json(
            {
                success: false,
                code: 'PLATFORM_ACCOUNT_UNAVAILABLE'
            } satisfies PlatformAuthError,
            403
        );
    }
    const tokens = await establishPlatformSession(c, identity);
    if (!tokens) {
        return c.json(
            {
                success: false,
                code: 'PLATFORM_ACCOUNT_UNAVAILABLE'
            } satisfies PlatformAuthError,
            403
        );
    }
    c.header('Cache-Control', 'no-store');
    return c.json(
        await platformSessionPayload(c, identity, tokens) satisfies PlatformSession
    );
}
