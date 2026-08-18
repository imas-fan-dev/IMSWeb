import { handlePlatformRegister } from '@/domains/identity/platform-auth/registration/handlers/register';
import { handlePlatformRegistrationVerification } from '@/domains/identity/platform-auth/registration/handlers/send-verification-code';
import {
    createCapabilityRouter,
    type ImsCapabilityRouter
} from '@/routing/capability-router';

export function platformRegistrationRoutes(): ImsCapabilityRouter {
    const routes = createCapabilityRouter();
    routes.post(
        '/register/verification-code',
        handlePlatformRegistrationVerification
    );
    routes.post('/register', handlePlatformRegister);
    return routes;
}
