import type { PlatformAuthError } from '@imsweb/contracts/platform';
import type { MiddlewareHandler } from 'hono';
import { isPlatformJsonContentType } from '@/domains/identity/platform-auth/contracts/credentials';

export const requirePlatformJson: MiddlewareHandler = async (c, next) => {
    if (isPlatformJsonContentType(c.req.header('content-type'))) return next();
    return c.json(
        {
            success: false,
            code: 'PLATFORM_AUTH_JSON_REQUIRED'
        } satisfies PlatformAuthError,
        415
    );
};

export const platformJsonInputInvalid = () => ({
    success: false,
    code: 'PLATFORM_AUTH_INPUT_INVALID'
});
