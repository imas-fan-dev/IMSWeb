import type { ImsHonoApp } from '@/app';
import { coreAuth } from '@/middleware/hono-auth';
import { handleCheckAuth } from '@/domains/auth/handlers/check-auth';
import { handleAdminLogin, handleLogin } from '@/domains/auth/handlers/login';
import {
    loginValidationError,
    validateLoginRequest
} from '@/domains/auth/login-request';
import { handleLogout } from '@/domains/auth/handlers/logout';
import { handleRefresh } from '@/domains/auth/handlers/refresh';
import { jsonValidator } from '@/middleware/request-validation';

const loginValidator = jsonValidator(validateLoginRequest, {
    malformedMessage: '用户名或密码格式错误',
    errorBody: loginValidationError
});

export function registerAuthRoutes(app: ImsHonoApp): void {
    app.post('/api/login', loginValidator, handleLogin);
    app.post('/api/admin/login', loginValidator, handleAdminLogin);
    app.get('/api/check', coreAuth, handleCheckAuth);
    app.post('/api/refresh', handleRefresh);
    app.post('/api/logout', handleLogout);
}
