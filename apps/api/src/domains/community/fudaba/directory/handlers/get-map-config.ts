import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import { assertNoFudabaQuery } from '@/domains/community/fudaba/directory/request';
import { readFudabaMapDelivery } from '@/domains/community/fudaba/map-delivery/map-delivery-store';
import { services } from '@/middleware/hono-context';

/**
 * Resolve the style URL the browser is handed.
 *
 * The persisted active source is validated on every read. Missing or poisoned
 * storage falls back to the deployment seed, while a valid dynamic collection
 * remains authoritative when environment seed choices change.
 */
export async function handleGetFudabaMapConfig(
    c: Context<AppEnvironment>,
): Promise<Response> {
    assertNoFudabaQuery(c.req.url);
    const runtime = services(c);
    const styleUrl = runtime.config?.fudabaMapStyleUrl;
    if (!styleUrl) {
        throw Object.assign(new Error('Fudaba map style is unavailable'), {
            status: 503,
        });
    }
    const storage = runtime.storage;
    if (!storage) return c.json({ styleUrl });
    try {
        const delivery = await readFudabaMapDelivery(storage, [
            styleUrl,
            ...(runtime.config?.fudabaMapStyleUrls ?? []),
        ]);
        const active = delivery.sources.find(
            (source) => source.id === delivery.activeSourceId,
        );
        return c.json({ styleUrl: active?.styleUrl ?? styleUrl });
    } catch (error) {
        console.error('Failed to read fudaba map delivery selection', error);
        return c.json({ styleUrl });
    }
}
