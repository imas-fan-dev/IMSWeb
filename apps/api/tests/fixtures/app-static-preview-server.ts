import { createServer } from 'node:http';
import path from 'node:path';
import { getRequestListener } from '@hono/node-server';
import { Hono } from 'hono';
import {
    FrontendStaticAssets,
    listFrontendFiles,
    NodeStaticAssets,
} from '@/infra/http/filesystem/static-assets';
import { isSensitiveRequestPath } from '@/middleware/static-path-policy';

const clientDirectory = path.resolve(process.cwd(), '../web/build-app/client');
const frontendFiles = new Set(listFrontendFiles(clientDirectory));
if (!frontendFiles.has('index.html') || !frontendFiles.has('__spa-fallback.html')) {
    throw new Error('Build the App E2E client before starting its preview');
}
const files = new NodeStaticAssets(clientDirectory);
const assets = new FrontendStaticAssets(files, frontendFiles);
const spaRoutes: unknown = JSON.parse(process.env.IMS_APP_E2E_SPA_ROUTES || '[]');
if (
    !Array.isArray(spaRoutes) ||
    spaRoutes.length === 0 ||
    !spaRoutes.every((route) =>
        typeof route === 'string' &&
        /^[a-z0-9_/:\-]+$/i.test(route) &&
        !route.startsWith('/') &&
        !route.includes('//'),
    )
) {
    throw new Error('Start App preview through the Web route-metadata owner');
}
const app = new Hono();
app.on(
    ['GET', 'HEAD'],
    spaRoutes.flatMap((route: string) => [`/${route}`, `/${route}/`]),
    async (context) => {
        if (isSensitiveRequestPath(context.req.path)) return context.text('Not Found', 404);
        return files.fetch(new Request(new URL('/__spa-fallback.html', context.req.url), {
            method: context.req.method,
            headers: context.req.raw.headers,
        }));
    },
);
app.all('*', async (context) => {
    if (isSensitiveRequestPath(context.req.path)) {
        return context.text('Not Found', 404);
    }
    return assets.fetch(context.req.raw);
});
const server = createServer(getRequestListener(app.fetch));
server.listen(1420, '127.0.0.1', () => {
    console.log('App E2E static preview listening at http://127.0.0.1:1420');
});
process.on('SIGTERM', () => server.close());
process.on('SIGINT', () => server.close());
