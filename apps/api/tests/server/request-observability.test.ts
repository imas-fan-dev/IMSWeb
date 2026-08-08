import assert from 'node:assert/strict';
import test from 'node:test';
import { createHonoApp } from '@/app';

test('request IDs, health probes, and structured request logs stay correlated', async (t) => {
    const info: string[] = [];
    const errors: string[] = [];
    const warnings: string[] = [];
    const originalInfo = console.info;
    const originalError = console.error;
    const originalWarn = console.warn;
    console.info = (message?: unknown) => info.push(String(message));
    console.error = (message?: unknown) => errors.push(String(message));
    console.warn = (message?: unknown) => warnings.push(String(message));
    t.after(() => {
        console.info = originalInfo;
        console.error = originalError;
        console.warn = originalWarn;
    });

    let ready = true;
    const app = createHonoApp(() => ({
        health: {
            async check() {
                if (!ready) throw new Error('database unavailable');
            }
        }
    }), { requestLogging: true });
    app.get('/api/test/failure', () => {
        throw new Error('injected failure');
    });

    const live = await app.request('/api/health/live', {
        headers: { 'X-Request-Id': 'trace-live-1' }
    });
    assert.equal(live.status, 200);
    assert.equal(live.headers.get('X-Request-Id'), 'trace-live-1');

    const readiness = await app.request('/api/health/ready');
    assert.equal(readiness.status, 200);
    ready = false;
    const unavailable = await app.request('/api/health/ready');
    assert.equal(unavailable.status, 503);
    assert.deepEqual(await unavailable.json(), { status: 'unavailable' });

    const failed = await app.request('/api/test/failure', {
        headers: { 'X-Request-Id': 'trace-error-1' }
    });
    assert.equal(failed.status, 500);
    const errorLog = errors.map((entry) => JSON.parse(entry) as Record<string, unknown>)
        .find((entry) => entry.event === 'http_request_error');
    assert.equal(errorLog?.requestId, 'trace-error-1');
    assert.equal(errorLog?.status, 500);

    const completed = info.map((entry) => JSON.parse(entry) as Record<string, unknown>)
        .filter((entry) => entry.event === 'http_request_completed');
    assert.ok(completed.some((entry) =>
        entry.requestId === 'trace-live-1' && entry.status === 200 &&
        typeof entry.durationMs === 'number'
    ));
    assert.ok(completed.some((entry) => entry.status === 503));
    const readinessFailures = warnings.map((entry) =>
        JSON.parse(entry) as Record<string, unknown>
    ).filter((entry) => entry.event === 'health_readiness_failed');
    assert.equal(readinessFailures.length, 1);
    assert.equal(readinessFailures[0]?.error, 'database unavailable');

    const initializationFailure = createHonoApp(() => {
        throw new Error('initialization failed');
    }, { requestLogging: true });
    const initializationUnavailable = await initializationFailure.request('/api/health/ready');
    assert.equal(initializationUnavailable.status, 503);
    assert.deepEqual(await initializationUnavailable.json(), { status: 'unavailable' });
    assert.ok(warnings.some((entry) => {
        const parsed = JSON.parse(entry) as Record<string, unknown>;
        return parsed.event === 'health_readiness_failed' &&
            parsed.error === 'initialization failed';
    }));
});
