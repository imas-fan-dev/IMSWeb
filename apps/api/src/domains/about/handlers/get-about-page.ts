import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import { readAboutPageContent } from '@/domains/about/content-store';
import type { AboutPublicContentResponse } from '@/domains/about/response';
import { services } from '@/middleware/hono-context';

export async function handleGetAboutPage(c: Context<AppEnvironment>): Promise<Response> {
    const storage = services(c).storage;
    if (!storage) throw new Error('Object storage unavailable');
    const { content } = await readAboutPageContent(storage);
    c.header('Cache-Control', 'no-cache');
    return c.json(content satisfies AboutPublicContentResponse);
}
