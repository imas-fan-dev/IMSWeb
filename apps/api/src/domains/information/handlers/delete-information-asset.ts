import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import { writeAudit } from '@/domains/audit/hono-service';
import {
    informationCardUsesAsset,
    updateInformationIndex
} from '@/domains/information/content-store';
import { informationAssetUrl } from '@/domains/information/data';
import { messageFromError, statusFromError } from '@/utils/http/error-response';
import { services } from '@/middleware/hono-context';
import { deleteObjectWithCompensation } from '@/utils/storage/delete-object';
import { publicMediaObjectKey } from '@/utils/storage/business-object-keys';

export async function handleDeleteInformationAsset(
    c: Context<AppEnvironment>
): Promise<Response> {
    const runtime = services(c);
    if (!runtime.storage) throw new Error('Object storage unavailable');
    try {
        const body = await c.req.json<{ url?: unknown }>();
        const url = typeof body.url === 'string' ? body.url.trim() : '';
        if (!informationAssetUrl(url)) {
            return c.json({ error: '图片地址无效' }, 400);
        }
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
        return c.json({ success: true });
    } catch (error) {
        const status = statusFromError(error);
        if (status >= 500) console.error('Failed to delete information asset', error);
        return c.json({
            error: status >= 500 ? '图片删除失败' : messageFromError(error)
        }, status as 400 | 409 | 500);
    }
}
