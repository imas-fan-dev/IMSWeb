import type { LookupAddress } from 'node:dns';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import type { PlatformOAuthConfig } from '@/config/platform-oauth';
import {
    validatePlatformOAuthEndpoint,
    validatePlatformOAuthRedirectUri,
} from '@/config/platform-oauth';
import type { RuntimeEnvironment } from '@/config/env';
import { PlatformOAuthProviderValidationError } from '@/ports/oauth';
import type {
    PlatformOAuthClient,
    PlatformOAuthIdentityProfile,
    PlatformOAuthProviderAdminView,
    PlatformOAuthProviderCode,
    PlatformOAuthProviderConfigRecord,
    PlatformOAuthProviderCreateInput,
    PlatformOAuthProviderStore,
    PlatformOAuthProviderSummary,
    PlatformOAuthProviderUpdateInput,
    PlatformOAuthProviderWriteInput,
    PlatformOAuthSecretBox,
} from '@/ports/oauth';

interface RuntimeProvider extends PlatformOAuthProviderConfigRecord {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
}

function privateOrReservedAddress(address: string): boolean {
    if (isIP(address) === 4) {
        const [a = 0, b = 0, c = 0] = address.split('.').map(Number);
        return (
            a === 0 ||
            a === 10 ||
            a === 127 ||
            (a === 100 && b >= 64 && b <= 127) ||
            (a === 169 && b === 254) ||
            (a === 172 && b >= 16 && b <= 31) ||
            (a === 192 && b === 0 && (c === 0 || c === 2)) ||
            (a === 192 && b === 168) ||
            (a === 198 && (b === 18 || b === 19)) ||
            (a === 198 && b === 51 && c === 100) ||
            (a === 203 && b === 0 && c === 113) ||
            a >= 224
        );
    }
    if (isIP(address) === 6) {
        const normalized = address.toLowerCase();
        if (normalized.startsWith('::ffff:')) {
            return privateOrReservedAddress(normalized.slice(7));
        }
        return (
            normalized === '::' ||
            normalized === '::1' ||
            normalized.startsWith('fc') ||
            normalized.startsWith('fd') ||
            /^fe[89ab]/.test(normalized) ||
            normalized.startsWith('ff') ||
            normalized.startsWith('100:') ||
            normalized.startsWith('2001:db8:')
        );
    }
    return true;
}

async function assertPublicOAuthEndpoint(
    value: string,
    environment: RuntimeEnvironment,
    allowInsecureLoopback: boolean,
): Promise<void> {
    const url = new URL(value);
    const localDevelopment =
        allowInsecureLoopback &&
        environment !== 'production' &&
        url.protocol === 'http:' &&
        ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
    if (localDevelopment) return;
    let addresses: LookupAddress[];
    try {
        addresses = await lookup(url.hostname, {
            all: true,
            verbatim: true,
        });
    } catch {
        throw new PlatformOAuthProviderValidationError(
            'OAuth endpoint hostname could not be resolved',
        );
    }
    if (!addresses.length || addresses.some(({ address }) => privateOrReservedAddress(address))) {
        throw new PlatformOAuthProviderValidationError(
            'OAuth endpoint resolved to a private or reserved address',
        );
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

type OAuthProfileValue = string | number | null | undefined;

function valueAtPath(payload: unknown, path: string | null): OAuthProfileValue {
    if (!path) return undefined;
    let current = payload;
    for (const segment of path.split('.')) {
        if (
            !isRecord(current) ||
            ['__proto__', 'prototype', 'constructor'].includes(segment) ||
            !Object.prototype.hasOwnProperty.call(current, segment)
        ) {
            return undefined;
        }
        current = current[segment];
    }
    return typeof current === 'string' || typeof current === 'number' || current === null
        ? current
        : undefined;
}

function boundedText(value: unknown, fallback: string, maximum: number): string {
    const raw =
        typeof value === 'string'
            ? value
            : typeof value === 'number' && Number.isFinite(value)
              ? String(value)
              : '';
    const normalized = raw.trim();
    if (!normalized) return fallback;
    return Array.from(normalized).slice(0, maximum).join('');
}

function avatarUrl(value: unknown): string | null {
    if (typeof value !== 'string' || value.length > 2048) return null;
    try {
        const parsed = new URL(value);
        return parsed.protocol === 'https:' ? parsed.toString() : null;
    } catch {
        return null;
    }
}

function providerProfile(
    provider: RuntimeProvider,
    payload: unknown,
): PlatformOAuthIdentityProfile {
    if (!isRecord(payload)) throw new Error('OAuth user profile is invalid');
    const subject = boundedText(valueAtPath(payload, provider.profileSubjectPath), '', 512);
    if (!subject) {
        throw new Error(`OAuth provider ${provider.code} profile has no subject`);
    }
    const fallback = boundedText(
        valueAtPath(payload, provider.profileDisplayNameFallbackPath),
        `${provider.displayName} user`,
        80,
    );
    return {
        providerCode: provider.code,
        subject,
        displayName: boundedText(
            valueAtPath(payload, provider.profileDisplayNamePath),
            fallback,
            80,
        ),
        avatarUrl: avatarUrl(valueAtPath(payload, provider.profileAvatarUrlPath)),
    };
}

function maskClientId(value: string | null): string | null {
    if (!value) return null;
    const normalized = value.trim();
    if (!normalized) return null;
    return `••••${Array.from(normalized).slice(-4).join('')}`;
}

function normalizedScopes(scopes: readonly string[]): string[] {
    return [...new Set(scopes.map((scope) => scope.trim()).filter(Boolean))];
}

export class ConfiguredPlatformOAuthClient implements PlatformOAuthClient {
    private readonly requestTimeoutMs: number;
    private readonly allowInsecureLoopbackEndpoints: boolean;
    private readonly runtime: RuntimeEnvironment;

    constructor(
        config: PlatformOAuthConfig,
        private readonly store: PlatformOAuthProviderStore,
        private readonly secretBox: PlatformOAuthSecretBox,
        private readonly fetcher: typeof globalThis.fetch = globalThis.fetch,
        runtime = String(process.env.NODE_ENV || 'development') as RuntimeEnvironment,
    ) {
        this.requestTimeoutMs = config.requestTimeoutMs;
        this.allowInsecureLoopbackEndpoints = config.allowInsecureLoopbackEndpoints;
        this.runtime = runtime;
    }

    async listProviders(): Promise<PlatformOAuthProviderSummary[]> {
        const providers: PlatformOAuthProviderSummary[] = [];
        for (const row of await this.store.listOAuthProviderConfigs()) {
            const provider = await this.configuredProvider(row);
            if (provider) {
                providers.push({
                    code: provider.code,
                    displayName: provider.displayName,
                    icon: provider.icon,
                    buttonColor: provider.buttonColor,
                });
            }
        }
        return providers;
    }

    async listProviderSettings(): Promise<PlatformOAuthProviderAdminView[]> {
        return Promise.all(
            (await this.store.listOAuthProviderConfigs()).map((row) => this.adminView(row)),
        );
    }

    async createProvider(
        input: PlatformOAuthProviderCreateInput,
    ): Promise<
        | { status: 'created'; provider: PlatformOAuthProviderAdminView }
        | { status: 'conflict'; provider: PlatformOAuthProviderAdminView }
    > {
        await this.validateProviderEndpoints(input);
        const record = this.providerRecord(input, undefined, Date.now());
        const result = await this.store.createOAuthProviderConfig(record);
        return {
            status: result.status,
            provider: await this.adminView(result.provider),
        };
    }

    async updateProvider(
        input: PlatformOAuthProviderUpdateInput,
    ): Promise<
        | { status: 'saved'; provider: PlatformOAuthProviderAdminView }
        | { status: 'conflict'; provider: PlatformOAuthProviderAdminView }
        | { status: 'not-found' }
    > {
        const row = (await this.store.listOAuthProviderConfigs()).find(
            (candidate) => candidate.code === input.code,
        );
        if (!row) return { status: 'not-found' };
        await this.validateProviderEndpoints(input);
        const record = this.providerRecord(input, row, Date.now());
        const result = await this.store.updateOAuthProviderConfig({
            ...record,
            expectedUpdatedAt: input.expectedUpdatedAt,
        });
        if (result.status === 'not-found') return result;
        return {
            status: result.status,
            provider: await this.adminView(result.provider),
        };
    }

    deleteProvider(
        code: PlatformOAuthProviderCode,
        expectedUpdatedAt: number,
    ): Promise<'deleted' | 'conflict' | 'in-use' | 'not-found'> {
        return this.store.deleteOAuthProviderConfig(code, expectedUpdatedAt);
    }

    async createAuthorizationUrl(
        providerCode: PlatformOAuthProviderCode,
        input: { state: string; codeChallenge: string },
    ): Promise<URL | null> {
        const provider = await this.findConfiguredProvider(providerCode);
        if (!provider) return null;
        let url: URL;
        try {
            url = new URL(provider.authorizationEndpoint);
        } catch {
            return null;
        }
        url.searchParams.set('client_id', provider.clientId);
        url.searchParams.set('redirect_uri', provider.redirectUri);
        url.searchParams.set('response_type', 'code');
        url.searchParams.set('state', input.state);
        if (provider.pkceEnabled) {
            url.searchParams.set('code_challenge', input.codeChallenge);
            url.searchParams.set('code_challenge_method', 'S256');
        }
        if (provider.scopes.length) {
            url.searchParams.set('scope', provider.scopes.join(' '));
        }
        return url;
    }

    async exchangeAuthorizationCode(
        providerCode: PlatformOAuthProviderCode,
        input: { code: string; codeVerifier: string },
    ): Promise<PlatformOAuthIdentityProfile> {
        const provider = await this.findConfiguredProvider(providerCode);
        if (!provider) throw new Error('OAuth provider is not configured');
        const parameters = new URLSearchParams({
            code: input.code,
            grant_type: 'authorization_code',
            redirect_uri: provider.redirectUri,
        });
        if (provider.pkceEnabled) {
            parameters.set('code_verifier', input.codeVerifier);
        }
        const headers: Record<string, string> = {
            Accept: 'application/json',
            'Content-Type': 'application/x-www-form-urlencoded',
        };
        if (provider.tokenAuthMethod === 'client_secret_basic') {
            headers.Authorization = `Basic ${Buffer.from(
                `${provider.clientId}:${provider.clientSecret}`,
            ).toString('base64')}`;
        } else {
            parameters.set('client_id', provider.clientId);
            parameters.set('client_secret', provider.clientSecret);
        }
        const token = await this.fetchPayload(provider.tokenEndpoint, {
            method: 'POST',
            headers,
            body: parameters,
        });
        const accessToken = isRecord(token) ? token.access_token : undefined;
        if (typeof accessToken !== 'string' || !accessToken) {
            throw new Error('OAuth token exchange did not return an access token');
        }
        const profile = await this.fetchPayload(provider.userInfoEndpoint, {
            headers: {
                Accept: 'application/json',
                Authorization: `Bearer ${accessToken}`,
                'User-Agent': 'IMSWeb-Platform-OAuth',
            },
        });
        return providerProfile(provider, profile);
    }

    private providerRecord(
        input: PlatformOAuthProviderWriteInput,
        current: PlatformOAuthProviderConfigRecord | undefined,
        updatedAt: number,
    ): PlatformOAuthProviderConfigRecord {
        const clientIdCiphertext =
            input.clientId === undefined
                ? (current?.clientIdCiphertext ?? null)
                : input.clientId.trim()
                  ? this.secretBox.encrypt(input.clientId.trim())
                  : null;
        const clientSecretCiphertext =
            input.clientSecret === undefined
                ? (current?.clientSecretCiphertext ?? null)
                : input.clientSecret.trim()
                  ? this.secretBox.encrypt(input.clientSecret.trim())
                  : null;
        const redirectUri =
            input.redirectUri === undefined
                ? (current?.redirectUri ?? null)
                : input.redirectUri.trim()
                  ? validatePlatformOAuthRedirectUri(
                        input.redirectUri.trim(),
                        this.runtime,
                        'redirectUri',
                        this.allowInsecureLoopbackEndpoints,
                    )
                  : null;
        const record: PlatformOAuthProviderConfigRecord = {
            code: input.code.trim(),
            displayName: input.displayName.trim(),
            icon: input.icon.trim(),
            buttonColor: input.buttonColor.toLowerCase(),
            enabled: input.enabled,
            clientIdCiphertext,
            clientSecretCiphertext,
            redirectUri,
            authorizationEndpoint: validatePlatformOAuthEndpoint(
                input.authorizationEndpoint,
                this.runtime,
                'authorizationEndpoint',
                this.allowInsecureLoopbackEndpoints,
            ),
            tokenEndpoint: validatePlatformOAuthEndpoint(
                input.tokenEndpoint,
                this.runtime,
                'tokenEndpoint',
                this.allowInsecureLoopbackEndpoints,
            ),
            userInfoEndpoint: validatePlatformOAuthEndpoint(
                input.userInfoEndpoint,
                this.runtime,
                'userInfoEndpoint',
                this.allowInsecureLoopbackEndpoints,
            ),
            scopes: normalizedScopes(input.scopes),
            tokenAuthMethod: input.tokenAuthMethod,
            pkceEnabled: input.pkceEnabled,
            profileSubjectPath: input.profileSubjectPath,
            profileDisplayNamePath: input.profileDisplayNamePath,
            profileDisplayNameFallbackPath: input.profileDisplayNameFallbackPath,
            profileAvatarUrlPath: input.profileAvatarUrlPath,
            updatedAt,
        };
        if (
            record.enabled &&
            (!record.clientIdCiphertext || !record.clientSecretCiphertext || !record.redirectUri)
        ) {
            throw new PlatformOAuthProviderValidationError(
                'OAuth provider requires client credentials and redirect URI',
            );
        }
        return record;
    }

    private async findConfiguredProvider(
        code: PlatformOAuthProviderCode,
    ): Promise<RuntimeProvider | null> {
        const row = (await this.store.listOAuthProviderConfigs()).find(
            (candidate) => candidate.code === code,
        );
        return row ? this.configuredProvider(row) : null;
    }

    private async configuredProvider(
        row: PlatformOAuthProviderConfigRecord,
    ): Promise<RuntimeProvider | null> {
        if (!row.enabled || !row.redirectUri) return null;
        if (!row.clientIdCiphertext || !row.clientSecretCiphertext) return null;
        try {
            const clientId = this.secretBox.decrypt(row.clientIdCiphertext).trim();
            const clientSecret = this.secretBox.decrypt(row.clientSecretCiphertext).trim();
            if (!clientId || !clientSecret) return null;
            return {
                ...row,
                authorizationEndpoint: validatePlatformOAuthEndpoint(
                    row.authorizationEndpoint,
                    this.runtime,
                    'authorizationEndpoint',
                    this.allowInsecureLoopbackEndpoints,
                ),
                tokenEndpoint: validatePlatformOAuthEndpoint(
                    row.tokenEndpoint,
                    this.runtime,
                    'tokenEndpoint',
                    this.allowInsecureLoopbackEndpoints,
                ),
                userInfoEndpoint: validatePlatformOAuthEndpoint(
                    row.userInfoEndpoint,
                    this.runtime,
                    'userInfoEndpoint',
                    this.allowInsecureLoopbackEndpoints,
                ),
                clientId,
                clientSecret,
                redirectUri: validatePlatformOAuthRedirectUri(
                    row.redirectUri,
                    this.runtime,
                    'redirectUri',
                    this.allowInsecureLoopbackEndpoints,
                ),
            };
        } catch {
            return null;
        }
    }

    private async adminView(
        row: PlatformOAuthProviderConfigRecord,
    ): Promise<PlatformOAuthProviderAdminView> {
        let clientId: string | null = null;
        let clientSecretValid = false;
        if (row.clientIdCiphertext) {
            try {
                clientId = this.secretBox.decrypt(row.clientIdCiphertext).trim();
            } catch {
                clientId = null;
            }
        }
        if (row.clientSecretCiphertext) {
            try {
                clientSecretValid = Boolean(
                    this.secretBox.decrypt(row.clientSecretCiphertext).trim(),
                );
            } catch {
                clientSecretValid = false;
            }
        }
        return {
            code: row.code,
            displayName: row.displayName,
            icon: row.icon,
            buttonColor: row.buttonColor,
            enabled: row.enabled,
            configured: Boolean(clientId && clientSecretValid && row.redirectUri),
            clientIdMasked: maskClientId(clientId),
            redirectUri: row.redirectUri,
            authorizationEndpoint: row.authorizationEndpoint,
            tokenEndpoint: row.tokenEndpoint,
            userInfoEndpoint: row.userInfoEndpoint,
            scopes: row.scopes,
            tokenAuthMethod: row.tokenAuthMethod,
            pkceEnabled: row.pkceEnabled,
            profileSubjectPath: row.profileSubjectPath,
            profileDisplayNamePath: row.profileDisplayNamePath,
            profileDisplayNameFallbackPath: row.profileDisplayNameFallbackPath,
            profileAvatarUrlPath: row.profileAvatarUrlPath,
            updatedAt: row.updatedAt,
        };
    }

    private async validateProviderEndpoints(input: PlatformOAuthProviderWriteInput): Promise<void> {
        await Promise.all([
            assertPublicOAuthEndpoint(
                input.authorizationEndpoint,
                this.runtime,
                this.allowInsecureLoopbackEndpoints,
            ),
            assertPublicOAuthEndpoint(
                input.tokenEndpoint,
                this.runtime,
                this.allowInsecureLoopbackEndpoints,
            ),
            assertPublicOAuthEndpoint(
                input.userInfoEndpoint,
                this.runtime,
                this.allowInsecureLoopbackEndpoints,
            ),
        ]);
    }

    private async fetchPayload(url: string, init: RequestInit): Promise<unknown> {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.requestTimeoutMs);
        try {
            await assertPublicOAuthEndpoint(url, this.runtime, this.allowInsecureLoopbackEndpoints);
            const response = await this.fetcher(url, {
                ...init,
                redirect: 'error',
                signal: controller.signal,
            });
            if (!response.ok) throw new Error('OAuth provider request failed');
            const body = await response.text();
            try {
                return JSON.parse(body) as unknown;
            } catch {
                return Object.fromEntries(new URLSearchParams(body));
            }
        } finally {
            clearTimeout(timeout);
        }
    }
}
