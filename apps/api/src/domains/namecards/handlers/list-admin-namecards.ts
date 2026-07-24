import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import { namecardRepository } from '@/middleware/hono-context';

export async function handleListAdminNamecards(c: Context<AppEnvironment>): Promise<Response> {
    const page = Number.parseInt(c.req.query('page') || '', 10) || 1;
    try {
        return c.json({
            success: true,
            data: await namecardRepository(c).listAdminCards(10, (page - 1) * 10)
        });
    } catch {
        return c.json({ success: false });
    }
}
