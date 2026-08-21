import { platformApiPath } from '@imsweb/contracts/paths';
import type { Context, Next } from 'hono';
import type { AppEnvironment, ImsHonoApp } from '@/app';
import { handleGetPlatformProfile } from '@/domains/identity/platform-profile/handlers/get-profile';
import { handleServePlatformAvatar } from '@/domains/identity/platform-profile/handlers/serve-avatar';
import { handleUpdatePlatformProfile } from '@/domains/identity/platform-profile/handlers/update-profile';
import {
    activePlatformMutation,
    platformAuth,
    platformCsrf
} from '@/middleware/hono-auth';
import { services } from '@/middleware/hono-context';
import { platformWriteRateLimit } from '@/middleware/platform-mutation-limit';

async function privateProfileResponse(
    c: Context<AppEnvironment>,
    next: Next
): Promise<void> {
    await next();
    c.header('Cache-Control', 'private, no-store');
    c.header('Vary', 'Authorization, Cookie', { append: true });
}

async function requireFudabaWrite(
    c: Context<AppEnvironment>,
    next: Next
): Promise<Response | void> {
    if (services(c).config?.fudabaWriteEnabled !== true) {
        return c.text('Not Found', 404);
    }
    await next();
}

export function registerPlatformProfileRoutes(app: ImsHonoApp): void {
    app.use(platformApiPath('/me'), privateProfileResponse);
    app.use(platformApiPath('/me/*'), privateProfileResponse);
    app.get(platformApiPath('/me'), platformAuth, handleGetPlatformProfile);
    app.get(platformApiPath('/me/avatar'), platformAuth, handleServePlatformAvatar);
    app.on('HEAD', platformApiPath('/me/avatar'), platformAuth, handleServePlatformAvatar);
    app.put(
        platformApiPath('/me'),
        requireFudabaWrite,
        platformAuth,
        activePlatformMutation,
        platformCsrf,
        platformWriteRateLimit,
        handleUpdatePlatformProfile
    );
}
