import type { FudabaMapProviderConfig } from '@imsweb/contracts/fudaba';
import type { RuntimeServices } from '@/ports/runtime-services';
import { readFudabaMapDelivery } from '@/domains/community/fudaba/map-delivery/map-delivery-store';

export type FudabaPlaceGeocodingProvider =
    | { provider: 'mapbox'; accessToken: string }
    | { provider: 'nominatim'; endpoint: string; userAgent: string };

/** Use the selected basemap's credentials, including the fixed regional basemap. */
export async function readFudabaPlaceGeocodingProvider(
    runtime: RuntimeServices,
): Promise<FudabaPlaceGeocodingProvider | null> {
    const seeds = runtime.config?.fudabaMapSources ?? [];
    let active: FudabaMapProviderConfig | undefined = seeds[0];
    if (runtime.storage) {
        try {
            const delivery = await readFudabaMapDelivery(runtime.storage, seeds);
            const sourceId = delivery.routing?.overseasSourceId ?? delivery.activeSourceId;
            active = delivery.sources.find((source) => source.id === sourceId);
        } catch {
            // Match the map-config delivery's fallback to the first seed.
            active = seeds[0];
        }
    }
    if (active?.provider === 'mapbox' && active.accessToken) {
        return { provider: 'mapbox', accessToken: active.accessToken };
    }
    const geocoding = runtime.config?.fudabaGeocoding;
    if (geocoding?.enabled && geocoding.endpoint && geocoding.userAgent) {
        // This is an explicitly configured compatible service, never a default
        // public endpoint. Preserve a self-hosted installation's base path.
        try {
            const endpoint = new URL(geocoding.endpoint);
            endpoint.pathname = endpoint.pathname.replace(/\/search\/?$/, '/reverse');
            if (!endpoint.pathname.endsWith('/reverse')) return null;
            endpoint.search = '';
            return { provider: 'nominatim', endpoint: endpoint.toString(), userAgent: geocoding.userAgent };
        } catch {
            return null;
        }
    }
    return null;
}
