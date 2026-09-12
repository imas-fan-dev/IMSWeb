import assert from 'node:assert/strict';
import test from 'node:test';
import { assertContractJson, readContractJson } from '../contracts/contract-json';

const exactSchema = {
    parse(value: unknown): { success: true; value: string } {
        assert.deepEqual(value, { success: true, value: 'wire' });
        return value as { success: true; value: string };
    }
};

function jsonResponse(
    value: unknown,
    contentType = 'application/json; charset=UTF-8',
    status = 200
): Response {
    return new Response(JSON.stringify(value), {
        status,
        headers: { 'content-type': contentType }
    });
}

test('contract JSON helpers preserve status, media type, and untouched payload equality', async () => {
    assert.deepEqual(
        await assertContractJson(
            jsonResponse({ success: true, value: 'wire' }, undefined, 201),
            201,
            exactSchema
        ),
        { success: true, value: 'wire' }
    );
    assert.deepEqual(
        await readContractJson(
            jsonResponse(
                { success: true, value: 'wire' },
                'application/json ; charset="utf-8"'
            ),
            exactSchema
        ),
        { success: true, value: 'wire' }
    );
});

test('contract JSON helpers reject non-JSON media types and malformed JSON parameters', async () => {
    await assert.rejects(
        readContractJson(jsonResponse({ success: true, value: 'wire' }, 'text/plain'), exactSchema)
    );
    await assert.rejects(
        readContractJson(
            jsonResponse({ success: true, value: 'wire' }, 'application/jsonish'),
            exactSchema
        )
    );
    await assert.rejects(
        readContractJson(
            jsonResponse({ success: true, value: 'wire' }, 'application/json;garbage'),
            exactSchema
        )
    );
});

test('contract JSON helpers reject a mismatched expected status', async () => {
    await assert.rejects(
        assertContractJson(jsonResponse({ success: true, value: 'wire' }), 201, exactSchema)
    );
});

test('contract JSON helpers detect schema stripping against the original wire payload', async () => {
    await assert.rejects(
        readContractJson(
            jsonResponse({ success: true, value: 'wire', stripped: true }),
            { parse: () => ({ success: true, value: 'wire' }) }
        ),
        /untouched JSON wire body/
    );
});
