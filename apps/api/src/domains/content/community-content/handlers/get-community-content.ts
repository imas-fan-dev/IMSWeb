import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import { readCommunityContent } from '@/domains/content/community-content/content-store';
import type { CommunityContentPublicReadResponse } from '@/domains/content/community-content/response';
import { services } from '@/middleware/hono-context';
import { resolvePublicMediaUrl } from '@/utils/storage/public-object-url';
export async function handleGetCommunityContent(
    c: Context<AppEnvironment>,
): Promise<Response> {
    const storage = services(c).storage;
    if (!storage) throw new Error('Object storage unavailable');
    const { content } = await readCommunityContent(storage);
    c.header('Cache-Control', 'no-cache');
    const entries = await Promise.all(
        content.entries
            .filter((entry) => entry.enabled)
            .map(async (entry) => ({
                ...entry,
                imageUrl: entry.imageUrl
                    ? await resolvePublicMediaUrl(storage, entry.imageUrl)
                    : null,
            })),
    );
    return c.json({
        ...content,
        entries,
    } satisfies CommunityContentPublicReadResponse);
}
