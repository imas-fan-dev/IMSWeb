import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import { writeAudit } from '@/domains/audit/hono-service';
import { newsRepository, services } from '@/middleware/hono-context';
import { deleteObjectWithCompensation } from '@/utils/storage/delete-object';

export async function handleDeleteNews(c: Context<AppEnvironment>): Promise<Response> {
    const id = Number(c.req.param('id'));
    const media = await newsRepository(c).findNewsMedia(id);
    await newsRepository(c).deleteNews(id);
    if (media) {
        try {
            await Promise.all([media.image, media.thumbnail].filter(Boolean).map((url) =>
                deleteObjectWithCompensation(services(c), url.replace(/^\/+/, ''))
            ));
        } catch (error) {
            console.error('Failed to clean media for committed news deletion', error);
        }
    }
    await writeAudit(c, '删除新闻', `ID=${id}`);
    return c.json({ success: true });
}
