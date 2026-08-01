import type { ImsHonoApp } from '@/app';
import { backofficeAuth } from '@/middleware/hono-auth';
import { handleCheckBackofficeAuth } from '@/domains/backoffice-auth/handlers/check-auth';
import {
    handleBackofficeAdminLogin,
    handleBackofficeLogin
} from '@/domains/backoffice-auth/handlers/login';
import { handleBackofficeLogout } from '@/domains/backoffice-auth/handlers/logout';
import { handleBackofficeRefresh } from '@/domains/backoffice-auth/handlers/refresh';

export function registerBackofficeAuthRoutes(app: ImsHonoApp): void {
    app.post('/api/login', handleBackofficeLogin);
    app.post('/api/admin/login', handleBackofficeAdminLogin);
    app.get('/api/check', backofficeAuth, handleCheckBackofficeAuth);
    app.post('/api/refresh', handleBackofficeRefresh);
    app.post('/api/logout', handleBackofficeLogout);
}
