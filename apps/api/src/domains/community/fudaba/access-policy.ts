import type { Context, Next } from 'hono';
import type { AppEnvironment } from '@/app';
import { services } from '@/middleware/hono-context';

export async function privateFudabaResponse(
    c: Context<AppEnvironment>,
    next: Next
): Promise<void> {
    await next();
    c.header('Cache-Control', 'private, no-store');
    c.header('Vary', 'Authorization, Cookie', { append: true });
}

export async function requireFudabaPublicRead(
    c: Context<AppEnvironment>,
    next: Next
): Promise<Response | void> {
    if (services(c).config?.fudabaPublicReadEnabled !== true) {
        return c.text('Not Found', 404);
    }
    await next();
}

export async function requireFudabaWrite(
    c: Context<AppEnvironment>,
    next: Next
): Promise<Response | void> {
    if (services(c).config?.fudabaWriteEnabled !== true) {
        return c.text('Not Found', 404);
    }
    await next();
}

export async function requireFudabaMap(
    c: Context<AppEnvironment>,
    next: Next
): Promise<Response | void> {
    if (services(c).config?.fudabaMapEnabled !== true) {
        return c.text('Not Found', 404);
    }
    await next();
}
