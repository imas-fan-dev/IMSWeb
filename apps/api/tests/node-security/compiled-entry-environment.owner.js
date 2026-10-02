'use strict';

const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function compiledEntryExports(fixture) {
    return () => {
        const { SERVER_ENTRY } = fixture;
        const serverModule = require(SERVER_ENTRY);

        assert.equal(typeof serverModule.app, 'function');
        assert.equal(typeof serverModule.startServer, 'function');
        assert.equal(typeof serverModule.closeDatabase, 'function');
    };
}

function compiledEntryDoesNotListen(fixture) {
    return () => {
        const { isolatedServerEnv, SERVER_ENTRY } = fixture;
        const script = `
            const http = require('node:http');
            http.Server.prototype.listen = () => {
                throw new Error('server entry listened during require');
            };
            (async () => {
                const serverModule = require(${JSON.stringify(SERVER_ENTRY)});
                await serverModule.closeDatabase();
            })().catch(error => {
                console.error(error);
                process.exitCode = 1;
            });
        `;
        const result = spawnSync(process.execPath, ['-e', script], {
            cwd: os.tmpdir(),
            env: isolatedServerEnv('require-without-listen'),
            encoding: 'utf8',
            timeout: 5000
        });

        assert.equal(result.status, 0, result.stderr || result.error?.message);
    };
}

function compiledEntryLoadsFromTemporaryCwd(fixture) {
    return () => {
        const { isolatedServerEnv, SERVER_ENTRY } = fixture;
        const script = `
            (async () => {
                const serverModule = require(${JSON.stringify(SERVER_ENTRY)});
                if (
                    typeof serverModule.app !== 'function' ||
                    typeof serverModule.startServer !== 'function' ||
                    typeof serverModule.closeDatabase !== 'function'
                ) {
                    throw new Error('invalid compiled server exports');
                }
                await serverModule.closeDatabase();
            })().catch(error => {
                console.error(error);
                process.exitCode = 1;
            });
        `;
        const result = spawnSync(process.execPath, ['-e', script], {
            cwd: os.tmpdir(),
            env: isolatedServerEnv('load-from-temp-cwd'),
            encoding: 'utf8',
            timeout: 5000
        });

        assert.equal(result.status, 0, result.stderr || result.error?.message);
    };
}

function legacyEntryForwardsContract(fixture) {
    return () => {
        const { LEGACY_SERVER_ENTRY, SERVER_ENTRY } = fixture;
        const compiled = require(SERVER_ENTRY);
        const legacy = require(LEGACY_SERVER_ENTRY);

        assert.equal(legacy.app, compiled.app);
        assert.equal(legacy.startServer, compiled.startServer);
        assert.equal(legacy.closeDatabase, compiled.closeDatabase);
    };
}

function productionRequiresBackofficeSecret(fixture) {
    return () => {
        const { SERVER_ENTRY } = fixture;
        const script = `require(${JSON.stringify(SERVER_ENTRY)})`;
        const env = { ...process.env, NODE_ENV: 'production' };
        delete env.IMS_BACKOFFICE_JWT_SECRET;
        delete env.IMS_JWT_SECRET;

        const result = spawnSync(process.execPath, ['-e', script], {
            cwd: os.tmpdir(),
            env,
            encoding: 'utf8'
        });

        assert.notEqual(result.status, 0);
        assert.match(result.stderr, /IMS_BACKOFFICE_JWT_SECRET is required/);
    };
}

function productionEnvironmentNormalization(fixture) {
    return () => {
        const { SERVER_ENTRY } = fixture;
        const env = { ...process.env, NODE_ENV: ' Production ' };
        delete env.IMS_BACKOFFICE_JWT_SECRET;
        delete env.IMS_JWT_SECRET;
        const result = spawnSync(process.execPath, ['-e', `require(${JSON.stringify(SERVER_ENTRY)})`], {
            cwd: os.tmpdir(),
            env,
            encoding: 'utf8'
        });
        assert.notEqual(result.status, 0);
        assert.match(result.stderr, /IMS_BACKOFFICE_JWT_SECRET is required/);
    };
}

function unknownEnvironmentFailsFast(fixture) {
    return () => {
        const { SERVER_ENTRY } = fixture;
        const result = spawnSync(process.execPath, ['-e', `require(${JSON.stringify(SERVER_ENTRY)})`], {
            cwd: os.tmpdir(),
            env: { ...process.env, NODE_ENV: 'stagin' },
            encoding: 'utf8'
        });
        assert.notEqual(result.status, 0);
        assert.match(result.stderr, /NODE_ENV must be/);
    };
}

function productionRejectsShortSecret(fixture) {
    return () => {
        const { SERVER_ENTRY } = fixture;
        const script = `require(${JSON.stringify(SERVER_ENTRY)})`;
        const env = {
            ...process.env,
            NODE_ENV: 'production',
            IMS_BACKOFFICE_JWT_SECRET: 'too-short'
        };

        const result = spawnSync(process.execPath, ['-e', script], {
            cwd: os.tmpdir(),
            env,
            encoding: 'utf8'
        });

        assert.notEqual(result.status, 0);
        assert.match(result.stderr, /at least 32 UTF-8 bytes/);
    };
}

function productionUtf8SecretLength(fixture) {
    return () => {
        const { databaseUrl, SERVER_ENTRY, tempDir } = fixture;
        const script = `const server = require(${JSON.stringify(SERVER_ENTRY)}); server.closeDatabase()`;
        const env = {
            ...process.env,
            NODE_ENV: 'production',
            IMS_BACKOFFICE_JWT_SECRET: '😀'.repeat(8),
            IMS_PLATFORM_JWT_SECRET: '平台'.repeat(6),
            DATABASE_URL: databaseUrl,
            IMS_EVENT_BASE_DIR: path.join(tempDir, 'utf8-secret-events')
        };
        const result = spawnSync(process.execPath, ['-e', script], {
            cwd: os.tmpdir(),
            env,
            encoding: 'utf8'
        });
        assert.equal(result.status, 0, result.stderr);
    };
}

function registerCompiledEntryEnvironmentTests(fixture) {
    const { test } = fixture;
    test('compiled server entry exports the application lifecycle contract', () =>
        compiledEntryExports(fixture)());
    test('requiring the compiled server entry does not start a listener', () =>
        compiledEntryDoesNotListen(fixture)());
    test('compiled server entry loads independently of the current working directory', () =>
        compiledEntryLoadsFromTemporaryCwd(fixture)());
    test('legacy server entry forwards the compiled lifecycle contract', () =>
        legacyEntryForwardsContract(fixture)());
    test('production refuses to load without IMS_BACKOFFICE_JWT_SECRET', () =>
        productionRequiresBackofficeSecret(fixture)());
    test('production NODE_ENV is normalized before fail-fast checks', () =>
        productionEnvironmentNormalization(fixture)());
    test('unknown NODE_ENV values fail fast', () =>
        unknownEnvironmentFailsFast(fixture)());
    test('production refuses a short IMS_BACKOFFICE_JWT_SECRET', () =>
        productionRejectsShortSecret(fixture)());
    test('production JWT secret length is measured in UTF-8 bytes', () =>
        productionUtf8SecretLength(fixture)());
}

module.exports = { registerCompiledEntryEnvironmentTests };
