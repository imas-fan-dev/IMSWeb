import type {
    PlatformOAuthProviderCreateInput,
    PlatformOAuthProviderUpdateInput,
    PlatformOAuthProviderWriteInput,
} from '@/ports/oauth';
import { invalidRequest, requestRecord } from '@/utils/validation/request-data';

const PROVIDER_CODE = /^[a-z][a-z0-9-]{0,31}$/;
const PROVIDER_ICON = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const BUTTON_COLOR = /^#[0-9a-f]{6}$/i;
const PROFILE_PATH = /^[A-Za-z_][A-Za-z0-9_-]*(?:\.[A-Za-z_][A-Za-z0-9_-]*)*$/;
const RESERVED_PATH_SEGMENTS = new Set(['__proto__', 'prototype', 'constructor']);
const WRITE_KEYS = [
    'displayName',
    'icon',
    'buttonColor',
    'enabled',
    'clientId',
    'clientSecret',
    'redirectUri',
    'authorizationEndpoint',
    'tokenEndpoint',
    'userInfoEndpoint',
    'scopes',
    'tokenAuthMethod',
    'pkceEnabled',
    'profileSubjectPath',
    'profileDisplayNamePath',
    'profileDisplayNameFallbackPath',
    'profileAvatarUrlPath',
] as const;

function exactKeys(payload: Record<string, unknown>, allowed: readonly string[]): void {
    if (Object.keys(payload).some((key) => !allowed.includes(key))) {
        invalidRequest('OAuth 请求包含未知字段');
    }
}

function boundedString(
    value: unknown,
    label: string,
    maximum: number,
    required = true,
): string | undefined {
    if (typeof value !== 'string') {
        if (!required && value === undefined) return undefined;
        invalidRequest(`${label}无效`);
    }
    const normalized = value.trim();
    if (!normalized && required) invalidRequest(`${label}不能为空`);
    if (normalized.length > maximum) invalidRequest(`${label}过长`);
    return normalized || undefined;
}

function expectedUpdatedAt(value: unknown): number {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
        invalidRequest('OAuth 配置版本无效');
    }
    return value;
}

function profilePath(value: unknown, label: string, required: boolean): string | null {
    if (value === null && !required) return null;
    const path = boundedString(value, label, 160, !required ? false : true);
    if (!path && !required) return null;
    if (
        !path ||
        !PROFILE_PATH.test(path) ||
        path.split('.').some((segment) => RESERVED_PATH_SEGMENTS.has(segment))
    ) {
        invalidRequest(`${label}格式无效`);
    }
    return path;
}

function scopes(value: unknown): string[] {
    if (!Array.isArray(value) || value.length > 30) {
        invalidRequest('OAuth scope 格式无效');
    }
    const normalized = value.map((scope) => {
        const parsed = boundedString(scope, 'OAuth scope', 120);
        if (!parsed || /\s/.test(parsed)) invalidRequest('OAuth scope 格式无效');
        return parsed;
    });
    if (new Set(normalized).size !== normalized.length) {
        invalidRequest('OAuth scope 不能重复');
    }
    return normalized;
}

function writeInput(
    payload: Record<string, unknown>,
): Omit<PlatformOAuthProviderWriteInput, 'code'> {
    const displayName = boundedString(payload.displayName, '显示名称', 80);
    const icon = boundedString(payload.icon, '按钮图标', 64);
    const buttonColor = boundedString(payload.buttonColor, '按钮主题色', 7);
    const authorizationEndpoint = boundedString(payload.authorizationEndpoint, '授权端点', 2048);
    const tokenEndpoint = boundedString(payload.tokenEndpoint, 'Token 端点', 2048);
    const userInfoEndpoint = boundedString(payload.userInfoEndpoint, '用户信息端点', 2048);
    if (!displayName || !icon || !PROVIDER_ICON.test(icon)) {
        invalidRequest('OAuth 显示名称或按钮图标无效');
    }
    if (!buttonColor || !BUTTON_COLOR.test(buttonColor)) {
        invalidRequest('OAuth 按钮主题色无效');
    }
    if (!authorizationEndpoint || !tokenEndpoint || !userInfoEndpoint) {
        invalidRequest('OAuth 协议端点不能为空');
    }
    if (typeof payload.enabled !== 'boolean') invalidRequest('OAuth 开关无效');
    if (typeof payload.pkceEnabled !== 'boolean') {
        invalidRequest('OAuth PKCE 开关无效');
    }
    if (
        payload.tokenAuthMethod !== 'client_secret_post' &&
        payload.tokenAuthMethod !== 'client_secret_basic'
    ) {
        invalidRequest('OAuth client 鉴权方式无效');
    }
    return {
        displayName,
        icon,
        buttonColor: buttonColor.toLowerCase(),
        enabled: payload.enabled,
        clientId: boundedString(payload.clientId, 'Client ID', 512, false),
        clientSecret: boundedString(payload.clientSecret, 'Client Secret', 2048, false),
        redirectUri: boundedString(payload.redirectUri, '回调地址', 2048, false),
        authorizationEndpoint,
        tokenEndpoint,
        userInfoEndpoint,
        scopes: scopes(payload.scopes),
        tokenAuthMethod: payload.tokenAuthMethod,
        pkceEnabled: payload.pkceEnabled,
        profileSubjectPath: profilePath(payload.profileSubjectPath, '用户唯一标识路径', true)!,
        profileDisplayNamePath: profilePath(payload.profileDisplayNamePath, '显示名称路径', true)!,
        profileDisplayNameFallbackPath: profilePath(
            payload.profileDisplayNameFallbackPath,
            '显示名称回退路径',
            false,
        ),
        profileAvatarUrlPath: profilePath(payload.profileAvatarUrlPath, '头像路径', false),
    };
}

export function parsePlatformOAuthProviderCode(value: unknown): string {
    if (typeof value !== 'string' || !PROVIDER_CODE.test(value)) {
        invalidRequest('OAuth provider 无效');
    }
    return value;
}

export function parsePlatformOAuthProviderCreate(value: unknown): PlatformOAuthProviderCreateInput {
    const payload = requestRecord(value, 'OAuth 配置格式无效');
    exactKeys(payload, ['code', ...WRITE_KEYS]);
    const code = parsePlatformOAuthProviderCode(payload.code);
    return { code, ...writeInput(payload) };
}

export function parsePlatformOAuthProviderUpdate(
    value: unknown,
): Omit<PlatformOAuthProviderUpdateInput, 'code'> {
    const payload = requestRecord(value, 'OAuth 配置格式无效');
    exactKeys(payload, [...WRITE_KEYS, 'expectedUpdatedAt']);
    return {
        ...writeInput(payload),
        expectedUpdatedAt: expectedUpdatedAt(payload.expectedUpdatedAt),
    };
}

export function parsePlatformOAuthProviderDelete(value: unknown): {
    expectedUpdatedAt: number;
} {
    const payload = requestRecord(value, 'OAuth 删除请求格式无效');
    exactKeys(payload, ['expectedUpdatedAt']);
    return { expectedUpdatedAt: expectedUpdatedAt(payload.expectedUpdatedAt) };
}
