import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { test } from 'vitest';

const PROJECT_ROOT = path.resolve(__dirname, '../..');
const REPOSITORY_ROOT = path.resolve(PROJECT_ROOT, '../..');
const FRONTEND_ROOT = path.join(REPOSITORY_ROOT, 'apps/web/build/client');
const SERVER_ROOT = path.join(PROJECT_ROOT, 'dist/server');

function requireBuild(file: string, command: string): void {
    assert.ok(
        fs.existsSync(file),
        `Required build output is missing: ${file}\nRun ${command} from ${REPOSITORY_ROOT}`
    );
}

requireBuild(
    path.join(FRONTEND_ROOT, '__spa-fallback.html'),
    'pnpm --filter @imsweb/web run build'
);
requireBuild(
    path.join(SERVER_ROOT, 'app.js'),
    'pnpm --filter @imsweb/api run build'
);

// The compiled server is loaded through the Node CommonJS loader, exactly as
// the previous `require` calls did, so a missing build fails at the same point
// with the same message instead of at import resolution time. Each binding is
// annotated with the type of the source module it was built from, so the
// compiled surface is still checked against `src/**` instead of widening to
// `any` at the CommonJS boundary.
const loadCompiled = createRequire(__filename);
const { createHonoApp }: typeof import('../../src/app') = loadCompiled(
    path.join(SERVER_ROOT, 'app.js')
);
const {
    FrontendStaticAssets,
    NodeStaticAssets
}: typeof import('../../src/infra/http/filesystem/static-assets') = loadCompiled(
    path.join(SERVER_ROOT, 'infra/http/filesystem/static-assets.js')
);
const { resolveFrontendRoute }: typeof import(
    '../../src/routing/frontend-route-policy'
) = loadCompiled(path.join(SERVER_ROOT, 'routing/frontend-route-policy.js'));
const {
    FRONTEND_PRERENDERED_ROUTES,
    FRONTEND_SPA_FALLBACK_PATTERNS
}: typeof import('../../src/routing/frontend-route-delivery') = loadCompiled(
    path.join(SERVER_ROOT, 'routing/frontend-route-delivery.js')
);

const SPA_ROUTE_CASES: Record<
    string,
    { positive: readonly string[]; negative: readonly string[]; injected?: boolean }
> = {
    admin: {
        positive: ['/admin', '/admin/', '/admin/login', '/admin/login/', '/admin/chronicle/pending'],
        negative: ['/admin%2Flogin', '/ad%6Din/login', '/admin//']
    },
    'information/:contentId': {
        positive: ['/information/info-example-001'],
        negative: ['/information/one/two']
    },
    'events/:eventId': {
        positive: ['/events/36', '/events/36/'],
        negative: ['/events/one/two', '/events/one%2Ftwo']
    },
    'chronicle/:activityId': {
        positive: [
            '/chronicle/2026%E5%B9%BF%E5%B7%9E%E5%81%B6%E5%83%8F%E5%A4%A7%E5%B8%88Only',
            '/chronicle/activity-1/'
        ],
        negative: ['/chronicle/one/two', '/chronicle/one%2Ftwo', '/chronicle/one%5Ctwo']
    },
    'account/me': {
        positive: ['/account/me', '/account/me/'],
        negative: []
    },
    'account/me/:section': {
        positive: ['/account/me/profile', '/account/me/namecards/', '/account/me/offices'],
        negative: ['/account/me/namecards/extra', '/account/me/one%2Ftwo']
    },
    'user/:accountId': {
        positive: ['/user/1', '/user/zheizhei/', '/user/34c6de2a-95a4-4c2f-8a9d-278a8a960df4'],
        negative: ['/user/one/two', '/user/one%2Ftwo']
    },
    'community/exchange/offices/:officeSlug': {
        positive: [
            '/community/exchange/offices/shanghai-weekend',
            '/community/exchange/offices/shanghai-weekend/'
        ],
        negative: [
            '/community/exchange/offices/one/two',
            '/community/exchange/offices/one%2Ftwo',
            '/community/exchange/offices/one%5Ctwo',
            '/community/exchange/offices//'
        ]
    },
    // 分享页由 API 的 HTML 出口注入 OGP（design §3.4），仍是同一份 SPA 文档：
    // 只断言路由策略把路径判给前端文档，不断言 HTTP 出口（那是 Hono 层的事）。
    'exchange/card/:slug': {
        injected: true,
        positive: ['/exchange/card/abcdefghijkl', '/exchange/card/abcdefghijkl/'],
        negative: ['/exchange/card/one/two', '/exchange/card//']
    },
    'exchange/:handle': {
        injected: true,
        positive: ['/exchange/haruka', '/exchange/1/', '/exchange/card'],
        negative: ['/exchange/one/two']
    }
};

function walkFiles(directory: string, root: string = directory): string[] {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const absolute = path.join(directory, entry.name);
        assert.equal(entry.isSymbolicLink(), false, `build/client contains a symlink: ${absolute}`);
        if (entry.isDirectory()) return walkFiles(absolute, root);
        assert.equal(entry.isFile(), true, `build/client contains a non-file: ${absolute}`);
        return [path.relative(root, absolute).split(path.sep).join('/')];
    });
}

const frontendFileList = walkFiles(FRONTEND_ROOT).sort();
const frontendFiles = new Set(frontendFileList);
const app = createHonoApp(() => ({
    staticAssets: new FrontendStaticAssets(
        new NodeStaticAssets(FRONTEND_ROOT),
        frontendFiles
    )
}));

async function request(pathname: string, init?: RequestInit) {
    return app.request(`http://ims.test${pathname}`, init);
}

async function assertFileResponse(
    pathname: string,
    file: string,
    init?: RequestInit
) {
    const response = await request(pathname, init);
    assert.equal(response.status, 200, pathname);
    assert.deepEqual(
        Buffer.from(await response.arrayBuffer()),
        fs.readFileSync(file),
        `${pathname} did not return ${file}`
    );
    return response;
}

test.describe('frontend routing', () => {
    test('[FRT-01] root and index.html use the React document', async () => {
        const frontendIndex = path.join(FRONTEND_ROOT, 'index.html');

        await assertFileResponse('/', frontendIndex);
        await assertFileResponse('/index.html', frontendIndex);
    });

    test('public Web documents announce their favicon and canonical URL', async () => {
        const home = await request('/');
        const homeHtml = await home.text();
        assert.match(homeHtml, /<link rel="icon" href="\/icon\/agencies\/1\.webp"/);
        const canonical = homeHtml.match(/<link rel="canonical" href="([^"]+)"/)?.[1];
        assert.ok(canonical);
        const origin = new URL(canonical).origin;
        assert.equal(canonical, `${origin}/`);
        assert.equal(home.headers.get('X-Robots-Tag'), null);

        const alias = await request('/wiki/modern/?utm_source=test');
        assert.ok((await alias.text()).includes(`<link rel="canonical" href="${origin}/wiki"`));
        const fallback = await request('/events/36');
        assert.doesNotMatch(await fallback.text(), /rel="canonical"/);

        for (const route of ['/account/login', '/account/me/profile', '/admin/login']) {
            const response = await request(route);
            assert.equal(response.status, 200, route);
            assert.equal(response.headers.get('X-Robots-Tag'), 'noindex', route);
        }

        const robots = await request('/robots.txt');
        assert.equal(robots.status, 200);
        assert.match(robots.headers.get('Content-Type') ?? '', /^text\/plain/);
        assert.ok((await robots.text()).includes(`Sitemap: ${origin}/sitemap.xml`));
        const sitemap = await request('/sitemap.xml');
        assert.equal(sitemap.status, 200);
        assert.match(sitemap.headers.get('Content-Type') ?? '', /^application\/xml/);
        const urls = [...(await sitemap.text()).matchAll(/<loc>([^<]+)<\/loc>/g)]
            .map((entry) => new URL(entry[1]));
        assert.ok(urls.some((url) => url.href === canonical));
        assert.ok(urls.some((url) => url.pathname === '/wiki'));
        assert.ok(urls.every((url) => url.origin === origin));
        assert.ok(urls.every((url) => !/^\/(?:admin|account)(?:\/|$)/.test(url.pathname)));
        assert.ok(urls.every((url) => !['/wiki/modern', '/story/modern'].includes(url.pathname)));
        assert.equal(new Set(urls.map((url) => url.href)).size, urls.length);
    });

    test('[FRT-02] real prerendered documents and selective SPA routes use build/client', async () => {
        assert.equal(FRONTEND_PRERENDERED_ROUTES.length, 30);
        for (const [route, asset] of FRONTEND_PRERENDERED_ROUTES) {
            if (route === '/') continue;
            await assertFileResponse(route, path.join(FRONTEND_ROOT, asset));
            await assertFileResponse(`${route}/`, path.join(FRONTEND_ROOT, asset));
        }

        const patternsById = new Map<
            string,
            (typeof FRONTEND_SPA_FALLBACK_PATTERNS)[number]
        >(
            FRONTEND_SPA_FALLBACK_PATTERNS.map((pattern) => [pattern.id, pattern])
        );
        assert.equal(patternsById.size, FRONTEND_SPA_FALLBACK_PATTERNS.length);
        assert.deepEqual(new Set(patternsById.keys()), new Set(Object.keys(SPA_ROUTE_CASES)));
        const fallback = path.join(FRONTEND_ROOT, '__spa-fallback.html');
        for (const [patternId, cases] of Object.entries(SPA_ROUTE_CASES)) {
            assert.ok(patternsById.has(patternId), `${patternId} has no generated SPA pattern`);
            for (const route of cases.positive) {
                if (cases.injected) {
                    // 分享页在 HTTP 层由 API 注册的 OGP 注入路由接管（design §3.4）；这个资产
                    // 车道只桩了 staticAssets、没有它的仓储，所以这里断言的是路由策略「把路径
                    // 判给前端文档」。注入本身由 API 自己的分享页测试覆盖。
                    const pathname = route.replace(/\/$/, '') || '/';
                    assert.deepEqual(
                        resolveFrontendRoute({ method: 'GET', pathname }, frontendFiles),
                        { kind: 'frontend', assetPath: '__spa-fallback.html' },
                        route
                    );
                    continue;
                }
                await assertFileResponse(route, fallback);
            }
        }

        const head = await request('/chronicle/activity-1', { method: 'HEAD' });
        assert.equal(head.status, 200);
        assert.equal(await head.text(), '');
        assert.equal(head.headers.get('content-length'), String(fs.statSync(fallback).size));
    });

    test('[FRT-03] Hono routes, server 404s, and media ownership are never SPA fallbacks', async () => {
        const probe = await request('/api/wiki/test');
        assert.equal(probe.status, 200);
        assert.deepEqual(await probe.json(), { status: 'ok' });

        for (const pathname of [
            '/api/not-a-real-route',
            '/image/not-a-real-file.webp',
            '/css/not-a-real-file.css',
            '/icon/not-a-real-file.webp',
            '/uploads/not-a-real-file.png',
            '/eventchronicle/not-a-real-route',
            '/assets/images/eventchronicle/events/used/not-a-real-file.png',
            '/runninggame/Build/not-a-real-file.data',
            '/runninggame/BuildMobile/not-a-real-file.data'
        ]) {
            assert.deepEqual(
                resolveFrontendRoute({ method: 'GET', pathname }, frontendFiles),
                { kind: 'server' },
                pathname
            );
            const response = await request(pathname);
            assert.equal(response.status, 404, pathname);
            assert.equal(await response.text(), 'Not Found', pathname);
        }

        const sensitive = await request('/assets/images/eventchronicle/events/meta/private.json');
        assert.equal(sensitive.status, 403);
        assert.equal(await sensitive.text(), 'Forbidden');

        for (const pathname of [
            '/sites/hiro-2026',
            '/site-content/hiro-2026/22222222-2222-4222-8222-222222222222/index.html',
            '/information/info-example-001/content'
        ]) {
            assert.deepEqual(
                resolveFrontendRoute({ method: 'GET', pathname }, frontendFiles),
                { kind: 'server' },
                pathname
            );
        }
    });

    test('[FRT-04] unknown and ambiguous paths do not receive the SPA fallback', async () => {
        for (const pathname of [
            '/unknown',
            '/community/exchange/me',
            '/community/exchange/me/',
            '/community/exchange/me/extra',
            '/wiki/not-a-real-route',
            '/wiki/classic/extra-segment',
            '/story-not-a-real-route',
            '/story/extra-segment',
            '/story/classic/extra-segment',
            ...Object.values(SPA_ROUTE_CASES).flatMap(({ negative }) => negative),
            '/chro%6Eicle/activity-1',
            '/community/cards/submissions/submission-1',
            '/packages/example-site',
            '/works/not-a-curated-work',
            '/chronicle/activity-1//',
            '/__spa-fallback.html',
            '/about/index.html',
            `/${frontendFileList.find((file) => file.endsWith('.js'))}/`,
            '/about/extra'
        ]) {
            const response = await request(pathname);
            assert.equal(response.status, 404, pathname);
            assert.equal(await response.text(), 'Not Found', pathname);
        }

        for (const pathname of [
            '/chronicle/.',
            '/chronicle/..',
            '/chronicle/%2e',
            '/chronicle/%2e%2e',
            '/admin/../api',
            // 编码过的斜杠在 Hono 的分享页 HTML 路由里是「一个段」，但它们绝不能被前端策略认领。
            '/exchange/card/one%2Ftwo',
            '/exchange/one%2Ftwo'
        ]) {
            assert.notEqual(
                resolveFrontendRoute({ method: 'GET', pathname }, frontendFiles).kind,
                'frontend',
                pathname
            );
        }

        for (const pathname of [
            '/about',
            '/admin',
            '/recommendations',
            '/information/info-example-001',
            '/chronicle/activity-1',
            '/account/me',
            '/community/exchange/offices/shanghai-weekend'
        ]) {
            assert.deepEqual(
                resolveFrontendRoute({ method: 'POST', pathname }, frontendFiles),
                { kind: 'server' },
                pathname
            );
            const response = await request(pathname, { method: 'POST' });
            assert.equal(response.status, 404, pathname);
        }
    });

    test('[FRT-05] build assets require an exact entry in the real file set', async () => {
        const javascript = frontendFileList.find((file) =>
            file.startsWith('assets/') && file.endsWith('.js')
        );
        assert.ok(javascript, 'build/client must contain a compiled JavaScript asset');
        await assertFileResponse(`/${javascript}`, path.join(FRONTEND_ROOT, javascript));

        for (const pathname of [
            `/${javascript}.map`,
            '/assets/not-in-the-build.js',
            '/brand/not-in-the-build.png'
        ]) {
            const response = await request(pathname);
            assert.equal(response.status, 404, pathname);
            assert.equal(await response.text(), 'Not Found', pathname);
        }

        assert.deepEqual(
            resolveFrontendRoute({ method: 'GET', pathname: `/${javascript}` }, new Set()),
            { kind: 'not-found' }
        );
    });

    test('[FRT-06] build documents and generated prerenders own each other', async () => {
        const documents = frontendFileList.filter((file) => file.endsWith('/index.html'));
        assert.equal(documents.length, 29);

        for (const document of documents) {
            const route = `/${document.slice(0, -'/index.html'.length)}`;
            assert.deepEqual(
                resolveFrontendRoute({ method: 'GET', pathname: route }, frontendFiles),
                { kind: 'frontend', assetPath: document },
                `${route} is prerendered but unowned by generated route metadata`
            );
            await assertFileResponse(route, path.join(FRONTEND_ROOT, document));
            await assertFileResponse(`${route}/`, path.join(FRONTEND_ROOT, document));
        }

        for (const [route, asset] of FRONTEND_PRERENDERED_ROUTES) {
            assert.ok(frontendFiles.has(asset), `${route} expects missing build document ${asset}`);
            assert.deepEqual(
                resolveFrontendRoute({ method: 'GET', pathname: route }, frontendFiles),
                { kind: 'frontend', assetPath: asset },
                `${route} is generated but not owned by the route policy`
            );
        }
    });
});
