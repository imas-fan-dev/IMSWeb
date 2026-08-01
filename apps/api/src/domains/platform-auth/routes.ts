import type { ImsHonoApp } from '@/app';
import { platformAuth } from '@/middleware/hono-auth';
import { handlePlatformLogout } from '@/domains/platform-auth/handlers/logout';
import { handlePlatformRefresh } from '@/domains/platform-auth/handlers/refresh';
import { handlePlatformSession } from '@/domains/platform-auth/handlers/session';

export function registerPlatformAuthRoutes(app: ImsHonoApp): void {
    app.get('/api/platform/auth/session', platformAuth, handlePlatformSession);
    app.post('/api/platform/auth/refresh', handlePlatformRefresh);
    app.post('/api/platform/auth/logout', handlePlatformLogout);
}
