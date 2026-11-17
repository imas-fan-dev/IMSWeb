import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHonoApp } from '@/app';
import type { RuntimeServices } from '@/ports/runtime-services';
import type { ObjectStorage } from '@/ports/object-storage';
import {
    fudabaErrorResponseSchema,
    fudabaPlaceReverseQuerySchema,
    fudabaPlaceReverseResponseSchema,
} from '@imsweb/contracts/fudaba';
import { assertContractJson } from '../contracts/contract-json';

const TOKEN = 'pk.reverse-test-public-token';
const POINT = { longitude: 121.47370123, latitude: 31.23041678 };
const PATH = '/api/community/exchange/places/reverse';
const MAPBOX = { provider: 'mapbox' as const, accessToken: TOKEN, styleUrl: 'mapbox://styles/mapbox/streets-v12' };
const ATTRIBUTION = { text: '© Mapbox', url: 'https://www.mapbox.com/about/maps/' };
const feature = (properties: Record<string, unknown>) => ({ properties });
const fullPlace = feature({
    mapbox_id: 'address.123',
    feature_type: 'address',
    full_address: '中华人民共和国上海市黄浦区200021',
    name: '人民广场',
    coordinates: { longitude: 120, latitude: 30 },
    context: { place: { name: '上海市' }, district: { name: '黄浦区' }, locality: { name: '南京东路街道' } },
});

function fixture() {
    const entries = new Map<string, string>();
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ features: [fullPlace] }));
    const consume = vi.fn(async () => ({ allowed: true, remaining: 1, resetAt: Date.now() + 1000 }));
    const runtime: RuntimeServices = {
        config: { fudabaPublicReadEnabled: true, fudabaMapEnabled: true, fudabaMapSources: [MAPBOX] },
        fetch: fetcher,
        rateLimiter: { consume },
        cache: {
            get: vi.fn(async (key) => entries.get(key) ?? null),
            set: vi.fn(async (key, value) => { entries.set(key, value); }),
            delete: vi.fn(async () => {}), ping: vi.fn(async () => {}), close: vi.fn(async () => {}),
        },
        platformTokens: {
            sign: async () => 'owner-token',
            verify: async () => ({
                iss: 'imsweb', aud: 'ims-platform', kind: 'platform', id: 'owner', tokenVersion: 0,
                sessionId: 'session', csrfSecret: 'csrf', jti: 'access', iat: 0, exp: 9999999999,
            }),
        },
        platformAccounts: {
            findRefreshSessionById: async () => ({ account_id: 'owner', expires_at: Date.now() + 60000, revoked_at: null }),
            findAccountWithProfileById: async () => ({ account: { id: 'owner', token_version: 0, status: 'active' } }),
        } as unknown as NonNullable<RuntimeServices['platformAccounts']>,
    };
    const app = createHonoApp(() => runtime);
    function request(query: string = new URLSearchParams({ longitude: String(POINT.longitude), latitude: String(POINT.latitude) }).toString(), signal?: AbortSignal) {
        return app.request(new Request(`http://ims.test${PATH}?${query}`, { headers: { authorization: 'Bearer owner-token' }, signal }));
    }
    return { app, runtime, fetcher, entries, consume, request };
}

afterEach(() => vi.restoreAllMocks());

describe('authenticated persistable Fudaba reverse geocoding', () => {
    it('rejects anonymous callers even when public map reads are enabled', async () => {
        const f = fixture();
        await assertContractJson(await f.app.request(`${PATH}?longitude=121&latitude=31`), 401, fudabaErrorResponseSchema);
        expect(f.fetcher).not.toHaveBeenCalled();
    });

    it.each([
        'longitude=181&latitude=0', 'longitude=-181&latitude=0',
        'longitude=0&latitude=91', 'longitude=0&latitude=-91',
        'longitude=&latitude=0', 'longitude=NaN&latitude=0', 'longitude=Infinity&latitude=0',
        'longitude=0', 'longitude=0&latitude=0&city=Shanghai', 'longitude=0&longitude=1&latitude=0',
    ])('strictly validates query %s before upstream access', async (query) => {
        const f = fixture();
        await assertContractJson(await f.request(query), 400, fudabaErrorResponseSchema);
        expect(f.fetcher).not.toHaveBeenCalled();
    });

    it('accepts boundary coordinates and rejects nonnumeric contract inputs and unknown response fields', () => {
        expect(fudabaPlaceReverseQuerySchema.parse({ longitude: '-180', latitude: '90' })).toEqual({ longitude: -180, latitude: 90 });
        for (const longitude of [null, true, [], {}, ' ']) {
            expect(fudabaPlaceReverseQuerySchema.safeParse({ longitude, latitude: 0 }).success).toBe(false);
        }
        expect(fudabaPlaceReverseResponseSchema.safeParse({ place: null, attribution: null, extra: true }).success).toBe(false);
    });

    it('requests official permanent Mapbox reverse, prioritizes city, caches without moving the point', async () => {
        const f = fixture();
        const first = await f.request();
        expect(first.headers.get('cache-control')).toContain('no-store');
        const body = await assertContractJson(first, 200, fudabaPlaceReverseResponseSchema);
        expect(body).toEqual({
            place: { id: 'address.123', label: '人民广场', city: '上海市', address: '中华人民共和国上海市黄浦区200021', location: { ...POINT, precision: 'exact' } },
            attribution: ATTRIBUTION,
        });
        const [input, init] = f.fetcher.mock.calls[0]!;
        const url = new URL(String(input));
        expect(url.origin + url.pathname).toBe('https://api.mapbox.com/search/geocode/v6/reverse');
        expect(Object.fromEntries(url.searchParams)).toEqual({
            longitude: String(POINT.longitude), latitude: String(POINT.latitude), access_token: TOKEN, permanent: 'true', language: 'zh-Hans',
        });
        expect(init?.signal).toBeInstanceOf(AbortSignal);
        expect(await assertContractJson(await f.request(), 200, fudabaPlaceReverseResponseSchema)).toEqual(body);
        expect(f.fetcher).toHaveBeenCalledTimes(1);
        expect([...f.entries.keys()][0]).not.toContain(TOKEN);
        expect([...f.entries.values()][0]).not.toContain(TOKEN);
        f.fetcher.mockResolvedValueOnce(Response.json({ features: [fullPlace] }));
        const nearby = await assertContractJson(await f.request(`longitude=${POINT.longitude + 0.00000001}&latitude=${POINT.latitude}`), 200, fudabaPlaceReverseResponseSchema);
        expect(nearby.place?.location.longitude).toBe(POINT.longitude + 0.00000001);
        expect(f.fetcher).toHaveBeenCalledTimes(2);
    });

    it.each([
        [{ feature_type: 'place', name: '上海市' }, { city: '上海市', address: '' }],
        [{ full_address: '某路 1 号' }, { city: '', address: '某路 1 号' }],
        [{ context: { place: { name: '徐汇区' }, region: { name: '上海市' } } }, { city: '上海市', address: '' }],
        [{ name: '不明地物' }, null],
    ])('preserves partial results without manufacturing precise addresses: %j', async (properties, expected) => {
        const f = fixture();
        f.fetcher.mockResolvedValueOnce(Response.json({ features: [feature(properties)] }));
        const body = await assertContractJson(await f.request(), 200, fudabaPlaceReverseResponseSchema);
        if (expected) {
            expect(body.place).toMatchObject(expected);
            expect(body.place?.location).toEqual({ ...POINT, precision: 'exact' });
        } else expect(body.place).toBeNull();
    });

    it('returns null for empty features and sanitizes failed, malformed, and throwing upstream responses', async () => {
        const f = fixture();
        f.fetcher.mockResolvedValueOnce(Response.json({ features: [] }));
        expect(await assertContractJson(await f.request(), 200, fudabaPlaceReverseResponseSchema)).toEqual({ place: null, attribution: ATTRIBUTION });
        for (const failure of [Response.json({ message: TOKEN }, { status: 403 }), Response.json({ message: TOKEN }), new Error(`https://api.mapbox.com/?access_token=${TOKEN}`)]) {
            f.entries.clear();
            const log = vi.spyOn(console, 'error').mockImplementation(() => {});
            if (failure instanceof Error) f.fetcher.mockRejectedValueOnce(failure);
            else f.fetcher.mockResolvedValueOnce(failure);
            const body = await assertContractJson(await f.request(), 502, fudabaErrorResponseSchema);
            expect(body).toEqual({ success: false, code: 'FUDABA_PLACE_REVERSE_FAILED' });
            expect(JSON.stringify(log.mock.calls)).not.toContain(TOKEN);
        }
    });

    it('propagates in-flight cancellation to upstream and never caches cancelled results', async () => {
        const f = fixture();
        let admit!: () => void;
        const admitted = new Promise<void>((resolve) => { admit = resolve; });
        let upstreamSignal: AbortSignal | null | undefined;
        f.fetcher.mockImplementationOnce(async (_input, init) => {
            upstreamSignal = init?.signal;
            admit();
            return new Promise<Response>((_resolve, reject) => {
                init?.signal?.addEventListener('abort', () => reject(init.signal!.reason), { once: true });
            });
        });
        const controller = new AbortController();
        const pending = f.request(undefined, controller.signal);
        await admitted;
        controller.abort();
        expect(await assertContractJson(await pending, 502, fudabaErrorResponseSchema)).toEqual({ success: false, code: 'FUDABA_PLACE_REVERSE_CANCELLED' });
        expect(upstreamSignal?.aborted).toBe(true);
        expect(f.entries.size).toBe(0);
    });

    it('applies per-account and provider limits with retry-after, and tolerates cache outages', async () => {
        const f = fixture();
        f.consume.mockResolvedValueOnce({ allowed: false, remaining: 0, resetAt: Date.now() + 5000 });
        const limited = await f.request();
        expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0);
        await assertContractJson(limited, 429, fudabaErrorResponseSchema);
        expect(f.fetcher).not.toHaveBeenCalled();
        f.consume.mockImplementation(async (bucket?: string) => ({ allowed: bucket !== 'fudaba-mapbox-geocoding-provider', remaining: 0, resetAt: Date.now() + 1000 }));
        await assertContractJson(await f.request(), 429, fudabaErrorResponseSchema);
        f.consume.mockResolvedValue({ allowed: true, remaining: 1, resetAt: Date.now() + 1000 });
        vi.mocked(f.runtime.cache!.get).mockRejectedValueOnce(new Error('cache unavailable'));
        vi.mocked(f.runtime.cache!.set).mockRejectedValueOnce(new Error('cache unavailable'));
        await assertContractJson(await f.request(), 200, fudabaPlaceReverseResponseSchema);
    });

    it('does not enable a default public service for non-Mapbox maps or missing configuration', async () => {
        const f = fixture();
        f.runtime.config!.fudabaMapSources = [{ provider: 'maplibre', styleUrl: '/maps/test.json' }];
        await assertContractJson(await f.request(), 503, fudabaErrorResponseSchema);
        f.runtime.config!.fudabaMapSources = [{ provider: 'amap', apiKey: 'a'.repeat(32), securityProxyUrl: '/api/community/exchange/map/amap/_AMapService', mapStyle: 'amap://styles/normal' }];
        await assertContractJson(await f.request(), 503, fudabaErrorResponseSchema);
        expect(f.fetcher).not.toHaveBeenCalled();
    });

    it('uses the stored active Mapbox source and the regional Mapbox basemap source', async () => {
        const f = fixture();
        const sources = [
            { id: 'mainland', name: 'Mainland', provider: 'amap', apiKey: 'a'.repeat(32), securityProxyUrl: '/api/community/exchange/map/amap/_AMapService', mapStyle: 'amap://styles/normal' },
            { id: 'overseas', name: 'Overseas', ...MAPBOX, accessToken: 'pk.selected-mapbox-token' },
        ];
        const stored = { version: 4, sources, activeSourceId: 'overseas', updatedAt: new Date().toISOString() };
        const get = vi.fn(async () => ({ body: new TextEncoder().encode(JSON.stringify(stored)), etag: 'revision' }));
        f.runtime.storage = { get } as unknown as ObjectStorage;
        f.runtime.config!.fudabaMapSources = [{ provider: 'maplibre', styleUrl: '/maps/test.json' }];
        await assertContractJson(await f.request(), 200, fudabaPlaceReverseResponseSchema);
        expect(new URL(String(f.fetcher.mock.calls[0]![0])).searchParams.get('access_token')).toBe('pk.selected-mapbox-token');
        Object.assign(stored, { activeSourceId: 'mainland', routing: { mainlandSourceId: 'mainland', overseasSourceId: 'overseas' } });
        f.entries.clear();
        f.fetcher.mockResolvedValueOnce(Response.json({ features: [fullPlace] }));
        await assertContractJson(await f.request(), 200, fudabaPlaceReverseResponseSchema);
        expect(new URL(String(f.fetcher.mock.calls[1]![0])).searchParams.get('access_token')).toBe('pk.selected-mapbox-token');
    });

    it('reuses only explicit Nominatim configuration and the shared global one-request-per-second bucket', async () => {
        const f = fixture();
        f.runtime.config!.fudabaMapSources = [{ provider: 'maplibre', styleUrl: '/maps/test.json' }];
        f.runtime.config!.fudabaGeocoding = { enabled: true, endpoint: 'https://geocoder.example.test/nominatim/search', userAgent: 'IMSWeb tests contact@example.test', countryCodes: '' };
        f.fetcher.mockResolvedValueOnce(Response.json({ osm_type: 'way', osm_id: 2, lat: '30', lon: '120', display_name: '徐汇区，上海市，中国', address: { city: '徐汇区', state: '上海市', country_code: 'cn' } }));
        const body = await assertContractJson(await f.request(), 200, fudabaPlaceReverseResponseSchema);
        expect(body.place).toMatchObject({ city: '上海市', location: { ...POINT, precision: 'exact' } });
        expect(body.attribution?.text).toContain('OpenStreetMap');
        const [input, init] = f.fetcher.mock.calls[0]!;
        const url = new URL(String(input));
        expect(url.origin + url.pathname).toBe('https://geocoder.example.test/nominatim/reverse');
        expect(Object.fromEntries(url.searchParams)).toEqual({ lon: String(POINT.longitude), lat: String(POINT.latitude), format: 'jsonv2', addressdetails: '1', 'accept-language': 'zh-CN' });
        expect(new Headers(init?.headers).get('user-agent')).toContain('contact@example.test');
        expect(f.consume).toHaveBeenCalledWith('fudaba-geocoding-provider', 'global', 1, 1);
    });
});
