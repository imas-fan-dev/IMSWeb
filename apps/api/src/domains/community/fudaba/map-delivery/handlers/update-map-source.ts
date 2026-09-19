import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { AppEnvironment } from '@/app';
import {
    readFudabaMapDelivery,
    saveFudabaMapDelivery,
} from '@/domains/community/fudaba/map-delivery/map-delivery-store';
import type {
    FudabaMapSourceWrite,
} from '@imsweb/contracts/fudaba/map-delivery';
import { fudabaMapDeliveryResponse } from '@/domains/community/fudaba/map-delivery/response';
import { writeAudit } from '@/domains/admin/audit/write-audit';
import { services } from '@/middleware/hono-context';
import { messageFromError, statusFromError } from '@/utils/http/error-response';

export async function handleUpdateFudabaMapSource(
    c: Context<AppEnvironment>,
): Promise<Response> {
    const runtime = services(c);
    const storage = runtime.storage;
    if (!storage) throw new Error('Object storage unavailable');
    try {
        const request = c.req as unknown as {
            valid(target: 'json' | 'param'): unknown;
        };
        const sourceId = (request.valid('param') as { sourceId: string }).sourceId;
        const payload = request.valid('json') as FudabaMapSourceWrite;
        const current = await readFudabaMapDelivery(
            storage,
            runtime.config?.fudabaMapStyleUrls ?? [],
        );
        const existing = current.sources.find(
            (source) => source.id === sourceId,
        );
        if (!existing) {
            throw Object.assign(new Error('地图源不存在'), { status: 404 });
        }
        const sources = current.sources.map((source) =>
            source.id === sourceId
                ? { ...source, name: payload.name, styleUrl: payload.styleUrl }
                : source,
        );
        const saved = await saveFudabaMapDelivery(
            storage,
            sources,
            current.activeSourceId,
            payload.revision,
        );
        await writeAudit(
            c,
            '编辑交换地图源',
            `${payload.name} · ${payload.styleUrl}`,
        );
        return c.json({
            success: true,
            delivery: fudabaMapDeliveryResponse(saved),
        });
    } catch (error) {
        const status = statusFromError(error);
        if (status >= 500)
            console.error('Failed to update fudaba map source', error);
        return c.json(
            {
                error:
                    status >= 500 ? '地图源编辑失败' : messageFromError(error),
            },
            status as ContentfulStatusCode,
        );
    }
}
