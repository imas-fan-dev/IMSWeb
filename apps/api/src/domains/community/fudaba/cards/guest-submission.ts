import type { Context, Next, MiddlewareHandler } from 'hono';
import type { FudabaGuestSubmissionSettingsResponse } from '@imsweb/contracts/fudaba';
import { FUDABA_GUEST_SUBMISSION_HEADER } from '@imsweb/contracts/fudaba/runtime';
import type { AppEnvironment } from '@/app';
import { activePlatformMutation, optionalPlatformAuth, platformAuth, platformCsrf } from '@/middleware/hono-auth';
import { fudabaRepository, services } from '@/middleware/hono-context';
import { platformUploadRateLimit, platformWriteRateLimit } from '@/middleware/platform-mutation-limit';
import { enforceRateLimit } from '@/middleware/rate-limit';

type CardContext = Context<AppEnvironment>;

export function authenticateFudabaCardSubmission(c: CardContext, next: Next) {
    return c.req.header(FUDABA_GUEST_SUBMISSION_HEADER) === '1'
        ? optionalPlatformAuth(c, next)
        : platformAuth(c, next);
}

export async function authorizeFudabaCardSubmission(c: CardContext, next: Next): Promise<Response | void> {
    if (c.get('platformUser')) {
        // Don't silently assign a stale guest form to a newly signed-in account.
        if (c.req.header(FUDABA_GUEST_SUBMISSION_HEADER) === '1') {
            return c.json({ success: false, code: 'FUDABA_GUEST_SESSION_CHANGED',
                message: '登录状态已变化，请重新打开新建名片' }, 409);
        }
    } else {
        if (!(await guestSubmissionEnabled(c))) {
            return c.json({ success: false, code: 'FUDABA_GUEST_SUBMISSION_DISABLED',
                message: '匿名投稿已关闭，请登录后新建名片' }, 403);
        }
        const limited = await enforceRateLimit(c, {
            bucket: 'namecard-guest-upload-ip',
            limit: 6,
            windowSeconds: 3600,
        });
        if (limited) return limited;
    }
    await next();
}

export function forFudabaCardOwner(middleware: MiddlewareHandler<AppEnvironment>): MiddlewareHandler<AppEnvironment> {
    return async (c, next) => {
        if (c.get('platformUser')) return middleware(c, next);
        await next();
    };
}

export const fudabaCardSubmissionGuards = [
    authenticateFudabaCardSubmission,
    forFudabaCardOwner(activePlatformMutation),
    authorizeFudabaCardSubmission,
    forFudabaCardOwner(platformCsrf),
    forFudabaCardOwner(platformUploadRateLimit),
    forFudabaCardOwner(platformWriteRateLimit),
] as const;

async function guestSubmissionEnabled(c: CardContext): Promise<boolean> {
    const config = services(c).config;
    return config?.fudabaWriteEnabled === true
        && config.fudabaPublicReadEnabled === true
        && await fudabaRepository(c).getGuestSubmissionEnabled();
}

export async function handleGetFudabaGuestSubmission(c: CardContext): Promise<Response> {
    c.header('Cache-Control', 'no-store');
    const enabled = await guestSubmissionEnabled(c);
    return c.json({ success: true, enabled } satisfies FudabaGuestSubmissionSettingsResponse);
}
