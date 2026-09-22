import type { Context } from 'hono';
import type {
    AdminPlatformUserLastLoginMethodError,
    AdminPlatformUserNotFoundError,
    AdminPlatformUserOAuthLinkNotFoundError,
    AdminPlatformUserPasswordResetUnavailableError,
    AdminPlatformUserStatusUnsupportedError,
    AdminPlatformUserSuspendedError
} from '@imsweb/contracts/platform/admin-users';
import type { AppEnvironment } from '@/app';

/**
 * Account-side failures. A missing account, a status the admin surface may not
 * clear, a missing link and the last-credential refusal all answer with a
 * distinct code so the console can say what happened; none of them carries any
 * account data beyond the code.
 */
export function platformUserNotFound(c: Context<AppEnvironment>): Response {
    return c.json(
        {
            success: false,
            code: 'PLATFORM_USER_NOT_FOUND'
        } satisfies AdminPlatformUserNotFoundError,
        404
    );
}

export function platformUserStatusUnsupported(
    c: Context<AppEnvironment>
): Response {
    return c.json(
        {
            success: false,
            code: 'PLATFORM_USER_STATUS_UNSUPPORTED'
        } satisfies AdminPlatformUserStatusUnsupportedError,
        409
    );
}

export function platformOAuthLinkNotFound(c: Context<AppEnvironment>): Response {
    return c.json(
        {
            success: false,
            code: 'PLATFORM_OAUTH_LINK_NOT_FOUND'
        } satisfies AdminPlatformUserOAuthLinkNotFoundError,
        404
    );
}

export function platformOAuthLastLoginMethod(
    c: Context<AppEnvironment>
): Response {
    return c.json(
        {
            success: false,
            code: 'PLATFORM_OAUTH_LAST_LOGIN_METHOD'
        } satisfies AdminPlatformUserLastLoginMethodError,
        409
    );
}

export function platformUserSuspended(c: Context<AppEnvironment>): Response {
    return c.json(
        {
            success: false,
            code: 'PLATFORM_USER_SUSPENDED'
        } satisfies AdminPlatformUserSuspendedError,
        409
    );
}

export function platformUserPasswordResetUnavailable(
    c: Context<AppEnvironment>
): Response {
    return c.json(
        {
            success: false,
            code: 'PLATFORM_USER_PASSWORD_RESET_UNAVAILABLE'
        } satisfies AdminPlatformUserPasswordResetUnavailableError,
        409
    );
}
