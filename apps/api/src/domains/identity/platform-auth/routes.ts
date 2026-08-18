import type { ImsHonoApp } from '@/app';
import {
    platformOAuthAdminRoutes,
    platformOAuthRoutes
} from '@/domains/identity/platform-auth/oauth/routes';
import { platformPasswordResetRoutes } from '@/domains/identity/platform-auth/password-reset/routes';
import { platformRegistrationRoutes } from '@/domains/identity/platform-auth/registration/routes';
import { platformSessionRoutes } from '@/domains/identity/platform-auth/sessions/routes';

export function registerPlatformAuthRoutes(app: ImsHonoApp): void {
    app.route('/api/platform/auth', platformSessionRoutes());
    app.route('/api/platform/auth', platformRegistrationRoutes());
    app.route('/api/platform/auth', platformPasswordResetRoutes());
    app.route('/api/platform/auth/oauth', platformOAuthRoutes());
    app.route('/api/admin/platform/auth/oauth', platformOAuthAdminRoutes());
}
