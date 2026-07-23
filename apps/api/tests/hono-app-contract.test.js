'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const REPOSITORY_ROOT = path.resolve(PROJECT_ROOT, '../..');
const SERVER_ENTRY = path.join(PROJECT_ROOT, 'dist/server/main.js');
const LEGACY_SERVER_ENTRY = path.join(PROJECT_ROOT, 'js/server.js');
const EXPECTED_SECURITY_HEADERS = {
    'cross-origin-opener-policy': 'same-origin',
    'cross-origin-resource-policy': 'cross-origin',
    'origin-agent-cluster': '?1',
    'referrer-policy': 'no-referrer',
    'strict-transport-security': 'max-age=31536000; includeSubDomains',
    'x-content-type-options': 'nosniff',
    'x-dns-prefetch-control': 'off',
    'x-download-options': 'noopen',
    'x-frame-options': 'SAMEORIGIN',
    'x-permitted-cross-domain-policies': 'none',
    'x-xss-protection': '0'
};
const EXCLUDED_SECURITY_HEADERS = [
    'content-security-policy',
    'cross-origin-embedder-policy',
    'x-powered-by'
];

function assertSecurityHeaderContract(response) {
    assert.deepEqual(response.securityHeaders, EXPECTED_SECURITY_HEADERS);
    assert.deepEqual(
        response.excludedSecurityHeaders,
        Object.fromEntries(EXCLUDED_SECURITY_HEADERS.map((name) => [name, null]))
    );
}

function isolatedEnvironment(root) {
    return {
        ...process.env,
        NODE_ENV: 'test',
        IMS_JWT_SECRET: 'hono-contract-test-secret-at-least-32-bytes',
        IMS_DB_PATH: path.join(root, 'core.db'),
        IMS_STORY_DB_PATH: path.join(root, 'story.db'),
        IMS_STORY_MAX_UPLOAD_BYTES: '52428800',
        IMS_UPLOADS_DIR: path.join(root, 'uploads'),
        IMS_EVENT_BASE_DIR: path.join(root, 'chronicle')
    };
}

function runIsolated(script, options = {}) {
    const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ims-hono-contract-'));
    try {
        return spawnSync(process.execPath, ['-e', script], {
            cwd: options.cwd || os.tmpdir(),
            env: { ...isolatedEnvironment(temporaryRoot), ...options.env },
            encoding: 'utf8',
            timeout: 10000
        });
    } finally {
        fs.rmSync(temporaryRoot, { recursive: true, force: true });
    }
}

test('[ARC-01] default assets and mutable Legacy data use separate roots', () => {
    const pathsEntry = path.join(PROJECT_ROOT, 'dist/server/config/paths.js');
    const script = `
        const paths = require(${JSON.stringify(pathsEntry)});
        process.stdout.write(JSON.stringify({
            PROJECT_ROOT: paths.PROJECT_ROOT,
            PUBLIC_DIR: paths.PUBLIC_DIR,
            DATABASE_PATH: paths.DATABASE_PATH,
            STORY_DATABASE_PATH: paths.STORY_DATABASE_PATH,
            STORY_DATA_DIR: paths.STORY_DATA_DIR,
            UPLOADS_DIR: paths.UPLOADS_DIR,
            EVENT_BASE: paths.EVENT_BASE
        }));
    `;
    const env = { ...process.env, NODE_ENV: 'test' };
    for (const name of [
        'IMS_PROJECT_ROOT', 'IMS_PUBLIC_DIR', 'IMS_DB_PATH', 'IMS_STORY_DB_PATH',
        'IMS_STORY_DATA_DIR', 'IMS_UPLOADS_DIR', 'IMS_EVENT_BASE_DIR'
    ]) delete env[name];
    const result = spawnSync(process.execPath, ['-e', script], {
        cwd: os.tmpdir(),
        env,
        encoding: 'utf8'
    });

    assert.equal(result.status, 0, result.stderr);
    const paths = JSON.parse(result.stdout);
    assert.equal(paths.PROJECT_ROOT, REPOSITORY_ROOT);
    assert.equal(paths.PUBLIC_DIR, path.join(REPOSITORY_ROOT, 'apps/legacy/public'));
    assert.equal(paths.DATABASE_PATH, path.join(REPOSITORY_ROOT, 'apps/legacy/data/core/news.db'));
    assert.equal(
        paths.STORY_DATABASE_PATH,
        path.join(REPOSITORY_ROOT, 'apps/legacy/data/story/idol_data.db')
    );
    assert.equal(
        paths.STORY_DATA_DIR,
        path.join(REPOSITORY_ROOT, 'apps/legacy/data/story/images')
    );
    assert.equal(paths.UPLOADS_DIR, path.join(REPOSITORY_ROOT, 'apps/legacy/data/uploads'));
    assert.equal(paths.EVENT_BASE, path.join(REPOSITORY_ROOT, 'apps/legacy/data/chronicle'));
});

test('[RUN-01] invalid story upload byte limits fail before Node startup', () => {
    for (const value of ['', 'abc', '0', '-1', '1.5', 'Infinity', '52428801']) {
        const result = runIsolated(
            `require(${JSON.stringify(SERVER_ENTRY)});`,
            { env: { IMS_STORY_MAX_UPLOAD_BYTES: value } }
        );
        assert.notEqual(result.status, 0, value);
        assert.match(result.stderr, /IMS_STORY_MAX_UPLOAD_BYTES must be/, value);
    }
});

test('[ARC-01 RUN-01 NODE-01] compiled entry exposes separate Hono and Node surfaces', () => {
    const script = `
        (async () => {
            const entry = require(${JSON.stringify(SERVER_ENTRY)});
            const result = {
                createHonoApp: typeof entry.createHonoApp,
                honoRequest: typeof entry.honoApp?.request,
                honoFetch: typeof entry.honoApp?.fetch,
                nodeListener: typeof entry.app,
                startServer: typeof entry.startServer,
                closeDatabase: typeof entry.closeDatabase,
                distinctSurfaces: Boolean(entry.honoApp) && entry.app !== entry.honoApp
            };
            await entry.closeDatabase();
            process.stdout.write(JSON.stringify(result));
        })().catch(error => {
            console.error(error);
            process.exitCode = 1;
        });
    `;
    const result = runIsolated(script);

    assert.equal(result.status, 0, result.stderr || result.error?.message);
    assert.deepEqual(JSON.parse(result.stdout), {
        createHonoApp: 'function',
        honoRequest: 'function',
        honoFetch: 'function',
        nodeListener: 'function',
        startServer: 'function',
        closeDatabase: 'function',
        distinctSurfaces: true
    });
});

test('[RUN-02] importing either compatibility entry never starts a listener', () => {
    const script = `
        const http = require('node:http');
        http.Server.prototype.listen = () => {
            throw new Error('entry listened during import');
        };
        (async () => {
            const compiled = require(${JSON.stringify(SERVER_ENTRY)});
            const legacy = require(${JSON.stringify(LEGACY_SERVER_ENTRY)});
            if (
                typeof compiled.honoApp?.request !== 'function' ||
                typeof compiled.createHonoApp !== 'function'
            ) {
                throw new Error('compiled entry did not expose the Hono surface');
            }
            if (legacy.app !== compiled.app || legacy.honoApp !== compiled.honoApp) {
                throw new Error('legacy entry did not forward both runtime surfaces');
            }
            await compiled.closeDatabase();
        })().catch(error => {
            console.error(error);
            process.exitCode = 1;
        });
    `;
    const result = runIsolated(script);

    assert.equal(result.status, 0, result.stderr || result.error?.message);
});

test('[RUN-01 WIKI-01] honoApp supports standard Request/Response without a socket', () => {
    const script = `
        (async () => {
            const entry = require(${JSON.stringify(SERVER_ENTRY)});
            const response = await entry.honoApp.request(
                new Request('http://ims.test/api/wiki/test')
            );
            const result = {
                status: response.status,
                contentType: response.headers.get('content-type'),
                securityHeaders: Object.fromEntries(
                    ${JSON.stringify(Object.keys(EXPECTED_SECURITY_HEADERS))}.map(
                        name => [name, response.headers.get(name)]
                    )
                ),
                excludedSecurityHeaders: Object.fromEntries(
                    ${JSON.stringify(EXCLUDED_SECURITY_HEADERS)}.map(
                        name => [name, response.headers.get(name)]
                    )
                ),
                body: await response.json()
            };
            await entry.closeDatabase();
            process.stdout.write(JSON.stringify(result));
        })().catch(error => {
            console.error(error);
            process.exitCode = 1;
        });
    `;
    const result = runIsolated(script);

    assert.equal(result.status, 0, result.stderr || result.error?.message);
    const response = JSON.parse(result.stdout);
    assert.equal(response.status, 200);
    assert.match(response.contentType, /^application\/json\b/);
    assertSecurityHeaderContract(response);
    assert.deepEqual(response.body, { status: 'ok' });
});

test('[SEC-01] shared app adds security headers to early 413 and 429 responses', () => {
    const script = `
        (async () => {
            const entry = require(${JSON.stringify(SERVER_ENTRY)});
            const headerNames = ${JSON.stringify(Object.keys(EXPECTED_SECURITY_HEADERS))};
            const excludedHeaderNames = ${JSON.stringify(EXCLUDED_SECURITY_HEADERS)};
            const snapshot = response => ({
                status: response.status,
                securityHeaders: Object.fromEntries(
                    headerNames.map(name => [name, response.headers.get(name)])
                ),
                excludedSecurityHeaders: Object.fromEntries(
                    excludedHeaderNames.map(name => [name, response.headers.get(name)])
                )
            });

            const bodyLimitedApp = entry.createHonoApp(() => ({}));
            const tooLarge = await bodyLimitedApp.request(new Request(
                'http://ims.test/api/login',
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Content-Length': '102401'
                    },
                    body: '{}'
                }
            ));

            const rateLimitedApp = entry.createHonoApp(() => ({
                rateLimiter: {
                    consume: async () => ({
                        allowed: false,
                        remaining: 0,
                        resetAt: Date.now() + 1000
                    })
                }
            }));
            const rateLimited = await rateLimitedApp.request('http://ims.test/api/wiki/test');

            await entry.closeDatabase();
            process.stdout.write(JSON.stringify({
                tooLarge: snapshot(tooLarge),
                rateLimited: snapshot(rateLimited)
            }));
        })().catch(error => {
            console.error(error);
            process.exitCode = 1;
        });
    `;
    const result = runIsolated(script);

    assert.equal(result.status, 0, result.stderr || result.error?.message);
    const responses = JSON.parse(result.stdout);
    assert.equal(responses.tooLarge.status, 413);
    assertSecurityHeaderContract(responses.tooLarge);
    assert.equal(responses.rateLimited.status, 429);
    assertSecurityHeaderContract(responses.rateLimited);
});

test('[WRK-01] createHonoApp resolves bindings independently for every request', () => {
    const script = `
        (async () => {
            const entry = require(${JSON.stringify(SERVER_ENTRY)});
            const seen = [];
            const app = entry.createHonoApp(env => {
                seen.push(env.requestMarker);
                return {};
            });
            const first = await app.request('/api/wiki/test', undefined, { requestMarker: 'first' });
            const second = await app.request('/api/wiki/test', undefined, { requestMarker: 'second' });
            if (first.status !== 200 || second.status !== 200) {
                throw new Error('health route did not remain public');
            }
            await entry.closeDatabase();
            process.stdout.write(JSON.stringify(seen));
        })().catch(error => {
            console.error(error);
            process.exitCode = 1;
        });
    `;
    const result = runIsolated(script);

    assert.equal(result.status, 0, result.stderr || result.error?.message);
    assert.deepEqual(JSON.parse(result.stdout), ['first', 'second']);
});
