/**
 * The OAuth provider admin payloads are the only writer for the providers the
 * login buttons read, so every field the client may send is validated here.
 * These parsers sit in front of the backoffice route, which the callback tests
 * never touch, so the accepted and rejected shapes are pinned directly.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'vitest';
import {
    parsePlatformOAuthProviderCode,
    parsePlatformOAuthProviderCreate,
    parsePlatformOAuthProviderDelete,
    parsePlatformOAuthProviderUpdate,
} from '@/domains/identity/platform-auth/oauth/request';

function payload(overrides: Record<string, unknown> = {}) {
    return {
        displayName: '示例登录',
        icon: 'example',
        buttonColor: '#1A2B3C',
        enabled: true,
        clientId: 'client-id',
        clientSecret: 'client-secret',
        redirectUri: 'https://ims.test/api/platform/auth/oauth/example/callback',
        authorizationEndpoint: 'https://example.test/authorize',
        tokenEndpoint: 'https://example.test/token',
        userInfoEndpoint: 'https://example.test/userinfo',
        scopes: ['openid', 'profile'],
        tokenAuthMethod: 'client_secret_post',
        pkceEnabled: true,
        profileSubjectPath: 'data.id',
        profileDisplayNamePath: 'data.name',
        profileDisplayNameFallbackPath: 'data.login',
        profileAvatarUrlPath: null,
        ...overrides,
    };
}

function rejects(run: () => unknown, message: string) {
    assert.throws(run, (error: unknown) => {
        assert.equal((error as { status?: number }).status, 400);
        assert.equal((error as Error).message, message);
        return true;
    });
}

describe('platform oauth provider payloads', () => {
    test('create normalizes the write input and keeps the optional fields', () => {
        const created = parsePlatformOAuthProviderCreate({
            ...payload(),
            code: 'example',
        });
        assert.deepEqual(created, {
            code: 'example',
            displayName: '示例登录',
            icon: 'example',
            buttonColor: '#1a2b3c',
            enabled: true,
            clientId: 'client-id',
            clientSecret: 'client-secret',
            redirectUri: 'https://ims.test/api/platform/auth/oauth/example/callback',
            authorizationEndpoint: 'https://example.test/authorize',
            tokenEndpoint: 'https://example.test/token',
            userInfoEndpoint: 'https://example.test/userinfo',
            scopes: ['openid', 'profile'],
            tokenAuthMethod: 'client_secret_post',
            pkceEnabled: true,
            profileSubjectPath: 'data.id',
            profileDisplayNamePath: 'data.name',
            profileDisplayNameFallbackPath: 'data.login',
            profileAvatarUrlPath: null,
        });

        const minimal = parsePlatformOAuthProviderCreate({
            ...payload({
                clientId: undefined,
                clientSecret: undefined,
                redirectUri: undefined,
                profileDisplayNameFallbackPath: undefined,
                profileAvatarUrlPath: undefined,
            }),
            code: 'second',
        });
        assert.equal(minimal.clientId, undefined);
        assert.equal(minimal.clientSecret, undefined);
        assert.equal(minimal.redirectUri, undefined);
        assert.equal(minimal.profileDisplayNameFallbackPath, null);
        assert.equal(minimal.profileAvatarUrlPath, null);
    });

    test('update and delete require the optimistic version', () => {
        const update = parsePlatformOAuthProviderUpdate({
            ...payload(),
            expectedUpdatedAt: 7,
        });
        assert.equal(update.expectedUpdatedAt, 7);
        assert.equal(update.buttonColor, '#1a2b3c');
        assert.deepEqual(parsePlatformOAuthProviderDelete({ expectedUpdatedAt: 0 }), {
            expectedUpdatedAt: 0,
        });
    });

    test('the code keeps the route segment grammar', () => {
        assert.equal(parsePlatformOAuthProviderCode('google'), 'google');
        for (const value of ['Google', '1google', 'go ogle', '', 'a'.repeat(33), 7]) {
            rejects(
                () => parsePlatformOAuthProviderCode(value),
                'OAuth provider 无效',
            );
        }
    });

    test('unknown fields, wrong envelopes and out-of-range values are refused', () => {
        rejects(
            () => parsePlatformOAuthProviderCreate([]),
            'OAuth 配置格式无效',
        );
        rejects(
            () => parsePlatformOAuthProviderCreate({ ...payload(), code: 'example', extra: 1 }),
            'OAuth 请求包含未知字段',
        );
        rejects(
            () => parsePlatformOAuthProviderDelete({ expectedUpdatedAt: 1, code: 'x' }),
            'OAuth 请求包含未知字段',
        );
        rejects(
            () => parsePlatformOAuthProviderUpdate({ ...payload(), expectedUpdatedAt: -1 }),
            'OAuth 配置版本无效',
        );
        rejects(
            () => parsePlatformOAuthProviderUpdate({ ...payload(), expectedUpdatedAt: 1.5 }),
            'OAuth 配置版本无效',
        );
        rejects(
            () => parsePlatformOAuthProviderCreate({ ...payload({ displayName: '  ' }), code: 'example' }),
            '显示名称不能为空',
        );
        rejects(
            () => parsePlatformOAuthProviderCreate({ ...payload({ icon: 'Bad Icon' }), code: 'example' }),
            'OAuth 显示名称或按钮图标无效',
        );
        rejects(
            () => parsePlatformOAuthProviderCreate({ ...payload({ buttonColor: 'red' }), code: 'example' }),
            'OAuth 按钮主题色无效',
        );
        rejects(
            () => parsePlatformOAuthProviderCreate({ ...payload({ tokenEndpoint: null }), code: 'example' }),
            'Token 端点无效',
        );
        rejects(
            () => parsePlatformOAuthProviderCreate({ ...payload({ enabled: 'yes' }), code: 'example' }),
            'OAuth 开关无效',
        );
        rejects(
            () => parsePlatformOAuthProviderCreate({ ...payload({ pkceEnabled: null }), code: 'example' }),
            'OAuth PKCE 开关无效',
        );
        rejects(
            () => parsePlatformOAuthProviderCreate({ ...payload({ tokenAuthMethod: 'witness' }), code: 'example' }),
            'OAuth client 鉴权方式无效',
        );
    });

    test('scopes and profile paths are validated together', () => {
        for (const [scopes, message] of [
            ['openid', 'OAuth scope 格式无效'],
            [Array.from({ length: 31 }, (_, index) => `scope-${index}`), 'OAuth scope 格式无效'],
            [['openid', 'has space'], 'OAuth scope 格式无效'],
            [['openid', 'openid'], 'OAuth scope 不能重复'],
            [[7], 'OAuth scope无效'],
            [[''], 'OAuth scope不能为空'],
        ] as const) {
            rejects(
                () => parsePlatformOAuthProviderCreate({ ...payload({ scopes }), code: 'example' }),
                message,
            );
        }

        // Subject and display-name paths are required; the two optional paths
        // may be null or omitted, so only their grammar has to hold.
        rejects(
            () => parsePlatformOAuthProviderCreate({ ...payload({ profileSubjectPath: null }), code: 'example' }),
            '用户唯一标识路径无效',
        );
        rejects(
            () => parsePlatformOAuthProviderCreate({
                ...payload({ profileAvatarUrlPath: 'data.__proto__' }),
                code: 'example',
            }),
            '头像路径格式无效',
        );
        rejects(
            () => parsePlatformOAuthProviderCreate({
                ...payload({ profileDisplayNameFallbackPath: 'data..name' }),
                code: 'example',
            }),
            '显示名称回退路径格式无效',
        );
    });
});
