import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import { writeAudit } from '@/domains/audit/hono-service';
import { namecardRepository, services } from '@/middleware/hono-context';
import { publicMediaObjectKey } from '@/utils/storage/business-object-keys';
import { positiveInteger } from '@/utils/validation/number';

export async function handleApproveNamecard(c: Context<AppEnvironment>): Promise<Response> {
    const id = positiveInteger(c.req.param('id')) || 0;
    try {
        const repository = namecardRepository(c);
        const media = await repository.findCardMedia(id);
        if (!media) return c.json({ success: false });
        await repository.approveCard(id);
        const storage = services(c).storage;
        if (storage?.publish) {
            try {
                await Promise.all([media.image1_url, media.image2_url].map((url) =>
                    storage.publish!(publicMediaObjectKey(url))
                ));
            } catch (error) {
                console.error('Failed to publish approved namecard media; retry approval', error);
                throw error;
            }
        }
        await writeAudit(c, '审核图片通过', `card_id=${id}`);
        return c.json({ success: true });
    } catch {
        return c.json({ success: false });
    }
}
