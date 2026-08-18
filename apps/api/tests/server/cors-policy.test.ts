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

test('CORS does not reflect external origins', async () => {
    const app = createHonoApp(() => ({}));
    const response = await app.request('http://api.test/api/health/live', {
        headers: { Origin: 'https://untrusted.example' }
    });

    assert.equal(response.status, 200);
    assert.equal(response.headers.get('access-control-allow-origin'), null);
});
