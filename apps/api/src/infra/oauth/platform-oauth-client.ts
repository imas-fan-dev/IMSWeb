import type {
    PlatformOAuthConfig,
    PlatformOAuthProviderDefinition,
} from "@/config/platform-oauth";
import { validatePlatformOAuthRedirectUri } from "@/config/platform-oauth";
import type { RuntimeEnvironment } from "@/config/env";
import type {
    PlatformOAuthClient,
    PlatformOAuthIdentityProfile,
    PlatformOAuthProviderAdminView,
    PlatformOAuthProviderCode,
    PlatformOAuthProviderConfigRecord,
    PlatformOAuthProviderStore,
    PlatformOAuthProviderSummary,
    PlatformOAuthProviderUpdateInput,
    PlatformOAuthSecretBox,
} from "@/ports/oauth";

interface RuntimeProvider extends PlatformOAuthProviderDefinition {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
    displayName: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function boundedText(
    value: unknown,
    fallback: string,
    maximum: number,
): string {
    if (typeof value !== "string") return fallback;
    const normalized = value.trim();
    if (!normalized) return fallback;
    return Array.from(normalized).slice(0, maximum).join("");
}

function avatarUrl(value: unknown): string | null {
    if (typeof value !== "string" || value.length > 2048) return null;
    try {
        const parsed = new URL(value);
        return parsed.protocol === "https:" ? parsed.toString() : null;
    } catch {
        return null;
    }
}

function providerProfile(
    provider: RuntimeProvider,
    payload: unknown,
): PlatformOAuthIdentityProfile {
    if (!isRecord(payload)) throw new Error("OAuth user profile is invalid");
    if (provider.code === "google") {
        const subject = boundedText(payload.sub, "", 512);
        if (!subject) throw new Error("Google OAuth profile has no subject");
        const fallback = boundedText(payload.email, "Google user", 80);
        return {
            providerCode: provider.code,
            subject,
            displayName: boundedText(payload.name, fallback, 80),
            avatarUrl: avatarUrl(payload.picture),
        };
    }

    const rawId = payload.id;
    const subject =
        typeof rawId === "number" && Number.isSafeInteger(rawId) && rawId >= 0
            ? String(rawId)
            : boundedText(rawId, "", 512);
    if (!subject) throw new Error("GitHub OAuth profile has no subject");
    const login = boundedText(payload.login, "GitHub user", 80);
    return {
        providerCode: provider.code,
        subject,
        displayName: boundedText(payload.name, login, 80),
        avatarUrl: avatarUrl(payload.avatar_url),
    };
}

function maskClientId(value: string | null): string | null {
    if (!value) return null;
    const normalized = value.trim();
    if (!normalized) return null;
    return `••••${Array.from(normalized).slice(-4).join("")}`;
}

export class ConfiguredPlatformOAuthClient implements PlatformOAuthClient {
    private readonly definitions: Map<
        PlatformOAuthProviderCode,
        PlatformOAuthProviderDefinition
    >;
    private readonly requestTimeoutMs: number;
    private readonly runtime: RuntimeEnvironment;

    constructor(
        config: PlatformOAuthConfig,
        private readonly store: PlatformOAuthProviderStore,
        private readonly secretBox: PlatformOAuthSecretBox,
        private readonly fetcher: typeof globalThis.fetch = globalThis.fetch,
        runtime = String(
            process.env.NODE_ENV || "development",
        ) as RuntimeEnvironment,
    ) {
        this.definitions = new Map(
            config.providers.map((provider) => [provider.code, provider]),
        );
        this.requestTimeoutMs = config.requestTimeoutMs;
        this.runtime = runtime;
    }

    async listProviders(): Promise<PlatformOAuthProviderSummary[]> {
        const rows = await this.store.listOAuthProviderConfigs();
        const providers: PlatformOAuthProviderSummary[] = [];
        for (const row of rows) {
            const provider = await this.configuredProvider(row);
            if (provider) {
                providers.push({
                    code: provider.code,
                    displayName: provider.displayName,
                    icon: provider.icon,
                });
            }
        }
        return providers;
    }

    async listProviderSettings(): Promise<PlatformOAuthProviderAdminView[]> {
        const rows = await this.store.listOAuthProviderConfigs();
        return rows.flatMap((row) => {
            const definition = this.definitions.get(row.code);
            if (!definition) return [];
            let clientId: string | null = null;
            if (row.clientIdCiphertext) {
                try {
                    clientId = this.secretBox.decrypt(row.clientIdCiphertext);
                } catch {
                    clientId = null;
                }
            }
            return [
                {
                    code: row.code,
                    displayName: row.displayName || definition.displayName,
                    icon: definition.icon,
                    enabled: row.enabled,
                    configured: Boolean(
                        row.clientIdCiphertext &&
                            row.clientSecretCiphertext &&
                            row.redirectUri,
                    ),
                    clientIdMasked: maskClientId(clientId),
                    redirectUri: row.redirectUri,
                    updatedAt: row.updatedAt,
                },
            ];
        });
    }

    async updateProvider(
        input: PlatformOAuthProviderUpdateInput,
    ): Promise<
        | { status: "saved"; provider: PlatformOAuthProviderAdminView }
        | { status: "conflict"; provider: PlatformOAuthProviderAdminView }
        | { status: "not-found" }
    > {
        const row = (await this.store.listOAuthProviderConfigs()).find(
            (candidate) => candidate.code === input.code,
        );
        if (!row) return { status: "not-found" };
        const definition = this.definitions.get(input.code);
        if (!definition) return { status: "not-found" };

        const clientIdCiphertext =
            input.clientId === undefined
                ? row.clientIdCiphertext
                : input.clientId.trim()
                  ? this.secretBox.encrypt(input.clientId.trim())
                  : null;
        const clientSecretCiphertext =
            input.clientSecret === undefined
                ? row.clientSecretCiphertext
                : input.clientSecret.trim()
                  ? this.secretBox.encrypt(input.clientSecret.trim())
                  : null;
        const redirectUri =
            input.redirectUri === undefined
                ? row.redirectUri
                : input.redirectUri.trim()
                  ? validatePlatformOAuthRedirectUri(
                        input.redirectUri.trim(),
                        this.runtime,
                        "redirectUri",
                    )
                  : null;

        if (
            input.enabled &&
            (!clientIdCiphertext || !clientSecretCiphertext || !redirectUri)
        ) {
            throw new Error(
                "OAuth provider requires client credentials and redirect URI",
            );
        }

        const result = await this.store.updateOAuthProviderConfig({
            code: input.code,
            displayName: input.displayName.trim(),
            enabled: input.enabled,
            clientIdCiphertext,
            clientSecretCiphertext,
            redirectUri,
            expectedUpdatedAt: input.expectedUpdatedAt,
            updatedAt: Date.now(),
        });
        if (result.status === "not-found") return result;
        const provider = await this.adminView(result.provider);
        return { status: result.status, provider };
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
        url.searchParams.set("client_id", provider.clientId);
        url.searchParams.set("redirect_uri", provider.redirectUri);
        url.searchParams.set("response_type", "code");
        url.searchParams.set("state", input.state);
        url.searchParams.set("code_challenge", input.codeChallenge);
        url.searchParams.set("code_challenge_method", "S256");
        if (provider.scopes.length) {
            url.searchParams.set("scope", provider.scopes.join(" "));
        }
        return url;
    }

    async exchangeAuthorizationCode(
        providerCode: PlatformOAuthProviderCode,
        input: { code: string; codeVerifier: string },
    ): Promise<PlatformOAuthIdentityProfile> {
        const provider = await this.findConfiguredProvider(providerCode);
        if (!provider) throw new Error("OAuth provider is not configured");
        const token = await this.fetchJson(provider.tokenEndpoint, {
            method: "POST",
            headers: {
                Accept: "application/json",
                "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({
                client_id: provider.clientId,
                client_secret: provider.clientSecret,
                code: input.code,
                code_verifier: input.codeVerifier,
                grant_type: "authorization_code",
                redirect_uri: provider.redirectUri,
            }),
        });
        const accessToken = isRecord(token) ? token.access_token : undefined;
        if (typeof accessToken !== "string" || !accessToken) {
            throw new Error(
                "OAuth token exchange did not return an access token",
            );
        }
        const profile = await this.fetchJson(provider.userInfoEndpoint, {
            headers: {
                Accept: "application/json",
                Authorization: `Bearer ${accessToken}`,
                ...(provider.code === "github"
                    ? { "User-Agent": "IMSWeb-Platform-OAuth" }
                    : {}),
            },
        });
        return providerProfile(provider, profile);
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
        const definition = this.definitions.get(row.code);
        if (!definition || !row.enabled || !row.redirectUri) return null;
        if (!row.clientIdCiphertext || !row.clientSecretCiphertext) return null;
        try {
            const clientId = this.secretBox
                .decrypt(row.clientIdCiphertext)
                .trim();
            const clientSecret = this.secretBox
                .decrypt(row.clientSecretCiphertext)
                .trim();
            if (!clientId || !clientSecret) return null;
            const redirectUri = validatePlatformOAuthRedirectUri(
                row.redirectUri,
                this.runtime,
                "redirectUri",
            );
            return {
                ...definition,
                displayName: row.displayName || definition.displayName,
                clientId,
                clientSecret,
                redirectUri,
            };
        } catch {
            return null;
        }
    }

    private async adminView(
        row: PlatformOAuthProviderConfigRecord,
    ): Promise<PlatformOAuthProviderAdminView> {
        let clientId: string | null = null;
        if (row.clientIdCiphertext) {
            try {
                clientId = this.secretBox.decrypt(row.clientIdCiphertext);
            } catch {
                clientId = null;
            }
        }
        const definition = this.definitions.get(row.code);
        if (!definition)
            throw new Error("OAuth provider definition is missing");
        return {
            code: row.code,
            displayName: row.displayName || definition.displayName,
            icon: definition.icon,
            enabled: row.enabled,
            configured: Boolean(
                row.clientIdCiphertext &&
                    row.clientSecretCiphertext &&
                    row.redirectUri,
            ),
            clientIdMasked: maskClientId(clientId),
            redirectUri: row.redirectUri,
            updatedAt: row.updatedAt,
        };
    }

    private async fetchJson(url: string, init: RequestInit): Promise<unknown> {
        const controller = new AbortController();
        const timeout = setTimeout(
            () => controller.abort(),
            this.requestTimeoutMs,
        );
        try {
            const response = await this.fetcher(url, {
                ...init,
                signal: controller.signal,
            });
            if (!response.ok) throw new Error("OAuth provider request failed");
            return await response.json();
        } finally {
            clearTimeout(timeout);
        }
    }
}
