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

const target = process.env.IMS_E2E_PREVIEW_TARGET;
if (target !== 'web' && target !== 'app') {
    throw new Error('Start preview through the Web target owner');
}
const clientDirectory = path.resolve(process.cwd(),
    target === 'app' ? '../web/build-app/client' : '../web/build/client');
const frontendFiles = new Set(listFrontendFiles(clientDirectory));
if (!frontendFiles.has('index.html') || !frontendFiles.has('__spa-fallback.html')) {
    throw new Error(`Build the ${target} E2E client before starting its preview`);
}
const files = new NodeStaticAssets(clientDirectory);
const assets = new FrontendStaticAssets(files, frontendFiles);
const spaRoutes: unknown = JSON.parse(process.env.IMS_APP_E2E_SPA_ROUTES || '[]');
if (
    !Array.isArray(spaRoutes) ||
    (target === 'app' ? spaRoutes.length === 0 : spaRoutes.length !== 0) ||
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
const webOnlyRoutes: unknown = JSON.parse(process.env.IMS_APP_E2E_WEB_ONLY_ROUTES || '[]');
if (!Array.isArray(webOnlyRoutes) || !webOnlyRoutes.every((route) =>
    typeof route === 'string' && /^\/[a-z0-9_/:*\-]+$/i.test(route),
) || (target === 'web' ? webOnlyRoutes.length !== 0 : webOnlyRoutes.length === 0)) {
    throw new Error('Invalid App excluded routes');
}
for (const route of webOnlyRoutes) {
    app.all(route, (context) => context.text('Not Found', 404));
}
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
const port = target === 'app' ? 1420 : 4173;
server.listen(port, '127.0.0.1', () => {
    console.log(`${target} E2E static preview listening at http://127.0.0.1:${port}`);
});
process.on('SIGTERM', () => server.close());
process.on('SIGINT', () => server.close());
