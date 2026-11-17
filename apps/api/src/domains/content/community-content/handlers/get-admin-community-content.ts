import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import { readCommunityContent } from '@/domains/content/community-content/content-store';
import type { CommunityContentAdminReadResponse } from '@/domains/content/community-content/response';
import { services } from '@/middleware/hono-context';

export async function handleGetAdminCommunityContent(
    c: Context<AppEnvironment>,
): Promise<Response> {
    const storage = services(c).storage;
    if (!storage) throw new Error('Object storage unavailable');
    return c.json(
        (await readCommunityContent(
            storage,
        )) satisfies CommunityContentAdminReadResponse,
    );
}
