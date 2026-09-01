import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PLATFORM_OAUTH_PROVIDER_DEFINITIONS } from '@/config/platform-oauth';
import { ConfiguredPlatformOAuthClient } from '@/infra/oauth/platform-oauth-client';
import type {
    PlatformOAuthProviderConfigRecord,
    PlatformOAuthProviderStore,
} from '@/ports/oauth';

function provider(
    code: PlatformOAuthProviderConfigRecord['code'],
    overrides: Partial<PlatformOAuthProviderConfigRecord> = {},
): PlatformOAuthProviderConfigRecord {
    return {
        code,
        displayName: code === 'google' ? 'Google' : 'GitHub',
        icon: code,
        enabled: false,
        clientIdCiphertext: null,
        clientSecretCiphertext: null,
        redirectUri: null,
        updatedAt: 0,
        ...overrides,
    };
}

function client(rows: PlatformOAuthProviderConfigRecord[]) {
    const store: PlatformOAuthProviderStore = {
        async listOAuthProviderConfigs() {
            return rows;
        },
        async updateOAuthProviderConfig() {
            throw new Error('not used');
        },
    };
    return new ConfiguredPlatformOAuthClient(
        {
            providers: PLATFORM_OAUTH_PROVIDER_DEFINITIONS,
            requestTimeoutMs: 10_000,
        },
        store,
        {
            encrypt(value) {
                return value;
            },
            decrypt(value) {
                return value;
            },
        },
        globalThis.fetch,
        'test',
    );
}

test('OAuth admin settings expose only fixed providers in product order', async () => {
    const unsupported = {
        ...provider('github'),
        code: 'unsupported',
        icon: 'unsupported',
    } as unknown as PlatformOAuthProviderConfigRecord;
    const settings = await client([
        provider('github'),
        unsupported,
        provider('google'),
    ]).listProviderSettings();

    assert.deepEqual(
        settings.map(({ code, icon }) => ({ code, icon })),
        [
            { code: 'google', icon: 'google' },
            { code: 'github', icon: 'github' },
        ],
    );
});

test('OAuth admin settings fail when a fixed provider was not initialized', async () => {
    await assert.rejects(
        client([provider('google')]).listProviderSettings(),
        /OAuth provider github is not initialized/,
    );
});
