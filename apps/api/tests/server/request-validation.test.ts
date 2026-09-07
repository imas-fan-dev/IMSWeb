import assert from 'node:assert/strict';
import test from 'node:test';
import { legacyPassthroughRequestObject, legacyStripRequestObject, strictRequestObject } from '@imsweb/contracts/common';
import { z } from '@imsweb/contracts/z';
import { Hono } from 'hono';
import {
    jsonSchemaValidator,
    jsonValidator,
    paramSchemaValidator,
    paramValidator,
    querySchemaValidator,
    queryValidator
} from '@/middleware/request-validation';

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

test('param and query validators expose normalized request models', async () => {
    const app = new Hono();
    app.get('/items/:id', paramValidator(positiveIdRequest), (c) => {
        return c.json({ source: 'param', ...c.req.valid('param') });
    });
    app.get('/items', queryValidator(positiveIdRequest), (c) => {
        return c.json({ source: 'query', ...c.req.valid('query') });
    });

    const param = await app.request('/items/42');
    assert.equal(param.status, 200);
    assert.deepEqual(await param.json(), { source: 'param', id: 42 });

    const query = await app.request('/items?id=43');
    assert.equal(query.status, 200);
    assert.deepEqual(await query.json(), { source: 'query', id: 43 });
});

test('schema validators preserve explicit strict, strip, and passthrough request policies', async () => {
    const app = new Hono();
    const strictSchema = strictRequestObject({ id: z.number().int().positive() });
    const stripSchema = legacyStripRequestObject({ page: z.string() });
    const passthroughSchema = legacyPassthroughRequestObject({ token: z.string() });
    const paramsSchema = legacyStripRequestObject({ id: z.string() });

    app.post('/strict', jsonSchemaValidator(strictSchema), (c) => c.json(c.req.valid('json')));
    app.get('/strip', querySchemaValidator(stripSchema), (c) => c.json(c.req.valid('query')));
    app.get('/params/:id', paramSchemaValidator(paramsSchema), (c) => c.json({
        source: 'params',
        ...c.req.valid('param'),
    }));
    app.post('/passthrough', jsonSchemaValidator(passthroughSchema), (c) => c.json(c.req.valid('json')));

    const strict = await app.request('/strict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 1, unknown: true }),
    });
    assert.equal(strict.status, 400);
    assert.deepEqual(await strict.json(), { error: '请求参数无效' });

    const strip = await app.request('/strip?page=2&unknown=kept-out');
    assert.equal(strip.status, 200);
    assert.deepEqual(await strip.json(), { page: '2' });

    const params = await app.request('/params/42');
    assert.equal(params.status, 200);
    assert.deepEqual(await params.json(), { source: 'params', id: '42' });

    const passthrough = await app.request('/passthrough', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: 'value', unknown: true }),
    });
    assert.equal(passthrough.status, 200);
    assert.deepEqual(await passthrough.json(), { token: 'value', unknown: true });
});

test('schema JSON validators preserve malformed and mislabeled JSON behavior', async () => {
    const app = new Hono();
    const schema = strictRequestObject({ id: z.number().int().positive() });
    app.post(
        '/items',
        jsonSchemaValidator(schema, { acceptMislabeledJson: true }),
        (c) => c.json(c.req.valid('json')),
    );

    const malformed = await app.request('/items', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: '{',
    });
    assert.equal(malformed.status, 400);
    assert.deepEqual(await malformed.json(), { error: '请求正文必须为合法的 JSON' });

    const mislabeled = await app.request('/items', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ id: 7 }),
    });
    assert.equal(mislabeled.status, 200);
    assert.deepEqual(await mislabeled.json(), { id: 7 });
});

test('schema validators await adapters and preserve custom validation errors', async () => {
    const app = new Hono();
    const schema = strictRequestObject({ id: z.string().regex(/^\d+$/) });
    app.post(
        '/items',
        jsonSchemaValidator(
            schema,
            {
                invalidMessage: 'ID 格式错误',
                malformedMessage: 'JSON 格式错误',
                errorBody: (message) => ({ success: false, message }),
            },
            async ({ id }) => ({ id: Number(id) }),
        ),
        (c) => {
            const input = c.req.valid('json');
            return c.json({ id: input.id, adapted: true });
        },
    );

    const valid = await app.request('/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: '12' }),
    });
    assert.equal(valid.status, 200);
    assert.deepEqual(await valid.json(), { id: 12, adapted: true });

    const invalid = await app.request('/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'not-a-number' }),
    });
    assert.equal(invalid.status, 400);
    assert.deepEqual(await invalid.json(), { success: false, message: 'ID 格式错误' });

    const malformed = await app.request('/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{',
    });
    assert.equal(malformed.status, 400);
    assert.deepEqual(await malformed.json(), { success: false, message: 'JSON 格式错误' });
});

test('schema validator does not hide unexpected adapter failures', async () => {
    const app = new Hono();
    app.onError((_error, c) => c.json({ error: 'Internal server error' }, 500));
    app.post(
        '/items',
        jsonSchemaValidator(
            strictRequestObject({ id: z.number() }),
            {},
            () => {
                throw new Error('adapter defect');
            },
        ),
        (c) => c.json(c.req.valid('json')),
    );

    const response = await app.request('/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 1 }),
    });
    assert.equal(response.status, 500);
});

test('schema validator does not hide asynchronous adapter failures', async () => {
    const app = new Hono();
    app.onError((_error, c) => c.json({ error: 'Internal server error' }, 500));
    app.post(
        '/items',
        jsonSchemaValidator(
            strictRequestObject({ id: z.number() }),
            {},
            async () => {
                throw new Error('asynchronous adapter defect');
            },
        ),
        (c) => c.json(c.req.valid('json')),
    );

    const response = await app.request('/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 1 }),
    });
    assert.equal(response.status, 500);
});
