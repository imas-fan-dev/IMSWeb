import { createServer } from 'node:http';
import path from 'node:path';
import { getRequestListener } from '../../../../apps/api/node_modules/@hono/node-server';
import { createHonoApp } from '../../../../apps/api/src/app';
import { parseFudabaGeocodingConfig } from '../../../../apps/api/src/config/env';
import { createValkeyClient, ValkeyCache } from '../../../../apps/api/src/infra/cache/valkey/cache';
import { ValkeyRateLimiter } from '../../../../apps/api/src/infra/cache/valkey/rate-limiter';
import { FrontendStaticAssets, NodeStaticAssets, listFrontendFiles } from '../../../../apps/api/src/infra/http/filesystem/static-assets';

// Validation only: serve the real Hono search route with loopback Valkey and an
// explicitly selected public provider. Directory fixtures belong to Playwright.
async function main() {
    const root = path.resolve('../..');
    const directory = path.join(root, 'apps/web/build-app/client');
    const staticAssets = new FrontendStaticAssets(new NodeStaticAssets(directory), new Set(listFrontendFiles(directory)));
    const keyPrefix = 'imsweb:map-search-browser-verification:';
    const client = await createValkeyClient({ backend: 'valkey', valkeyUrl: 'redis://127.0.0.1:6379', keyPrefix, connectTimeoutMs: 5000 });
    const cache = new ValkeyCache(client, { keyPrefix });
    const rateLimiter = new ValkeyRateLimiter(client, { keyPrefix });
    const fudabaGeocoding = parseFudabaGeocodingConfig({
        IMS_FUDABA_GEOCODING_ENDPOINT: 'https://nominatim.openstreetmap.org/search',
        IMS_FUDABA_GEOCODING_USER_AGENT: 'IMSWeb local browser place search verification (https://github.com/IMSWeb)',
        IMS_FUDABA_GEOCODING_COUNTRY_CODES: 'cn',
    });
    const app = createHonoApp(() => ({
        cache,
        rateLimiter,
        fetch: async (url, init) => {
            const response = await globalThis.fetch(url, init);
            console.log(JSON.stringify({ event: 'upstream', status: response.status, userAgent: new Headers(init?.headers).get('User-Agent') }));
            return response;
        },
        config: {
            fudabaPublicReadEnabled: true,
            fudabaMapEnabled: true,
            fudabaWriteEnabled: false,
            fudabaGeocoding,
            fudabaMapStyleUrl: 'https://tiles.openfreemap.org/styles/liberty',
            fudabaMapStyleUrls: [],
        },
    }), { requestLogging: true });
    const apiServer = createServer(getRequestListener(app.fetch)).listen(3206, '127.0.0.1');
    const appServer = createServer(getRequestListener((request) => staticAssets.fetch(request))).listen(4187, '127.0.0.1');
    console.log('Validation API listening on 3206; packaged App listening on 4187');
    const shutdown = async () => {
        apiServer.closeAllConnections();
        appServer.closeAllConnections();
        apiServer.close();
        appServer.close();
        await cache.close();
    };
    process.once('SIGTERM', () => void shutdown());
    process.once('SIGINT', () => void shutdown());
}
void main().catch((error: Error) => { console.error(error.message); process.exitCode = 1; });
