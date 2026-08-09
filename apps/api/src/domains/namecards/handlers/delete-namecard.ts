import type { AppEnvironment } from '@/app';
import { writeAudit } from '@/domains/audit/hono-service';
import type { NamecardIdParams } from '@/domains/namecards/request';
import type { NamecardMutationResponse } from '@/domains/namecards/response';
import { namecardRepository, services } from '@/middleware/hono-context';
import type { ValidatedRequestContext } from '@/middleware/request-validation';
import { deleteObjectWithCompensation } from '@/utils/storage/delete-object';
import { publicMediaObjectKey } from '@/utils/storage/business-object-keys';

export async function handleDeleteNamecard(
    c: ValidatedRequestContext<AppEnvironment, 'param', NamecardIdParams>
): Promise<Response> {
    const { id } = c.req.valid('param');
    const media = await namecardRepository(c).findCardMedia(id);
    await namecardRepository(c).deleteCard(id);
    if (media) {
        try {
            await Promise.all([media.image1_url, media.image2_url].map((url) =>
                deleteObjectWithCompensation(services(c), publicMediaObjectKey(url))
            ));
        } catch (error) {
            console.error('Failed to clean media for committed namecard deletion', error);
        }
    }
    await writeAudit(c, '删除图片', `card_id=${id}`);
    return c.json({ success: true } satisfies NamecardMutationResponse);
}
