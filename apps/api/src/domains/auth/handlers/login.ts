import type { AppEnvironment } from '@/app';
import { randomHex } from '@/utils/crypto/random';
import {
    ACCESS_TOKEN_TTL_SECONDS,
    REFRESH_TOKEN_TTL_SECONDS,
    accessTokenClaims,
    hashAuthSecret,
    setAuthenticationCookies
} from '@/domains/auth/auth-session';
import type { LoginRequest } from '@/domains/auth/login-request';
import type {
    LoginErrorResponse,
    LoginSuccessResponse
} from '@/domains/auth/response';
import {
    auditRepository,
    authRepository,
    getClientAddress,
    services
} from '@/middleware/hono-context';
import type { ValidatedRequestContext } from '@/middleware/request-validation';

async function login(
    c: ValidatedRequestContext<AppEnvironment, 'json', LoginRequest>,
    requiredDepartment?: string
): Promise<Response> {
    const { username, password } = c.req.valid('json');
    const runtime = services(c);
    if (!runtime.passwords || !runtime.tokens) throw new Error('Authentication services unavailable');
    const user = await authRepository(c).findUserByUsername(username);
    if (!user || !await runtime.passwords.verify(password, user.password)) {
        return c.json({
            success: false,
            message: '用户名或密码错误'
        } satisfies LoginErrorResponse, 401);
    }
    if (requiredDepartment && user.dept !== requiredDepartment) {
        return c.json({
            success: false,
            message: '当前账号没有管理工作台权限'
        } satisfies LoginErrorResponse, 403);
    }
    const csrfSecret = randomHex(32);
    const refreshToken = randomHex(32);
    const now = Math.floor(Date.now() / 1000);
    const token = await runtime.tokens.sign(
        accessTokenClaims(user, csrfSecret),
        ACCESS_TOKEN_TTL_SECONDS
    );
    const [tokenHash, csrfHash] = await Promise.all([
        hashAuthSecret(refreshToken),
        hashAuthSecret(csrfSecret)
    ]);
    const repository = authRepository(c);
    await repository.deleteExpiredRefreshSessions(now);
    await repository.createRefreshSession({
        id: randomHex(16),
        userId: user.id,
        tokenHash,
        csrfHash,
        expiresAt: now + REFRESH_TOKEN_TTL_SECONDS,
        createdAt: now
    });
    try {
        await auditRepository(c).insertAuditLog({
            username: user.username,
            producername: user.producername || '',
            action: '登录',
            target: '-',
            ip: getClientAddress(c),
            time: new Date().toISOString()
        });
    } catch (error) {
        console.error(error);
    }
    setAuthenticationCookies(c, { accessToken: token, refreshToken, csrfSecret });
    return c.json({
        success: true,
        token,
        username: user.username,
        producername: user.producername,
        dept: user.dept,
        adminRole: user.admin_role
    } satisfies LoginSuccessResponse);
}

export function handleLogin(
    c: ValidatedRequestContext<AppEnvironment, 'json', LoginRequest>
): Promise<Response> {
    return login(c);
}

export function handleAdminLogin(
    c: ValidatedRequestContext<AppEnvironment, 'json', LoginRequest>
): Promise<Response> {
    return login(c, 'op');
}
