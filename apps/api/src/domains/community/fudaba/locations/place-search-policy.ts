import type { Context, Next } from 'hono';
import type { AppEnvironment } from '@/app';
import { requireFudabaWrite } from '@/domains/community/fudaba/access-policy';
import { platformAuth } from '@/middleware/hono-auth';
import { services } from '@/middleware/hono-context';

export async function requireFudabaPlaceSearch(
    c: Context<AppEnvironment>,
    next: Next,
): Promise<Response | void> {
    const config = services(c).config;
    if (config?.fudabaPublicReadEnabled === true && config.fudabaMapEnabled === true) {
        await next();
        return;
    }
    if (config?.fudabaWriteEnabled !== true) return requireFudabaWrite(c, next);
    return platformAuth(c, next);
}
