import type { FudabaPlaceReverseQuery, FudabaPlaceReverseResponse } from '@imsweb/contracts/fudaba';
import type { AppEnvironment } from '@/app';
import type { ValidatedRequestContext } from '@/middleware/request-validation';
import { services } from '@/middleware/hono-context';
import { readFudabaPlaceGeocodingProvider } from '@/domains/community/fudaba/map-delivery/contracts/place-geocoding';
import { fudabaPlaceReverseCacheKey, reverseFudabaPlaceProvider } from '@/domains/community/fudaba/locations/place-reverse';

export async function handleReverseFudabaPlace(
    c: ValidatedRequestContext<AppEnvironment, 'query', FudabaPlaceReverseQuery>,
): Promise<Response> {
    c.header('Cache-Control', 'private, no-store');
    const runtime = services(c);
    if (!runtime.fetch || !runtime.cache || !runtime.rateLimiter) {
        return c.json({ success: false, code: 'FUDABA_PLACE_REVERSE_UNAVAILABLE' }, 503);
    }
    const point = c.req.valid('query');
    const signal = AbortSignal.any([c.req.raw.signal, AbortSignal.timeout(8_000)]);
    try {
        signal.throwIfAborted();
        const provider = await readFudabaPlaceGeocodingProvider(runtime);
        if (!provider) return c.json({ success: false, code: 'FUDABA_PLACE_REVERSE_UNAVAILABLE' }, 503);
        const accountLimit = await runtime.rateLimiter.consume(
            'fudaba-place-reverse-account', c.get('platformUser')?.id ?? `backoffice:${c.get('backofficeUser')!.id}`, 120, 60 * 60,
        );
        if (!accountLimit.allowed) {
            c.header('Retry-After', String(Math.max(1, Math.ceil((accountLimit.resetAt - Date.now()) / 1000))));
            return c.json({ success: false, code: 'FUDABA_PLACE_REVERSE_BUSY' }, 429);
        }
        const key = fudabaPlaceReverseCacheKey(provider, point);
        let cached: FudabaPlaceReverseResponse | null = null;
        try {
            const value = await runtime.cache.get(key, { signal });
            if (value) cached = JSON.parse(value) as FudabaPlaceReverseResponse;
        } catch {
            // Provider remains usable during a cache outage.
        }
        signal.throwIfAborted();
        if (cached && cached.attribution && (cached.place === null || (
            cached.place.location?.longitude === point.longitude && cached.place.location.latitude === point.latitude
        ))) return c.json(cached);
        const limit = await runtime.rateLimiter.consume(
            provider.provider === 'nominatim' ? 'fudaba-geocoding-provider' : 'fudaba-mapbox-geocoding-provider',
            'global', provider.provider === 'nominatim' ? 1 : 20, 1,
        );
        if (!limit.allowed) {
            c.header('Retry-After', String(Math.max(1, Math.ceil((limit.resetAt - Date.now()) / 1000))));
            return c.json({ success: false, code: 'FUDABA_PLACE_REVERSE_BUSY' }, 429);
        }
        const body = await reverseFudabaPlaceProvider(runtime.fetch, provider, point, signal);
        signal.throwIfAborted();
        try {
            await runtime.cache.set(key, JSON.stringify(body), 24 * 60 * 60, { signal });
        } catch {
            // A cache write failure does not discard a resolved address.
        }
        signal.throwIfAborted();
        return c.json(body);
    } catch {
        // Never return or log an upstream URL/error: it can contain the token.
        return c.json({ success: false, code: signal.aborted
            ? 'FUDABA_PLACE_REVERSE_CANCELLED' : 'FUDABA_PLACE_REVERSE_FAILED' }, 502);
    }
}
