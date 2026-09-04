import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { AppEnvironment } from '@/app';
import {
    createFudabaMapSourceId,
    readFudabaMapDelivery,
    saveFudabaMapDelivery,
} from '@/domains/community/fudaba/map-delivery/map-delivery-store';
import { parseFudabaMapSourceWriteRequest } from '@/domains/community/fudaba/map-delivery/request';
import { fudabaMapDeliveryResponse } from '@/domains/community/fudaba/map-delivery/response';
import { writeAudit } from '@/domains/admin/audit/write-audit';
import { services } from '@/middleware/hono-context';
import { messageFromError, statusFromError } from '@/utils/http/error-response';

export async function handleCreateFudabaMapSource(
    c: Context<AppEnvironment>,
): Promise<Response> {
    const runtime = services(c);
    const storage = runtime.storage;
    if (!storage) throw new Error('Object storage unavailable');
    const seedStyleUrls = runtime.config?.fudabaMapStyleUrls ?? [];
    try {
        const payload = await parseFudabaMapSourceWriteRequest(c);
        const current = await readFudabaMapDelivery(storage, seedStyleUrls);
        const source = {
            id: createFudabaMapSourceId(current.sources),
            name: payload.name,
            styleUrl: payload.styleUrl,
        };
        const saved = await saveFudabaMapDelivery(
            storage,
            [...current.sources, source],
            current.activeSourceId,
            payload.revision,
        );
        await writeAudit(
            c,
            '新增交换地图源',
            `${source.name} · ${source.styleUrl}`,
        );
        return c.json(
            {
                success: true,
                delivery: fudabaMapDeliveryResponse(saved),
            },
            201,
        );
    } catch (error) {
        const status = statusFromError(error);
        if (status >= 500)
            console.error('Failed to create fudaba map source', error);
        return c.json(
            {
                error:
                    status >= 500 ? '地图源新增失败' : messageFromError(error),
            },
            status as ContentfulStatusCode,
        );
    }
}
