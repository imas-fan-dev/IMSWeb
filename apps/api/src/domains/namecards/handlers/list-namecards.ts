import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import { namecardRepository } from '@/middleware/hono-context';

export async function handleListNamecards(c: Context<AppEnvironment>): Promise<Response> {
    const page = Number.parseInt(c.req.query('page') || '', 10) || 1;
    const size = Number.parseInt(c.req.query('size') || '', 10) || 25;
    try {
        const total = await namecardRepository(c).countApprovedCards();
        return c.json({
            list: await namecardRepository(c).listApprovedCards(size, (page - 1) * size),
            total,
            totalPage: Math.ceil(total / size)
        });
    } catch {
        return c.json({ msg: '查询失败' });
    }
}
