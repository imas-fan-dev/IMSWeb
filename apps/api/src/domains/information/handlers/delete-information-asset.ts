import type { AppEnvironment } from '@/app';
import { writeAudit } from '@/domains/audit/hono-service';
import {
    informationCardUsesAsset,
    updateInformationIndex
} from '@/domains/information/content-store';
import type {
    InformationErrorResponse,
    InformationMutationResponse
} from '@/domains/information/response';
import { messageFromError, statusFromError } from '@/utils/http/error-response';
import { services } from '@/middleware/hono-context';
import type { ValidatedRequestContext } from '@/middleware/request-validation';
import { deleteObjectWithCompensation } from '@/utils/storage/delete-object';
import { publicMediaObjectKey } from '@/utils/storage/business-object-keys';

export async function handleDeleteInformationAsset(
    c: ValidatedRequestContext<AppEnvironment, 'json', string>
): Promise<Response> {
    const runtime = services(c);
    if (!runtime.storage) throw new Error('Object storage unavailable');
    try {
        const url = c.req.valid('json');
        await updateInformationIndex(runtime.storage, (index) => {
            if (index.cards.some((card) => informationCardUsesAsset(card, url))) {
                throw Object.assign(new Error('图片仍被活动内容使用'), { status: 409 });
            }
            return { ...index, assets: index.assets.filter((asset) => asset !== url) };
        });
        try {
            await deleteObjectWithCompensation(runtime, publicMediaObjectKey(url));
        } catch (error) {
            console.error('Failed to clean committed information asset deletion', error);
        }
        await writeAudit(c, '删除活动图片', url);
        return c.json({ success: true } satisfies InformationMutationResponse);
    } catch (error) {
        const status = statusFromError(error);
        if (status >= 500) console.error('Failed to delete information asset', error);
        return c.json({
            error: status >= 500 ? '图片删除失败' : messageFromError(error)
        } satisfies InformationErrorResponse, status as 400 | 409 | 500);
    }
}
