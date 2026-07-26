import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import { readProducerMapContent } from '@/domains/producer-map/content-store';
import { services } from '@/middleware/hono-context';

export async function handleGetProducerMap(c: Context<AppEnvironment>): Promise<Response> {
    const storage = services(c).storage;
    if (!storage) throw new Error('Object storage unavailable');
    const { content } = await readProducerMapContent(storage);
    c.header('Cache-Control', 'no-cache');
    return c.json(content);
}
