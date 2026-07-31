import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import {
    homepageLinkPayload,
    homepageLinkRepository
} from '@/domains/homepage-links/handler-support';

export async function handleListHomepageLinks(c: Context<AppEnvironment>): Promise<Response> {
    c.header('Cache-Control', 'no-cache');
    return c.json(await homepageLinkPayload(homepageLinkRepository(c)));
}
