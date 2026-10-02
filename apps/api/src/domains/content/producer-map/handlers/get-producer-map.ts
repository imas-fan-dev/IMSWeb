import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import { readProducerMapContent } from '@/domains/content/producer-map/content-store';
import type {
    ProducerMapMutationErrorResponse,
    ProducerMapPublicReadResponse
} from '@/domains/content/producer-map/response';
import { services } from '@/middleware/hono-context';
import { resolvePublicMediaUrl } from '@/utils/storage/public-object-url';

export async function handleGetProducerMap(c: Context<AppEnvironment>): Promise<Response> {
    const storage = services(c).storage;
    if (!storage) throw new Error('Object storage unavailable');
    const { content } = await readProducerMapContent(storage);
    c.header('Cache-Control', 'no-cache');
    if (!content) {
        return c.json(
            { error: '制作人地图尚未配置' } satisfies ProducerMapMutationErrorResponse,
            404
        );
    }
    const [regions, communities] = await Promise.all([
        Promise.all(content.regions.map(async (region) => ({
            ...region,
            imageUrl: region.imageUrl
                ? await resolvePublicMediaUrl(storage, region.imageUrl)
                : null
        }))),
        Promise.all(content.communities.map(async (community) => ({
            ...community,
            imageUrl: community.imageUrl
                ? await resolvePublicMediaUrl(storage, community.imageUrl)
                : null
        })))
    ]);
    return c.json({
        ...content,
        regions,
        communities
    } satisfies ProducerMapPublicReadResponse);
}
