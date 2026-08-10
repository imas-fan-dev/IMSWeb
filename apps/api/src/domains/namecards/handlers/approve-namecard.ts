import type { AppEnvironment } from '@/app';
import { writeAudit } from '@/domains/audit/hono-service';
import type { CompatibleNamecardIdParams } from '@/domains/namecards/request';
import type { NamecardMutationResponse } from '@/domains/namecards/response';
import { namecardRepository, services } from '@/middleware/hono-context';
import type { ValidatedRequestContext } from '@/middleware/request-validation';
import { publicMediaObjectKey } from '@/utils/storage/business-object-keys';

export async function handleApproveNamecard(
    c: ValidatedRequestContext<AppEnvironment, 'param', CompatibleNamecardIdParams>
): Promise<Response> {
    const { id } = c.req.valid('param');
    try {
        const repository = namecardRepository(c);
        const media = await repository.findCardMedia(id);
        if (!media) return c.json({ success: false } satisfies NamecardMutationResponse);
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
        return c.json({ success: true } satisfies NamecardMutationResponse);
    } catch {
        return c.json({ success: false } satisfies NamecardMutationResponse);
    }
}
