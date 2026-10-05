import { createHonoApp } from '../../../../apps/api/src/app';
import { parseFudabaGeocodingConfig } from '../../../../apps/api/src/config/env';
import { createValkeyClient, ValkeyCache } from '../../../../apps/api/src/infra/cache/valkey/cache';
import { ValkeyRateLimiter } from '../../../../apps/api/src/infra/cache/valkey/rate-limiter';
import { fudabaPlaceSearchResponseSchema } from '../../../../packages/contracts/src/fudaba';

// Run from apps/api with its tsconfig. Only loopback Valkey and the explicit
// public provider are used; no production configuration or database is loaded.
async function main() {
    const keyPrefix = 'imsweb:map-search-verification:';
    const client = await createValkeyClient({ backend: 'valkey', valkeyUrl: 'redis://127.0.0.1:6379', keyPrefix, connectTimeoutMs: 5000 });
    const cache = new ValkeyCache(client, { keyPrefix });
    const rateLimiter = new ValkeyRateLimiter(client, { keyPrefix });
    let calls = 0;
    const config = parseFudabaGeocodingConfig({
        IMS_FUDABA_GEOCODING_ENDPOINT: 'https://nominatim.openstreetmap.org/search',
        IMS_FUDABA_GEOCODING_USER_AGENT: 'IMSWeb local place search verification (https://github.com/IMSWeb)',
        IMS_FUDABA_GEOCODING_COUNTRY_CODES: 'cn',
    });
    const app = createHonoApp(() => ({
        cache,
        rateLimiter,
        fetch: async (url, init) => {
            calls++;
            const response = await globalThis.fetch(url, init);
            console.log('upstream HTTP', response.status);
            return response;
        },
        config: { fudabaPublicReadEnabled: true, fudabaMapEnabled: true, fudabaWriteEnabled: false, fudabaGeocoding: config },
    }));
    try {
        const query = process.argv[2] || '西岸艺术中心';
        const url = 'http://127.0.0.1:3206/api/community/exchange/places/search?q=' + encodeURIComponent(query);
        const first = await app.request(url);
        const body = await first.json();
        console.log('application HTTP', first.status);
        if (!first.ok) {
            console.log(JSON.stringify(body));
            process.exitCode = 1;
            return;
        }
        const parsed = fudabaPlaceSearchResponseSchema.parse(body);
        const exactContract = JSON.stringify(parsed) === JSON.stringify(body);
        console.log(JSON.stringify({ query, items: parsed.items, attribution: parsed.attribution, exactContract }));
        const second = await app.request(url);
        console.log('second application HTTP', second.status, 'total upstream calls', calls);
        if (!parsed.items.length || !exactContract || second.status !== 200 || calls > 1) process.exitCode = 1;
        const prefix = `imsweb:map-search-limiter-smoke:${Date.now()}:`;
        const replicaA = new ValkeyRateLimiter(client, { keyPrefix: prefix });
        const replicaB = new ValkeyRateLimiter(client, { keyPrefix: prefix });
        const limitA = await replicaA.consume('fudaba-geocoding-provider', 'global', 1, 1);
        const limitB = await replicaB.consume('fudaba-geocoding-provider', 'global', 1, 1);
        console.log('shared Valkey limiter replicas', JSON.stringify({ firstAllowed: limitA.allowed, secondAllowed: limitB.allowed }));
        if (!limitA.allowed || limitB.allowed) process.exitCode = 1;
    } finally {
        await cache.close();
    }
}
void main().catch((error: Error) => {
    console.error(error.message);
    process.exitCode = 1;
});
