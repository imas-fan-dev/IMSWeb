import { describe, expect, it } from 'vitest';
import { decodeStoredMapProvider, describeMapProvider, describeRegionalSearchMap, mapSourceRequestError } from '../../src/domains/community/fudaba/map-delivery/map-provider-policy';
import { readFudabaMapDelivery } from '../../src/domains/community/fudaba/map-delivery/map-delivery-store';
import { seedFudabaMapSources } from '../../src/domains/community/fudaba/map-delivery/map-delivery-bootstrap';

describe('map provider policies', () => {
    const maplibre = { provider: 'maplibre' as const, styleUrl: 'https://tiles.openfreemap.org/styles/positron' };
    const amap = { provider: 'amap' as const, apiKey: 'public-key-1234567890', securityProxyUrl: '/_AMapService', mapStyle: 'amap://styles/whitesmoke' };
    const mapbox = { provider: 'mapbox' as const, accessToken: 'pk.public-mapbox-token-1234567890', styleUrl: 'mapbox://styles/mapbox/streets-v12' };
    const read = (envelope: unknown) => {
        const body = new TextEncoder().encode(JSON.stringify(envelope));
        return { get: async () => ({ body, size: body.length, etag: 'retained-revision', contentType: 'application/json' }) };
    };

    it('round-trips explicit providers without compatibility projections', () => {
        for (const config of [maplibre, amap, mapbox]) {
            expect(decodeStoredMapProvider({ id: 'source', name: 'Source', ...config })).toEqual(config);
            expect(describeMapProvider(config).publicConfig).toEqual(config);
        }
        expect(describeMapProvider(amap)).toMatchObject({ styleUrl: null, auditLabel: 'amap' });
        expect(describeMapProvider(mapbox).styleUrl).toBe(mapbox.styleUrl);
    });

    it('rejects omitted/unknown providers, cross-provider fields and private security fields', () => {
        for (const source of [
            { styleUrl: maplibre.styleUrl }, { ...maplibre, provider: 'unknown' },
            { ...maplibre, provider: null }, { ...maplibre, provider: '__proto__' },
            { ...amap, accessToken: mapbox.accessToken }, { ...amap, securityJsCode: 'server-only' },
            { ...mapbox, apiKey: amap.apiKey }, { ...amap, search: { provider: 'nominatim' } },
        ]) expect(() => decodeStoredMapProvider(source)).toThrow();
    });

    it('owns search routing and exposes only public provider credentials', () => {
        expect(describeMapProvider(maplibre).searchConfig).toEqual({ provider: 'nominatim' });
        expect(describeMapProvider(amap).searchConfig).toEqual({ provider: 'amap', apiKey: amap.apiKey, securityProxyUrl: amap.securityProxyUrl });
        expect(describeMapProvider(mapbox).searchConfig).toEqual({ provider: 'mapbox', accessToken: mapbox.accessToken });
    });

    it('retains source credentials for a fixed Mapbox basemap with mainland and overseas search routing', () => {
        const regional = describeRegionalSearchMap(amap, mapbox);
        expect(regional).toMatchObject({ provider: 'regional', defaultRegion: 'mainland', mainland: amap, overseas: mapbox });
        expect(regional.search).toEqual({ provider: 'federated', mainland: { provider: 'amap', apiKey: amap.apiKey, securityProxyUrl: amap.securityProxyUrl }, overseas: { provider: 'mapbox', accessToken: mapbox.accessToken } });
        expect(() => describeRegionalSearchMap(mapbox, amap)).toThrow();
    });

    it('owns provider request explanations after common metadata validation', () => {
        for (const config of [maplibre, amap, mapbox]) {
            const body = { ...config, name: 'Source', revision: null };
            expect(mapSourceRequestError({ ...body, extra: true })).toBe('地图源请求格式无效');
            expect(mapSourceRequestError({ ...body, name: '' })).toBe('地图源名称格式无效');
            expect(mapSourceRequestError({ ...body, revision: 123 })).toBe('地图源 revision 格式无效');
        }
        expect(mapSourceRequestError({ ...maplibre, name: 'Source', revision: null })).toBe('地图样式地址格式无效');
        expect(mapSourceRequestError({ ...amap, name: 'Source', revision: null })).toContain('高德地图配置');
        expect(mapSourceRequestError({ ...mapbox, name: 'Source', revision: null })).toContain('Mapbox 配置');
    });

    it('bootstraps every provider by policy identity and policy-owned names', () => {
        const extra = { ...mapbox, styleUrl: 'mapbox://styles/owner/other' };
        const sources = seedFudabaMapSources([maplibre, amap, mapbox, maplibre, extra], 4);
        expect(sources.map((source) => source.provider)).toEqual(['maplibre', 'amap', 'mapbox', 'mapbox']);
        expect(sources.map((source) => source.id)).toEqual(['seed-1', 'seed-2', 'seed-3', 'seed-4']);
        expect(new Set(sources.map((source) => source.name.toLowerCase())).size).toBe(4);
        expect(sources[3]?.name).toBe('Mapbox (2)');
        expect(seedFudabaMapSources([amap, mapbox], 1)).toHaveLength(1);
        expect(describeMapProvider(amap).identity).not.toBe(describeMapProvider({ ...amap, mapStyle: 'amap://styles/dark' }).identity);
        expect(describeMapProvider(mapbox).identity).not.toBe(describeMapProvider(extra).identity);
        expect(describeMapProvider(amap).auditLabel).not.toContain(amap.apiKey);
    });

    it('reads only version 4 and never imports older envelopes, retaining CAS revision on recovery', async () => {
        const source = { id: 'configured', name: 'Configured', ...amap };
        const current = { version: 4, sources: [source], activeSourceId: source.id, updatedAt: '2026-10-19T00:00:00.000Z' };
        expect(await readFudabaMapDelivery(read(current), [])).toMatchObject({ sources: [source], activeSourceId: source.id, revision: 'retained-revision' });
        for (const envelope of [
            ...[0, 1, 2, 3, 999].map((version) => ({ ...current, version })),
            { styleUrl: maplibre.styleUrl }, { ...current, unexpected: true },
            { ...current, sources: [{ id: 'missing-provider', name: 'Invalid', styleUrl: maplibre.styleUrl }] },
            { ...current, updatedAt: 'invalid' },
        ]) {
            expect(await readFudabaMapDelivery(read(envelope), [maplibre])).toMatchObject({
                activeSourceId: 'seed-1', revision: 'retained-revision', sources: [{ provider: 'maplibre', styleUrl: maplibre.styleUrl }],
            });
        }
    });
});
