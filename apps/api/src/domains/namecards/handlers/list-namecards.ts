import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import { namecardRepository, services } from '@/middleware/hono-context';
import { resolvePublicMediaFields } from '@/utils/storage/public-object-url';

export async function handleListNamecards(c: Context<AppEnvironment>): Promise<Response> {
    const page = Number.parseInt(c.req.query('page') || '', 10) || 1;
    const size = Number.parseInt(c.req.query('size') || '', 10) || 25;
    try {
        const total = await namecardRepository(c).countApprovedCards();
        const cards = await namecardRepository(c).listApprovedCards(size, (page - 1) * size);
        const storage = services(c).storage;
        return c.json({
            list: storage
                ? await Promise.all(cards.map((card) => resolvePublicMediaFields(
                    storage,
                    card,
                    ['image1_url', 'image2_url']
                )))
                : cards,
            total,
            totalPage: Math.ceil(total / size)
        });
    } catch {
        return c.json({ msg: '查询失败' });
    }
}
