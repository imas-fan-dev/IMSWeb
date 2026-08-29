import assert from 'node:assert/strict';
import test from 'node:test';
import { createHonoApp } from '@/app';

test('CORS allows loopback development origins', async () => {
    const app = createHonoApp(() => ({}));
    const response = await app.request('http://api.test/api/health/live', {
        headers: { Origin: 'http://127.0.0.1:5273' }
    });

    assert.equal(response.status, 200);
    assert.equal(response.headers.get('access-control-allow-origin'), 'http://127.0.0.1:5273');
});

test('CORS allows the packaged client origins without granting credentials', async () => {
    const app = createHonoApp(() => ({}));
    for (const origin of [
        'tauri://localhost',
        'http://tauri.localhost',
        'https://tauri.localhost'
    ]) {
        const response = await app.request('http://api.test/api/health/live', {
            headers: { Origin: origin }
        });

        assert.equal(response.status, 200);
        assert.equal(response.headers.get('access-control-allow-origin'), origin);
        // The app carries a bearer token, so no cookie may cross the boundary.
        assert.equal(response.headers.get('access-control-allow-credentials'), null);
    }
});

test('CORS preflight admits the bearer opt-in headers', async () => {
    const app = createHonoApp(() => ({}));
    const response = await app.request(
        'http://api.test/api/platform/auth/refresh',
        {
            method: 'OPTIONS',
            headers: {
                Origin: 'tauri://localhost',
                'Access-Control-Request-Method': 'POST',
                'Access-Control-Request-Headers':
                    'x-ims-auth-mode,x-ims-refresh-token,content-type'
            }
        }
    );

    assert.equal(response.headers.get('access-control-allow-origin'), 'tauri://localhost');
    const allowed = (response.headers.get('access-control-allow-headers') ?? '')
        .toLowerCase();
    assert.ok(allowed.includes('x-ims-auth-mode'));
    assert.ok(allowed.includes('x-ims-refresh-token'));
});

test('CORS does not reflect external origins', async () => {
    const app = createHonoApp(() => ({}));
    const response = await app.request('http://api.test/api/health/live', {
        headers: { Origin: 'https://untrusted.example' }
    });

    assert.equal(response.status, 200);
    assert.equal(response.headers.get('access-control-allow-origin'), null);
});
