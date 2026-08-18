import type { RuntimeEnvironment } from "@/config/env";
import type {
    PlatformOAuthProviderCode,
    PlatformOAuthProviderIcon,
} from "@/ports/oauth";

export interface PlatformOAuthProviderDefinition {
    code: PlatformOAuthProviderCode;
    displayName: string;
    icon: PlatformOAuthProviderIcon;
    authorizationEndpoint: string;
    tokenEndpoint: string;
    userInfoEndpoint: string;
    scopes: string[];
}

export interface PlatformOAuthConfig {
    providers: PlatformOAuthProviderDefinition[];
    requestTimeoutMs: number;
}

type ProviderDefinition = PlatformOAuthProviderDefinition;

export const PLATFORM_OAUTH_PROVIDER_DEFINITIONS: ProviderDefinition[] = [
    {
        code: "google",
        displayName: "Google",
        icon: "google",
        authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
        tokenEndpoint: "https://oauth2.googleapis.com/token",
        userInfoEndpoint: "https://openidconnect.googleapis.com/v1/userinfo",
        scopes: ["openid", "email", "profile"],
    },
    {
        code: "github",
        displayName: "GitHub",
        icon: "github",
        authorizationEndpoint: "https://github.com/login/oauth/authorize",
        tokenEndpoint: "https://github.com/login/oauth/access_token",
        userInfoEndpoint: "https://api.github.com/user",
        scopes: [],
    },
];

function environmentValue(
    environment: NodeJS.ProcessEnv,
    name: string,
): string {
    return String(environment[name] || "").trim();
}

export function validatePlatformOAuthRedirectUri(
    value: string,
    environment: RuntimeEnvironment,
    variableName = "redirectUri",
): string {
    let url: URL;
    try {
        url = new URL(value);
    } catch {
        throw new Error(`${variableName} must be an absolute URL`);
    }
    const localDevelopment =
        environment !== "production" &&
        url.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (url.protocol !== "https:" && !localDevelopment) {
        throw new Error(
            `${variableName} must use HTTPS, except for local development`,
        );
    }
    if (url.username || url.password || url.hash) {
        throw new Error(
            `${variableName} must not contain credentials or a fragment`,
        );
    }
    return url.toString();
}

function parseRequestTimeout(value: string): number {
    if (!value) return 10_000;
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < 1_000 || parsed > 30_000) {
        throw new Error(
            "IMS_PLATFORM_OAUTH_REQUEST_TIMEOUT_MS must be an integer from 1000 to 30000",
        );
    }
    return parsed;
}

export function parsePlatformOAuthConfig(
    environment: NodeJS.ProcessEnv = process.env,
): PlatformOAuthConfig {
    return {
        providers: PLATFORM_OAUTH_PROVIDER_DEFINITIONS,
        requestTimeoutMs: parseRequestTimeout(
            environmentValue(
                environment,
                "IMS_PLATFORM_OAUTH_REQUEST_TIMEOUT_MS",
            ),
        ),
    };
}
