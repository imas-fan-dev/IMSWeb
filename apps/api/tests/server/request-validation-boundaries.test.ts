import assert from 'node:assert/strict';
import test from 'node:test';
import { strictRequestObject } from '@imsweb/contracts/common';
import { z } from '@imsweb/contracts/z';
import { Hono, type Context } from 'hono';
import {
    jsonSchemaValidator,
    paramValidator,
    queryValidator
} from '@/middleware/request-validation';

function positiveId(value: unknown): { id: number } {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw Object.assign(new Error('请求格式无效'), { status: 400 });
    }
    const id = Number((value as { id?: unknown }).id);
    if (!Number.isSafeInteger(id) || id <= 0) {
        throw Object.assign(new Error('ID 无效'), { status: 400 });
    }
    return { id };
}

test('schema validators preserve legacy errors without accepting schema-invalid input', async () => {
    const app = new Hono();
    const schema = strictRequestObject({ id: z.number().int().positive() });
    let handlerCalls = 0;
    const handler = (c: Context) => {
        handlerCalls += 1;
        return c.json({ reached: true });
    };
    app.post('/localized', jsonSchemaValidator(schema, {
        invalidMessage: 'shared schema rejected input',
        schemaErrorParser() {
            throw Object.assign(new Error('旧版 ID 无效'), { status: 400 });
        }
    }), handler);
    app.post('/fail-closed', jsonSchemaValidator(schema, {
        invalidMessage: 'shared schema rejected input',
        schemaErrorParser() {
            return { id: 1 };
        }
    }), handler);

    const localized = await app.request('/localized', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: 'invalid' })
    });
    assert.equal(localized.status, 400);
    assert.deepEqual(await localized.json(), { error: '旧版 ID 无效' });

    const failClosed = await app.request('/fail-closed', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: 'invalid' })
    });
    assert.equal(failClosed.status, 400);
    assert.deepEqual(await failClosed.json(), { error: 'shared schema rejected input' });
    assert.equal(handlerCalls, 0);
});

test('param and query validators normalize invalid business input before handlers run', async () => {
    const app = new Hono();
    let handlerCalls = 0;
    app.get('/items/:id', paramValidator(positiveId), (c) => {
        handlerCalls += 1;
        return c.json({ reached: true });
    });
    app.get('/items', queryValidator(positiveId, {
        errorBody: (message) => ({ success: false, message })
    }), (c) => {
        handlerCalls += 1;
        return c.json({ reached: true });
    });

    const invalidParam = await app.request('/items/not-a-number');
    assert.equal(invalidParam.status, 400);
    assert.deepEqual(await invalidParam.json(), { error: 'ID 无效' });

    const invalidQuery = await app.request('/items?id=0');
    assert.equal(invalidQuery.status, 400);
    assert.deepEqual(await invalidQuery.json(), { success: false, message: 'ID 无效' });
    assert.equal(handlerCalls, 0);
});
