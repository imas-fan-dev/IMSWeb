import assert from 'node:assert/strict';

export interface ContractSchema {
    parse(value: unknown): unknown;
}

const JSON_CONTENT_TYPE = /^application\/json[ \t]*(?:;[ \t]*[!#$%&'*+\-.^_`|~0-9A-Za-z]+[ \t]*=[ \t]*(?:[!#$%&'*+\-.^_`|~0-9A-Za-z]+|"(?:[^"\\\r\n]|\\.)*")[ \t]*)*$/i;

export async function readContractJson<S extends ContractSchema>(
    response: Response,
    schema: S
): Promise<ReturnType<S['parse']>> {
    assert.match(
        response.headers.get('content-type') ?? '',
        JSON_CONTENT_TYPE
    );
    const raw: unknown = await response.json();
    const parsed = schema.parse(raw) as ReturnType<S['parse']>;
    assert.deepEqual(
        parsed,
        raw,
        'contract schema must preserve the untouched JSON wire body'
    );
    return parsed;
}

export async function assertContractJson<S extends ContractSchema>(
    response: Response,
    status: number,
    schema: S
): Promise<ReturnType<S['parse']>> {
    assert.equal(response.status, status);
    return readContractJson(response, schema);
}
