import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import type { ChronicleAdminRedirectResponse } from '@/domains/content/chronicle/response';

export async function handleServeChronicleAdmin(
    c: Context<AppEnvironment>
): Promise<Response> {
    const boundary = {
        location: '/admin/chronicle',
        status: 301
    } satisfies ChronicleAdminRedirectResponse;
    return c.redirect(boundary.location, boundary.status);
}
