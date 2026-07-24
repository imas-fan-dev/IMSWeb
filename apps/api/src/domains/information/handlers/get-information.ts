import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import { readInformationIndex } from '@/domains/information/content-store';
import { services } from '@/middleware/hono-context';

export async function handleGetInformation(c: Context<AppEnvironment>): Promise<Response> {
    const storage = services(c).storage;
    if (!storage) throw new Error('Object storage unavailable');
    const { index } = await readInformationIndex(storage);
    const card = index.cards.find((candidate) => candidate.id === c.req.param('id'));
    if (!card || card.contentType !== 'html') {
        return c.json({ error: '活动内容不存在' }, 404);
    }
    c.header('Cache-Control', 'no-cache');
    return c.json({ card });
}
