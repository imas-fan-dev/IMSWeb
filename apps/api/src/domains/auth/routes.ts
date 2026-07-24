import type { ImsHonoApp } from '@/app';
import { coreAuth } from '@/middleware/hono-auth';
import { handleCheckAuth } from '@/domains/auth/handlers/check-auth';
import { handleLogin } from '@/domains/auth/handlers/login';
import { handleLogout } from '@/domains/auth/handlers/logout';

export function registerAuthRoutes(app: ImsHonoApp): void {
    app.post('/api/login', handleLogin);
    app.get('/api/check', coreAuth, handleCheckAuth);
    app.post('/api/logout', handleLogout);
}
