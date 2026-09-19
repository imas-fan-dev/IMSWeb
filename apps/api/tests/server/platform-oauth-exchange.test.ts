import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'vitest';
import type {
    PlatformAccountWithProfile,
    PlatformOAuthExchangeCodeRecord
} from '@/ports/repositories';
import type { RuntimeServices } from '@/ports/runtime-services';
import { createWikiFixture } from '../wiki/fixture';

/**
 * The OAuth app exchange endpoint redeems the one-time deep-link code for a
 * bearer session. These cases pin every rejection the design promised:
 * missing bearer mode, a consumed or expired code, a verifier that does not
 * match the stored challenge, and an unavailable account. The code is consumed
 * before the challenge is compared, so a wrong verifier also burns the row.
 */

const EXCHANGE_URL = '/api/platform/auth/oauth/exchange';
const AT = 1_775_100_000_000;

const CODE = 'c'.repeat(43);
const VERIFIER = 'v'.repeat(43);
const CHALLENGE = createHash('sha256').update(VERIFIER).digest('base64url');

function accountWithProfile(overrides: {
    status?: 'active' | 'restricted' | 'suspended' | 'deleted';
} = {}): PlatformAccountWithProfile {
    return {
        account: {
            id: 'account-1',
            status: overrides.status ?? 'active',
            token_version: 0,
            created_at: AT,
            updated_at: AT,
            deleted_at: null
        },
        profile: {
            account_id: 'account-1',
            display_name: 'Producer One',
            avatar_object_key: null,
            avatar_external_url: null,
            home_city: null,
            bio: '',
            updated_at: AT
        }
    };
}

function configureFixture(options: {
    consume?: PlatformOAuthExchangeCodeRecord | null;
    account?: PlatformAccountWithProfile | null;
    rateLimited?: boolean;
}) {
    const fixture = createWikiFixture();
    const calls = {
        consumeOAuthExchangeCode: [] as Array<{ hash: string; at: number }>,
        createRefreshSession: 0,
        findAccountWithProfileById: 0
    };
    fixture.services.platformTokens = {
        async sign() {
            return 'signed-access-token';
        },
        async verify() {
            throw new Error('not used');
        }
    };
    fixture.services.platformAccounts = {
        async consumeOAuthExchangeCode(hash: string, at: number) {
            calls.consumeOAuthExchangeCode.push({ hash, at });
            return options.consume === undefined
                ? { account_id: 'account-1', code_challenge: CHALLENGE }
                : options.consume;
        },
        async findAccountWithProfileById() {
            calls.findAccountWithProfileById += 1;
            return options.account === undefined
                ? accountWithProfile()
                : options.account;
        },
        async createRefreshSession() {
            calls.createRefreshSession += 1;
            return true;
        }
    } as unknown as RuntimeServices['platformAccounts'];
    if (options.rateLimited) {
        fixture.services.rateLimiter = {
            async consume() {
                return { allowed: false, remaining: 0, resetAt: Date.now() + 60_000 };
            }
        };
    }
    return { fixture, calls };
}

async function postExchange(
    fixture: ReturnType<typeof createWikiFixture>,
    body: unknown,
    headers: Record<string, string> = {}
): Promise<Response> {
    return await fixture.app.request(EXCHANGE_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-IMS-Auth-Mode': 'bearer',
            ...headers
        },
        body: JSON.stringify(body)
    });
}

test('a valid code and verifier return a bearer session', async () => {
    const { fixture, calls } = configureFixture({});
    const response = await postExchange(fixture, {
        code: CODE,
        codeVerifier: VERIFIER
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.success, true);
    assert.equal(payload.accessToken, 'signed-access-token');
    assert.match(payload.refreshToken, /^v1\.0\.[0-9a-f]{64}$/);
    assert.equal(calls.createRefreshSession, 1);
    // The code is looked up by SHA-256 hex, never by its raw value.
    assert.equal(
        calls.consumeOAuthExchangeCode[0]?.hash,
        createHash('sha256').update(CODE).digest('hex')
    );
});

test('a replayed code is rejected after the first redemption', async () => {
    let consumed = false;
    const fixture = createWikiFixture();
    fixture.services.platformTokens = {
        async sign() {
            return 'signed-access-token';
        },
        async verify() {
            throw new Error('not used');
        }
    };
    fixture.services.platformAccounts = {
        async consumeOAuthExchangeCode() {
            if (consumed) return null;
            consumed = true;
            return { account_id: 'account-1', code_challenge: CHALLENGE };
        },
        async findAccountWithProfileById() {
            return accountWithProfile();
        },
        async createRefreshSession() {
            return true;
        }
    } as unknown as RuntimeServices['platformAccounts'];

    const first = await postExchange(fixture, {
        code: CODE,
        codeVerifier: VERIFIER
    });
    assert.equal(first.status, 200);
    const replay = await postExchange(fixture, {
        code: CODE,
        codeVerifier: VERIFIER
    });
    assert.equal(replay.status, 401);
    assert.equal((await replay.json()).code, 'PLATFORM_OAUTH_EXCHANGE_EXPIRED');
});

test('an expired or unknown code is rejected', async () => {
    const { fixture } = configureFixture({ consume: null });
    const response = await postExchange(fixture, {
        code: CODE,
        codeVerifier: VERIFIER
    });

    assert.equal(response.status, 401);
    assert.equal((await response.json()).code, 'PLATFORM_OAUTH_EXCHANGE_EXPIRED');
});

test('a verifier that does not match the challenge is rejected', async () => {
    const { fixture, calls } = configureFixture({});
    const response = await postExchange(fixture, {
        code: CODE,
        codeVerifier: 'x'.repeat(43)
    });

    assert.equal(response.status, 401);
    assert.equal((await response.json()).code, 'PLATFORM_OAUTH_EXCHANGE_INVALID');
    // The code was consumed before the comparison, so the row cannot be retried.
    assert.equal(calls.consumeOAuthExchangeCode.length, 1);
    assert.equal(calls.createRefreshSession, 0);
});

test('exchanging without the bearer auth mode is refused', async () => {
    const { fixture, calls } = configureFixture({});
    const response = await postExchange(
        fixture,
        { code: CODE, codeVerifier: VERIFIER },
        { 'X-IMS-Auth-Mode': 'cookie' }
    );

    assert.equal(response.status, 400);
    assert.equal(
        (await response.json()).code,
        'PLATFORM_OAUTH_EXCHANGE_BEARER_REQUIRED'
    );
    assert.equal(calls.consumeOAuthExchangeCode.length, 0);
});

test('an invalid exchange body is refused without leaking validation detail', async () => {
    const { fixture } = configureFixture({});
    const response = await fixture.app.request(EXCHANGE_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-IMS-Auth-Mode': 'bearer'
        },
        body: JSON.stringify({ code: 'short', codeVerifier: VERIFIER, extra: true })
    });

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
        success: false,
        code: 'PLATFORM_OAUTH_EXCHANGE_INVALID'
    });
});

test('an account that cannot hold a session is refused', async () => {
    const { fixture } = configureFixture({
        account: accountWithProfile({ status: 'suspended' })
    });
    const response = await postExchange(fixture, {
        code: CODE,
        codeVerifier: VERIFIER
    });

    assert.equal(response.status, 403);
    assert.equal((await response.json()).code, 'PLATFORM_ACCOUNT_UNAVAILABLE');
});

test('the exchange endpoint is rate limited', async () => {
    const { fixture } = configureFixture({ rateLimited: true });
    const response = await postExchange(fixture, {
        code: CODE,
        codeVerifier: VERIFIER
    });

    assert.equal(response.status, 429);
    assert.equal(response.headers.get('retry-after'), '60');
});
