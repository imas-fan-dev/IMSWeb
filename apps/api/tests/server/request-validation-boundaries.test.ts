import assert from 'node:assert/strict';
import test from 'node:test';
import { Hono } from 'hono';
import { paramValidator, queryValidator } from '@/middleware/request-validation';

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
