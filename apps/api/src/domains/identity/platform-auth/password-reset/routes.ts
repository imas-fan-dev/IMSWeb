import {
    handlePlatformPasswordReset,
    handlePlatformPasswordResetVerification
} from '@/domains/identity/platform-auth/password-reset/handlers/reset-password';
import {
    createCapabilityRouter,
    type ImsCapabilityRouter
} from '@/routing/capability-router';

export function platformPasswordResetRoutes(): ImsCapabilityRouter {
    const routes = createCapabilityRouter();
    routes.post(
        '/password-reset/verification-code',
        handlePlatformPasswordResetVerification
    );
    routes.post('/password-reset', handlePlatformPasswordReset);
    return routes;
}
