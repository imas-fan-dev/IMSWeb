import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { test } from 'vitest';

// Delivery integration owns Web; App acceptance selects its separately built target.
const target = process.env.IMS_E2E_PREVIEW_TARGET || 'web';
assert.ok(target === 'web' || target === 'app', 'preview contract target must be web or app');

test(`compiled ${target === 'web' ? 'Web' : 'App'} preview preserves document, asset and server route ownership`, async () => {
    const { appPreviewSpaRoutes, appPreviewWebOnlyRoutes } = await import(
        pathToFileURL(path.resolve('../web/scripts/preview-app.js')).href
    );
    const child = spawn(process.execPath, ['--import', 'tsx', 'tests/fixtures/app-static-preview-server.ts'], {
        cwd: process.cwd(),
        env: {
            ...process.env,
            TSX_TSCONFIG_PATH: 'tsconfig.tests.json',
            IMS_E2E_PREVIEW_TARGET: target,
            IMS_APP_E2E_SPA_ROUTES: JSON.stringify(target === 'app' ? appPreviewSpaRoutes() : []),
            IMS_APP_E2E_WEB_ONLY_ROUTES: JSON.stringify(target === 'app' ? appPreviewWebOnlyRoutes() : []),
        },
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    const exited = once(child, 'exit');
    try {
        await new Promise<void>((resolve, reject) => {
            child.once('error', reject);
            child.once('exit', (code) => reject(new Error(`Preview exited before readiness: ${code}`)));
            child.stderr.on('data', (chunk) => reject(new Error(String(chunk))));
            child.stdout.on('data', (chunk) => {
                if (String(chunk).includes('static preview listening')) resolve();
            });
        });
        const origin = target === 'app' ? 'http://127.0.0.1:1420' : 'http://127.0.0.1:4173';
        const client = path.resolve(target === 'app' ? '../web/build-app/client' : '../web/build/client');
        for (const [route, document] of [
            ['/', 'index.html'], ['/about/', 'about/index.html'],
            ['/events/36?from=preview', '__spa-fallback.html'],
            ['/account/me', '__spa-fallback.html'],
            ['/account/me/profile', '__spa-fallback.html'],
            ...(target === 'app'
                ? [['/account/me/namecards', '__spa-fallback.html'], ['/apps', '__spa-fallback.html']]
                : [['/admin/chronicle/pending', '__spa-fallback.html']]),
        ]) {
            const response = await fetch(`${origin}${route}`);
            assert.equal(response.status, 200, route);
            assert.match(response.headers.get('content-type') || '', /text\/html/);
            assert.equal(await response.text(), await readFile(path.join(client, document), 'utf8'));
        }
        const html = await readFile(path.join(client, 'index.html'), 'utf8');
        const script = html.match(/(?:src|href)="(\/assets\/[^\"]+\.js)"/)?.[1];
        assert.ok(script, 'home document references compiled JavaScript');
        const asset = await fetch(`${origin}${script}`);
        assert.equal(asset.status, 200);
        assert.match(asset.headers.get('content-type') || '', /javascript/);
        await asset.arrayBuffer();
        const head = await fetch(`${origin}/events/36`, { method: 'HEAD' });
        assert.equal(head.status, 200);
        assert.equal(await head.text(), '');
        for (const route of [
            '/assets/missing.js', '/missing', '/api/news', '/packages/example', '/community/cards/submissions/example',
            ...(target === 'app'
                ? ['/admin', '/admin/login', '/admin/chronicle/pending', '/wiki/classic', '/wiki/classic/', '/story/classic', '/story/classic/']
                : ['/apps']),
        ]) {
            const response = await fetch(`${origin}${route}`);
            assert.equal(response.status, 404, route);
            assert.doesNotMatch(response.headers.get('content-type') || '', /text\/html/);
            await response.text();
        }
    } finally {
        child.kill('SIGTERM');
        await exited;
    }
});
