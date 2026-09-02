import { platformApiPath } from '@imsweb/contracts/paths';
import type { ImsHonoApp } from '@/app';
import { platformOAuthLinkRoutes } from '@/domains/identity/platform-account-security/oauth-links/routes';
import { platformPasswordRoutes } from '@/domains/identity/platform-account-security/password/routes';
import { platformAccountSessionRoutes } from '@/domains/identity/platform-account-security/sessions/routes';

/**
 * Account security for a signed-in Platform user.
 *
 * The domain boundary is the caller's identity state, not feature similarity:
 * `platform-auth` serves anonymous or refresh-only callers, `platform-profile`
 * serves display fields, and everything here additionally demands a second
 * proof or targets the session surface itself. That is what lets every write in
 * this domain share one middleware chain.
 *
 * The `/api/platform/me` prefix is declared once per capability router; the
 * private-response headers on `/me/*` are already installed by the profile
 * domain, which registers earlier in `app.ts`.
 */
export function registerPlatformAccountSecurityRoutes(app: ImsHonoApp): void {
    app.route(platformApiPath('/me'), platformPasswordRoutes());
    app.route(platformApiPath('/me'), platformAccountSessionRoutes());
    app.route(platformApiPath('/me'), platformOAuthLinkRoutes());
}
