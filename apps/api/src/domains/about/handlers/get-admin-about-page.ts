import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import { readAboutPageContent } from '@/domains/about/content-store';
import type { AboutAdminContentResponse } from '@/domains/about/response';
import { services } from '@/middleware/hono-context';

export async function handleGetAdminAboutPage(c: Context<AppEnvironment>): Promise<Response> {
    const storage = services(c).storage;
    if (!storage) throw new Error('Object storage unavailable');
    return c.json(
        (await readAboutPageContent(storage)) satisfies AboutAdminContentResponse
    );
}
