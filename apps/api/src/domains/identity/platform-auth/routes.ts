import {
    adminApiPath,
    adminPlatformAuthOAuthPath,
    platformAuthOAuthPath,
    platformAuthPath,
} from '@imsweb/contracts/paths';
import type { ImsHonoApp } from '@/app';
import { platformEmailAdminRoutes } from '@/domains/identity/platform-auth/email-settings/routes';
import {
    platformOAuthAdminRoutes,
    platformOAuthRoutes
} from '@/domains/identity/platform-auth/oauth/routes';
import { platformPasswordResetRoutes } from '@/domains/identity/platform-auth/password-reset/routes';
import { platformRegistrationRoutes } from '@/domains/identity/platform-auth/registration/routes';
import { platformSessionRoutes } from '@/domains/identity/platform-auth/sessions/routes';

export function registerPlatformAuthRoutes(app: ImsHonoApp): void {
    app.route(platformAuthPath(), platformSessionRoutes());
    app.route(platformAuthPath(), platformRegistrationRoutes());
    app.route(platformAuthPath(), platformPasswordResetRoutes());
    app.route(platformAuthOAuthPath(), platformOAuthRoutes());
    app.route(adminPlatformAuthOAuthPath(), platformOAuthAdminRoutes());
    app.route(adminApiPath('/platform/email'), platformEmailAdminRoutes());
}
