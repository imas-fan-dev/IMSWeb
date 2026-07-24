import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import { newsRepository } from '@/middleware/hono-context';

export async function handleListAdminNews(c: Context<AppEnvironment>): Promise<Response> {
    try {
        return c.json({ success: true, data: await newsRepository(c).listAdminNews() });
    } catch {
        return c.json({ success: false, msg: '数据库错误' });
    }
}
