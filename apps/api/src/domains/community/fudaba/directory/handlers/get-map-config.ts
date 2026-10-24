import type { FudabaMapConfig } from '@imsweb/contracts/fudaba';
import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import { assertNoFudabaQuery } from '@/domains/community/fudaba/directory/request';
import { readFudabaMapDelivery } from '@/domains/community/fudaba/map-delivery/map-delivery-store';
import { describeMapProvider, describeRegionalSearchMap } from '@/domains/community/fudaba/map-delivery/map-provider-policy';
import { services } from '@/middleware/hono-context';

/**
 * Deliver the selected provider and its centrally owned search configuration.
 */
export async function handleGetFudabaMapConfig(
    c: Context<AppEnvironment>,
): Promise<Response> {
    assertNoFudabaQuery(c.req.url);
    const runtime = services(c);
    const seeds = runtime.config?.fudabaMapSources ?? [];
    const storage = runtime.storage;
    function fallback(): FudabaMapConfig {
        const config = seeds[0];
        if (!config) throw Object.assign(new Error('Fudaba map configuration is unavailable'), { status: 503 });
        const description = describeMapProvider(config);
        return { ...description.publicConfig, search: description.searchConfig } satisfies FudabaMapConfig;
    }
    if (!storage) return c.json(fallback());
    try {
        const delivery = await readFudabaMapDelivery(storage, seeds);
        if (delivery.routing) {
            const mainland = delivery.sources.find((source) => source.id === delivery.routing!.mainlandSourceId)!;
            const overseas = delivery.sources.find((source) => source.id === delivery.routing!.overseasSourceId)!;
            return c.json(describeRegionalSearchMap(mainland, overseas));
        }
        const active = delivery.sources.find(
            (source) => source.id === delivery.activeSourceId,
        );
        const description = active ? describeMapProvider(active) : null;
        const config: FudabaMapConfig = description
            ? { ...description.publicConfig, search: description.searchConfig }
            : fallback();
        return c.json(config);
    } catch (error) {
        console.error('Failed to read fudaba map delivery selection', error);
        return c.json(fallback());
    }
}
