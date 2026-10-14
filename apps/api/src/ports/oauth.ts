export type PlatformOAuthProviderCode = string;

export class PlatformOAuthProviderValidationError extends Error {
    override readonly name = 'PlatformOAuthProviderValidationError';
}
export type PlatformOAuthTokenAuthMethod = 'client_secret_post' | 'client_secret_basic';

export interface PlatformOAuthProviderDisplay {
    code: PlatformOAuthProviderCode;
    displayName: string;
    icon: string;
    buttonColor: string;
}

export interface PlatformOAuthProviderProtocol {
    authorizationEndpoint: string;
    tokenEndpoint: string;
    userInfoEndpoint: string;
    scopes: string[];
    tokenAuthMethod: PlatformOAuthTokenAuthMethod;
    pkceEnabled: boolean;
    profileSubjectPath: string;
    profileDisplayNamePath: string;
    profileDisplayNameFallbackPath: string | null;
    profileAvatarUrlPath: string | null;
}

export interface PlatformOAuthProviderConfigRecord
    extends PlatformOAuthProviderDisplay, PlatformOAuthProviderProtocol {
    enabled: boolean;
    clientIdCiphertext: string | null;
    clientSecretCiphertext: string | null;
    redirectUri: string | null;
    updatedAt: number;
}

export type PlatformOAuthProviderSummary = PlatformOAuthProviderDisplay;

export interface PlatformOAuthProviderAdminView
    extends PlatformOAuthProviderDisplay, PlatformOAuthProviderProtocol {
    enabled: boolean;
    configured: boolean;
    clientIdMasked: string | null;
    redirectUri: string | null;
    updatedAt: number;
}

export interface PlatformOAuthProviderWriteInput
    extends PlatformOAuthProviderDisplay, PlatformOAuthProviderProtocol {
    enabled: boolean;
    clientId?: string;
    clientSecret?: string;
    redirectUri?: string;
}

export interface PlatformOAuthProviderCreateInput extends PlatformOAuthProviderWriteInput {}

export interface PlatformOAuthProviderUpdateInput extends PlatformOAuthProviderWriteInput {
    expectedUpdatedAt: number;
}

export interface PlatformOAuthProviderStore {
    listOAuthProviderConfigs(): Promise<PlatformOAuthProviderConfigRecord[]>;
    createOAuthProviderConfig(
        input: Omit<PlatformOAuthProviderConfigRecord, 'updatedAt'> & { updatedAt: number },
    ): Promise<
        | { status: 'created'; provider: PlatformOAuthProviderConfigRecord }
        | { status: 'conflict'; provider: PlatformOAuthProviderConfigRecord }
    >;
    updateOAuthProviderConfig(
        input: PlatformOAuthProviderConfigRecord & {
            expectedUpdatedAt: number;
        },
    ): Promise<
        | { status: 'saved'; provider: PlatformOAuthProviderConfigRecord }
        | { status: 'conflict'; provider: PlatformOAuthProviderConfigRecord }
        | { status: 'not-found' }
    >;
    deleteOAuthProviderConfig(
        code: PlatformOAuthProviderCode,
        expectedUpdatedAt: number,
    ): Promise<'deleted' | 'conflict' | 'in-use' | 'not-found'>;
}

export interface PlatformOAuthSecretBox {
    encrypt(value: string): string;
    decrypt(value: string): string;
}

export interface PlatformOAuthIdentityProfile {
    providerCode: PlatformOAuthProviderCode;
    subject: string;
    displayName: string;
    avatarUrl: string | null;
}

export interface PlatformOAuthClient {
    listProviders(): Promise<PlatformOAuthProviderSummary[]>;
    createProvider(
        input: PlatformOAuthProviderCreateInput,
    ): Promise<
        | { status: 'created'; provider: PlatformOAuthProviderAdminView }
        | { status: 'conflict'; provider: PlatformOAuthProviderAdminView }
    >;
    createAuthorizationUrl(
        providerCode: PlatformOAuthProviderCode,
        input: { state: string; codeChallenge: string },
    ): Promise<URL | null>;
    exchangeAuthorizationCode(
        providerCode: PlatformOAuthProviderCode,
        input: { code: string; codeVerifier: string },
    ): Promise<PlatformOAuthIdentityProfile>;
    listProviderSettings(): Promise<PlatformOAuthProviderAdminView[]>;
    updateProvider(
        input: PlatformOAuthProviderUpdateInput,
    ): Promise<
        | { status: 'saved'; provider: PlatformOAuthProviderAdminView }
        | { status: 'conflict'; provider: PlatformOAuthProviderAdminView }
        | { status: 'not-found' }
    >;
    deleteProvider(
        code: PlatformOAuthProviderCode,
        expectedUpdatedAt: number,
    ): Promise<'deleted' | 'conflict' | 'in-use' | 'not-found'>;
}

export interface OAuthServices {
    platformOAuth: PlatformOAuthClient;
}
