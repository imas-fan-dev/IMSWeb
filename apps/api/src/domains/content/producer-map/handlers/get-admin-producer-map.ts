import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import { readProducerMapContent } from '@/domains/content/producer-map/content-store';
import type { ProducerMapAdminReadResponse } from '@/domains/content/producer-map/response';
import { services } from '@/middleware/hono-context';

export async function handleGetAdminProducerMap(
    c: Context<AppEnvironment>
): Promise<Response> {
    const storage = services(c).storage;
    if (!storage) throw new Error('Object storage unavailable');
    return c.json(
        (await readProducerMapContent(storage)) satisfies ProducerMapAdminReadResponse
    );
}
