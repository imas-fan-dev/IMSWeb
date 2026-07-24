import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import { writeAudit } from '@/domains/audit/hono-service';
import { namecardRepository, services } from '@/middleware/hono-context';
import { deleteObjectWithCompensation } from '@/utils/storage/delete-object';
import { positiveInteger } from '@/utils/validation/number';

export async function handleDeleteNamecard(c: Context<AppEnvironment>): Promise<Response> {
    const id = positiveInteger(c.req.param('id')) || 0;
    const media = await namecardRepository(c).findCardMedia(id);
    await namecardRepository(c).deleteCard(id);
    if (media) {
        try {
            await Promise.all([media.image1_url, media.image2_url].map((url) =>
                deleteObjectWithCompensation(services(c), url.replace(/^\/+/, ''))
            ));
        } catch (error) {
            console.error('Failed to clean media for committed namecard deletion', error);
        }
    }
    await writeAudit(c, '删除图片', `card_id=${id}`);
    return c.json({ success: true });
}
