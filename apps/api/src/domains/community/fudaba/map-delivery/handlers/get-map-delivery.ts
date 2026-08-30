import { fudabaMapPrefixFromStyleUrl } from '@imsweb/contracts/fudaba/map-delivery';
import type { FudabaMapDeliverySnapshot } from '@imsweb/contracts/fudaba/map-delivery';
import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import { readFudabaMapDelivery } from '@/domains/community/fudaba/map-delivery/map-delivery-store';
import { services } from '@/middleware/hono-context';

export async function handleGetFudabaMapDelivery(
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
    const { selection, revision } = await readFudabaMapDelivery(
        storage,
        availablePrefixes
    );
    return c.json({
        selectedPrefix: selection?.prefix ?? null,
        availablePrefixes,
        effectivePrefix:
            selection?.prefix ?? fudabaMapPrefixFromStyleUrl(fallbackStyleUrl),
        revision
    } satisfies FudabaMapDeliverySnapshot);
}
