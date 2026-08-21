export type PlatformOAuthProviderCode = "google" | "github";
export type PlatformOAuthProviderIcon = "google" | "github";

export interface PlatformOAuthProviderConfigRecord {
    code: PlatformOAuthProviderCode;
    displayName: string;
    icon: PlatformOAuthProviderIcon;
    enabled: boolean;
    clientIdCiphertext: string | null;
    clientSecretCiphertext: string | null;
    redirectUri: string | null;
    updatedAt: number;
}

export interface PlatformOAuthProviderSummary {
    code: PlatformOAuthProviderCode;
    displayName: string;
    icon: PlatformOAuthProviderIcon;
}

export interface PlatformOAuthProviderAdminView extends PlatformOAuthProviderSummary {
    enabled: boolean;
    configured: boolean;
    clientIdMasked: string | null;
    redirectUri: string | null;
    updatedAt: number;
}

export interface PlatformOAuthProviderUpdateInput {
    code: PlatformOAuthProviderCode;
    displayName: string;
    enabled: boolean;
    clientId: string | undefined;
    clientSecret: string | undefined;
    redirectUri: string | undefined;
    expectedUpdatedAt: number;
}

export interface PlatformOAuthProviderStore {
    listOAuthProviderConfigs(): Promise<PlatformOAuthProviderConfigRecord[]>;
    updateOAuthProviderConfig(input: {
        code: PlatformOAuthProviderCode;
        displayName: string;
        enabled: boolean;
        clientIdCiphertext: string | null;
        clientSecretCiphertext: string | null;
        redirectUri: string | null;
        expectedUpdatedAt: number;
        updatedAt: number;
    }): Promise<
        | { status: "saved"; provider: PlatformOAuthProviderConfigRecord }
        | { status: "conflict"; provider: PlatformOAuthProviderConfigRecord }
        | { status: "not-found" }
    >;
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
    createAuthorizationUrl(
        providerCode: PlatformOAuthProviderCode,
        input: { state: string; codeChallenge: string }
    ): Promise<URL | null>;
    exchangeAuthorizationCode(
        providerCode: PlatformOAuthProviderCode,
        input: { code: string; codeVerifier: string }
    ): Promise<PlatformOAuthIdentityProfile>;
    listProviderSettings(): Promise<PlatformOAuthProviderAdminView[]>;
    updateProvider(
        input: PlatformOAuthProviderUpdateInput
    ): Promise<
        | { status: "saved"; provider: PlatformOAuthProviderAdminView }
        | { status: "conflict"; provider: PlatformOAuthProviderAdminView }
        | { status: "not-found" }
    >;
}

export interface OAuthServices {
    platformOAuth: PlatformOAuthClient;
}
