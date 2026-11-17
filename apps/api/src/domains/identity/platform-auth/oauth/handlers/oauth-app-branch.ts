import { APP_OAUTH_CALLBACK_URL } from '@imsweb/contracts/paths';
import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import { mintPlatformOAuthExchangeCode } from '@/domains/identity/platform-auth/oauth/oauth-exchange-code';
import type {
    PlatformAccountWithProfile,
    PlatformOAuthStateRecord
} from '@/ports/repositories';

/**
 * OAuth app-return callback branch.
 *
 * Wave 1 owner: `09-18-oauth-login-mobile-adaptation`. The callback reaches
 * this module only for a login state whose `client_target` is `app`. Instead of
 * setting a cookie the WebView cannot inherit, it mints a single-use code and
 * hands it to the app through the custom-scheme deep link; the app then
 * redeems it for a bearer session. The code/challenge primitives are frozen in
 * `@/ports/repositories/platform`; the exchange endpoint and the Tauri
 * deep-link handling complete the flow.
 */

const PLATFORM_OAUTH_APP_SESSION_STATUSES = ['active', 'restricted'];

export interface PlatformOAuthAppCallbackInput {
    state: PlatformOAuthStateRecord;
    identity: PlatformAccountWithProfile;
}

export function redirectToPlatformOAuthApp(
    c: Context<AppEnvironment>,
    value: string,
    key: 'code' | 'error' = 'code',
): Response {
    const query = new URLSearchParams({ [key]: value }).toString();
    c.header('Cache-Control', 'no-store');
    return c.redirect(`${APP_OAUTH_CALLBACK_URL}?${query}`, 303);
}

export async function handlePlatformOAuthAppCallback(
    c: Context<AppEnvironment>,
    input: PlatformOAuthAppCallbackInput,
): Promise<Response> {
    const challenge = input.state.app_code_challenge;
    if (!challenge) return redirectToPlatformOAuthApp(c, 'failed', 'error');
    if (
        !PLATFORM_OAUTH_APP_SESSION_STATUSES.includes(
            input.identity.account.status,
        )
    ) {
        return redirectToPlatformOAuthApp(c, 'unavailable', 'error');
    }
    const code = await mintPlatformOAuthExchangeCode(c, {
        accountId: input.identity.account.id,
        codeChallenge: challenge
    });
    return redirectToPlatformOAuthApp(c, code);
}
