import { createHash } from 'node:crypto';
import type {
    FudabaPlaceReverseQuery,
    FudabaPlaceReverseResponse,
    FudabaPlaceReverseResult,
} from '@imsweb/contracts/fudaba';
import type { FudabaPlaceGeocodingProvider } from '@/domains/community/fudaba/map-delivery/contracts/place-geocoding';

const MUNICIPALITIES = new Set(['北京市', '上海市', '天津市', '重庆市']);

function record(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown> : {};
}

function text(value: unknown): string {
    return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
}

function name(value: unknown): string {
    return text(record(value).name);
}

function place(
    point: FudabaPlaceReverseQuery,
    id: string,
    label: string,
    address: string,
    city: string,
): FudabaPlaceReverseResult | null {
    if (!address && !city) return null;
    return {
        id,
        label: label || address || city,
        city,
        address,
        // A reverse result describes the user's point, never the feature center.
        location: { ...point, precision: 'exact' },
    };
}

function mapboxPlace(payload: unknown, point: FudabaPlaceReverseQuery): FudabaPlaceReverseResult | null {
    const features = record(payload).features;
    if (!Array.isArray(features)) throw new Error('Invalid geocoding response');
    for (const feature of features) {
        const properties = record(record(feature).properties);
        const context = record(properties.context);
        const region = name(context.region);
        const preferred = text(properties.name_preferred) || text(properties.name);
        const city = MUNICIPALITIES.has(region) ? region
            : name(context.place) || (properties.feature_type === 'place' ? preferred : '');
        const address = text(properties.full_address);
        const result = place(point, text(properties.mapbox_id) || 'mapbox:reverse', preferred, address, city);
        if (result) return result;
    }
    return null;
}

function nominatimPlace(payload: unknown, point: FudabaPlaceReverseQuery): FudabaPlaceReverseResult | null {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        throw new Error('Invalid geocoding response');
    }
    const source = record(payload);
    const parts = record(source.address);
    const state = text(parts.state);
    const city = text(parts.country_code).toLowerCase() === 'cn' && MUNICIPALITIES.has(state)
        ? state : text(parts.city) || text(parts.town) || text(parts.municipality) || text(parts.village);
    const address = text(source.display_name);
    return place(point, `nominatim:${text(source.osm_type) || 'place'}:${String(source.osm_id ?? source.place_id ?? 'reverse')}`,
        text(source.name), address, city);
}

export function fudabaPlaceReverseCacheKey(
    provider: FudabaPlaceGeocodingProvider,
    point: FudabaPlaceReverseQuery,
): string {
    // Exact coordinate keys prevent nearby points from inheriting cached centers.
    // Credentials are only present inside the digest, never cache keys or logs.
    const digest = createHash('sha256').update(JSON.stringify([provider, point.longitude, point.latitude])).digest('hex');
    return `fudaba:place-reverse:v1:${digest}`;
}

export async function reverseFudabaPlaceProvider(
    fetcher: typeof globalThis.fetch,
    provider: FudabaPlaceGeocodingProvider,
    point: FudabaPlaceReverseQuery,
    signal: AbortSignal,
): Promise<FudabaPlaceReverseResponse> {
    const url = new URL(provider.provider === 'mapbox'
        ? 'https://api.mapbox.com/search/geocode/v6/reverse' : provider.endpoint);
    const headers: Record<string, string> = { accept: 'application/json' };
    if (provider.provider === 'mapbox') {
        url.searchParams.set('longitude', String(point.longitude));
        url.searchParams.set('latitude', String(point.latitude));
        url.searchParams.set('access_token', provider.accessToken);
        // This endpoint fills persistable office fields and caches results.
        url.searchParams.set('permanent', 'true');
        url.searchParams.set('language', 'zh-Hans');
    } else {
        url.searchParams.set('lon', String(point.longitude));
        url.searchParams.set('lat', String(point.latitude));
        url.searchParams.set('format', 'jsonv2');
        url.searchParams.set('addressdetails', '1');
        url.searchParams.set('accept-language', 'zh-CN');
        headers['accept-language'] = 'zh-CN';
        headers['user-agent'] = provider.userAgent;
    }
    signal.throwIfAborted();
    const response = await fetcher(url, { headers, signal });
    if (!response.ok) throw new Error('Geocoding provider request failed');
    const payload: unknown = await response.json();
    signal.throwIfAborted();
    return {
        place: provider.provider === 'mapbox' ? mapboxPlace(payload, point) : nominatimPlace(payload, point),
        attribution: provider.provider === 'mapbox'
            ? { text: '© Mapbox', url: 'https://www.mapbox.com/about/maps/' }
            : { text: '© OpenStreetMap contributors', url: 'https://www.openstreetmap.org/copyright' },
    };
}
