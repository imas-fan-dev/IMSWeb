import { fudabaMapPrefixFromStyleUrl } from '@imsweb/contracts/fudaba/map-delivery';
import type { FudabaMapDeliveryMutation } from '@imsweb/contracts/fudaba/map-delivery';
import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { AppEnvironment } from '@/app';
import { saveFudabaMapDelivery } from '@/domains/community/fudaba/map-delivery/map-delivery-store';
import { parseFudabaMapDeliveryUpdateRequest } from '@/domains/community/fudaba/map-delivery/request';
import { writeAudit } from '@/domains/admin/audit/write-audit';
import { services } from '@/middleware/hono-context';
import { messageFromError, statusFromError } from '@/utils/http/error-response';

export async function handleUpdateFudabaMapDelivery(
    c: Context<AppEnvironment>
): Promise<Response> {
    const runtime = services(c);
    const storage = runtime.storage;
    if (!storage) throw new Error('Object storage unavailable');
    const fallbackStyleUrl = runtime.config?.fudabaMapStyleUrl;
    if (!fallbackStyleUrl) {
        throw Object.assign(new Error('Fudaba map style is unavailable'), {
            status: 503
        });
    }
    const availablePrefixes = runtime.config?.fudabaMapPrefixes ?? [];
    try {
        const payload = await parseFudabaMapDeliveryUpdateRequest(c);
        const saved = await saveFudabaMapDelivery(
            storage,
            payload.prefix,
            availablePrefixes,
            payload.revision
        );
        await writeAudit(c, '更新交换地图分发前缀', saved.selection.prefix);
        return c.json({
            success: true,
            delivery: {
                selectedPrefix: saved.selection.prefix,
                availablePrefixes,
                effectivePrefix: saved.selection.prefix,
                revision: saved.revision
            }
        } satisfies FudabaMapDeliveryMutation);
    } catch (error) {
        const status = statusFromError(error);
        if (status >= 500) {
            console.error('Failed to update fudaba map delivery', error);
        }
        return c.json(
            {
                error:
                    status >= 500
                        ? '地图分发前缀保存失败'
                        : messageFromError(error)
            },
            status as ContentfulStatusCode
        );
    }
}

/** Exposed for callers that need the deployment default without a store read. */
export function fudabaMapDefaultPrefix(fallbackStyleUrl: string): string {
    return fudabaMapPrefixFromStyleUrl(fallbackStyleUrl);
}
