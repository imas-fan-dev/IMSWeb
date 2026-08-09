import type { AppEnvironment } from '@/app';
import { writeAudit } from '@/domains/audit/hono-service';
import type { NewsIdParams } from '@/domains/news/request';
import type { NewsMutationSuccessResponse } from '@/domains/news/response';
import { newsRepository, services } from '@/middleware/hono-context';
import type { ValidatedRequestContext } from '@/middleware/request-validation';
import { deleteObjectWithCompensation } from '@/utils/storage/delete-object';
import { publicMediaObjectKey } from '@/utils/storage/business-object-keys';

export async function handleDeleteNews(
    c: ValidatedRequestContext<AppEnvironment, 'param', NewsIdParams>
): Promise<Response> {
    const { id } = c.req.valid('param');
    const media = await newsRepository(c).findNewsMedia(id);
    await newsRepository(c).deleteNews(id);
    if (media) {
        try {
            await Promise.all([media.image, media.thumbnail].filter(Boolean).map((url) =>
                deleteObjectWithCompensation(services(c), publicMediaObjectKey(url))
            ));
        } catch (error) {
            console.error('Failed to clean media for committed news deletion', error);
        }
    }
    await writeAudit(c, '删除新闻', `ID=${id}`);
    return c.json({ success: true } satisfies NewsMutationSuccessResponse);
}
