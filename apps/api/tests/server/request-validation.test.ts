import assert from 'node:assert/strict';
import test from 'node:test';
import { Hono } from 'hono';
import { jsonValidator } from '@/middleware/request-validation';

function positiveIdRequest(value: unknown): { id: number } {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw Object.assign(new Error('请求格式无效'), { status: 400 });
    }
    const id = Number((value as { id?: unknown }).id);
    if (!Number.isSafeInteger(id) || id <= 0) {
        throw Object.assign(new Error('ID 无效'), { status: 400 });
    }
    return { id };
}

test('json validator exposes parsed request data through req.valid', async () => {
    const app = new Hono();
    app.post('/items', jsonValidator(positiveIdRequest), (c) => {
        const input = c.req.valid('json');
        return c.json({ id: input.id, parsed: true });
    });

    const response = await app.request('/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: '42' })
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { id: 42, parsed: true });
});

test('json validator normalizes malformed and invalid request errors', async () => {
    const app = new Hono();
    app.post('/items', jsonValidator(positiveIdRequest), (c) => c.json(c.req.valid('json')));

    const malformed = await app.request('/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{'
    });
    assert.equal(malformed.status, 400);
    assert.deepEqual(await malformed.json(), { error: '请求正文必须为合法的 JSON' });

    const invalid = await app.request('/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 0 })
    });
    assert.equal(invalid.status, 400);
    assert.deepEqual(await invalid.json(), { error: 'ID 无效' });
});

test('json validator does not hide unexpected parser failures', async () => {
    const app = new Hono();
    app.onError((_error, c) => c.json({ error: 'Internal server error' }, 500));
    app.post('/items', jsonValidator(() => {
        throw new Error('parser defect');
    }), (c) => c.json(c.req.valid('json')));

    const response = await app.request('/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}'
    });
    assert.equal(response.status, 500);
});

test('json validator can explicitly preserve mislabeled JSON compatibility', async () => {
    const app = new Hono();
    app.post(
        '/items',
        jsonValidator(positiveIdRequest, { acceptMislabeledJson: true }),
        (c) => c.json(c.req.valid('json'))
    );

    const response = await app.request('/items', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ id: 7 })
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { id: 7 });
});

test('json validator awaits asynchronous request parsers', async () => {
    const app = new Hono();
    app.post(
        '/items',
        jsonValidator(async (value) => positiveIdRequest(value)),
        (c) => c.json(c.req.valid('json'))
    );

    const response = await app.request('/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 9 })
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { id: 9 });
});
