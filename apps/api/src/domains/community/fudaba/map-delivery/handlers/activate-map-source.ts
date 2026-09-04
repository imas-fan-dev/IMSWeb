import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { AppEnvironment } from '@/app';
import {
    readFudabaMapDelivery,
    saveFudabaMapDelivery,
} from '@/domains/community/fudaba/map-delivery/map-delivery-store';
import { parseFudabaMapSourceActivationRequest } from '@/domains/community/fudaba/map-delivery/request';
import { fudabaMapDeliveryResponse } from '@/domains/community/fudaba/map-delivery/response';
import { writeAudit } from '@/domains/admin/audit/write-audit';
import { services } from '@/middleware/hono-context';
import { messageFromError, statusFromError } from '@/utils/http/error-response';

export async function handleActivateFudabaMapSource(
    c: Context<AppEnvironment>,
): Promise<Response> {
    const runtime = services(c);
    const storage = runtime.storage;
    if (!storage) throw new Error('Object storage unavailable');
    try {
        const payload = await parseFudabaMapSourceActivationRequest(c);
        const current = await readFudabaMapDelivery(
            storage,
            runtime.config?.fudabaMapStyleUrls ?? [],
        );
        const source = current.sources.find(
            (item) => item.id === payload.sourceId,
        );
        if (!source) {
            throw Object.assign(new Error('地图源不存在'), { status: 404 });
        }
        if (source.id === current.activeSourceId) {
            return c.json({
                success: true,
                delivery: fudabaMapDeliveryResponse(current),
            });
        }
        const saved = await saveFudabaMapDelivery(
            storage,
            current.sources,
            source.id,
            payload.revision,
        );
        await writeAudit(
            c,
            '激活交换地图源',
            `${source.name} · ${source.styleUrl}`,
        );
        return c.json({
            success: true,
            delivery: fudabaMapDeliveryResponse(saved),
        });
    } catch (error) {
        const status = statusFromError(error);
        if (status >= 500)
            console.error('Failed to activate fudaba map source', error);
        return c.json(
            {
                error:
                    status >= 500 ? '地图源激活失败' : messageFromError(error),
            },
            status as ContentfulStatusCode,
        );
    }
}
