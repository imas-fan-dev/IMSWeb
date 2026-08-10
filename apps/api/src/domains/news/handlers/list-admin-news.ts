import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import type {
    AdminNewsItemResponse,
    AdminNewsListResponse
} from '@/domains/news/response';
import { newsRepository } from '@/middleware/hono-context';

export async function handleListAdminNews(c: Context<AppEnvironment>): Promise<Response> {
    try {
        const data = await newsRepository(c).listAdminNews() as AdminNewsItemResponse[];
        return c.json({
            success: true,
            data
        } satisfies AdminNewsListResponse);
    } catch {
        return c.json({
            success: false,
            msg: '数据库错误'
        } satisfies AdminNewsListResponse);
    }
}
