import { platformApiPath } from '@imsweb/contracts/paths';
import type { Context, Next } from 'hono';
import type { AppEnvironment, ImsHonoApp } from '@/app';
import { handleDeletePlatformAvatar } from '@/domains/identity/platform-profile/handlers/delete-avatar';
import { handleGetPlatformProfile } from '@/domains/identity/platform-profile/handlers/get-profile';
import { handleServePlatformAvatar } from '@/domains/identity/platform-profile/handlers/serve-avatar';
import { handleUpdatePlatformProfile } from '@/domains/identity/platform-profile/handlers/update-profile';
import { handleUploadPlatformAvatar } from '@/domains/identity/platform-profile/handlers/upload-avatar';
import {
    activePlatformMutation,
    platformAuth,
    platformCsrf
} from '@/middleware/hono-auth';
import {
    platformUploadRateLimit,
    platformWriteRateLimit
} from '@/middleware/platform-mutation-limit';

async function privateProfileResponse(
    c: Context<AppEnvironment>,
    next: Next
): Promise<void> {
    await next();
    c.header('Cache-Control', 'private, no-store');
    c.header('Vary', 'Authorization, Cookie', { append: true });
}

// Display name, home city, bio, and avatar are platform identity rather than
// Fudaba content, so they stay writable while the exchange rollout switch is
// off. Only a non-active account freezes them, via `activePlatformMutation`.
export function registerPlatformProfileRoutes(app: ImsHonoApp): void {
    app.use(platformApiPath('/me'), privateProfileResponse);
    app.use(platformApiPath('/me/*'), privateProfileResponse);
    app.get(platformApiPath('/me'), platformAuth, handleGetPlatformProfile);
    app.get(platformApiPath('/me/avatar'), platformAuth, handleServePlatformAvatar);
    app.on('HEAD', platformApiPath('/me/avatar'), platformAuth, handleServePlatformAvatar);
    app.put(
        platformApiPath('/me'),
        platformAuth,
        activePlatformMutation,
        platformCsrf,
        platformWriteRateLimit,
        handleUpdatePlatformProfile
    );
    app.put(
        platformApiPath('/me/avatar'),
        platformAuth,
        activePlatformMutation,
        platformCsrf,
        platformUploadRateLimit,
        handleUploadPlatformAvatar
    );
    app.delete(
        platformApiPath('/me/avatar'),
        platformAuth,
        activePlatformMutation,
        platformCsrf,
        platformWriteRateLimit,
        handleDeletePlatformAvatar
    );
}
