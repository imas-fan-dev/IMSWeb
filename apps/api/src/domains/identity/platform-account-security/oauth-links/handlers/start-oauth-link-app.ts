import type {
    PlatformOAuthLinkAppStartRequest,
    PlatformOAuthLinkAppStartResponse
} from '@imsweb/contracts/platform/account-security';
import type { PlatformAuthError } from '@imsweb/contracts/platform';
import type { AppEnvironment } from '@/app';
import { startOAuthLinkRoundTrip } from '@/domains/identity/platform-account-security/oauth-links/oauth-link-round-trip';
import type { ValidatedRequestContext } from '@/middleware/request-validation';

/**
 * The start body is attacker-reachable, so a rejected body reports only that
 * the input was invalid, never which field failed.
 *
 * Lives here rather than in the route module because the architecture check
 * forbids any arrow function inside a route module.
 */
export const oauthLinkAppInputInvalid = (): PlatformAuthError => ({
    success: false,
    code: 'PLATFORM_OAUTH_LINK_INPUT_INVALID'
});

/**
 * Starts an OAuth link round trip for the signed-in account from the packaged
 * app.
 *
 * A document navigation cannot carry the app's bearer session, so the app calls
 * this JSON endpoint with its ephemeral PKCE challenge, opens the returned URL
 * in the system browser, and waits for the
 * `imsweb://oauth/callback?code=...&flow=link` deep link. The state row records
 * `clientTarget: 'app'`, so the callback returns a one-time code instead of a
 * session cookie.
 */
export async function handleStartPlatformOAuthLinkApp(
    c: ValidatedRequestContext<AppEnvironment, 'param', { provider: string | undefined }> &
        ValidatedRequestContext<AppEnvironment, 'json', PlatformOAuthLinkAppStartRequest>
): Promise<Response> {
    const claims = c.get('platformUser')!;
    const result = await startOAuthLinkRoundTrip(c, {
        providerCode: c.req.valid('param').provider,
        linkingAccountId: claims.id,
        clientTarget: 'app',
        appCodeChallenge: c.req.valid('json').codeChallenge
    });
    if (result.status === 'unavailable') {
        return c.json(
            {
                success: false,
                code: 'PLATFORM_OAUTH_LINK_UNAVAILABLE'
            } satisfies PlatformAuthError,
            404
        );
    }
    c.header('Cache-Control', 'no-store');
    return c.json(
        {
            success: true,
            authorizationUrl: result.authorizationUrl.toString()
        } satisfies PlatformOAuthLinkAppStartResponse
    );
}
