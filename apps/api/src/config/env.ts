import { isFudabaMapPrefix } from "@imsweb/contracts/fudaba/map-delivery";

export type RuntimeEnvironment = "development" | "test" | "production";

export interface CookieOptions {
    httpOnly: boolean;
    secure: boolean;
    sameSite: "lax";
    path: string;
}

const runtimeEnvironment = String(process.env.NODE_ENV || "development")
    .trim()
    .toLowerCase();

if (!["development", "test", "production"].includes(runtimeEnvironment)) {
    throw new Error(
        `NODE_ENV must be development, test, or production (received ${runtimeEnvironment})`,
    );
}

export const RUNTIME_ENV = runtimeEnvironment as RuntimeEnvironment;
export const IS_PRODUCTION = RUNTIME_ENV === "production";
const DEVELOPMENT_SECRET = "dev-only-insecure-change-me";
const DEVELOPMENT_PLATFORM_SECRET =
    "dev-only-insecure-platform-secret-change-me";
const DEFAULT_STORY_MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const DEFAULT_SITE_PACKAGE_MAX_UPLOAD_BYTES = 80 * 1024 * 1024;

export function parseSitePackageMaxUploadBytes(
    value: string | undefined,
): number {
    if (value === undefined) return DEFAULT_SITE_PACKAGE_MAX_UPLOAD_BYTES;
    const parsed = Number(value);
    if (
        !Number.isSafeInteger(parsed) ||
        parsed < 1 ||
        parsed > DEFAULT_SITE_PACKAGE_MAX_UPLOAD_BYTES
    ) {
        throw new Error(
            "IMS_SITE_PACKAGE_MAX_UPLOAD_BYTES must be a positive safe integer no greater than " +
                DEFAULT_SITE_PACKAGE_MAX_UPLOAD_BYTES,
        );
    }
    return parsed;
}

export function parseStoryMaxUploadBytes(value: string | undefined): number {
    if (value === undefined) return DEFAULT_STORY_MAX_UPLOAD_BYTES;
    const parsed = Number(value);
    if (
        !Number.isSafeInteger(parsed) ||
        parsed < 1 ||
        parsed > DEFAULT_STORY_MAX_UPLOAD_BYTES
    ) {
        throw new Error(
            `IMS_STORY_MAX_UPLOAD_BYTES must be a positive safe integer no greater than ${DEFAULT_STORY_MAX_UPLOAD_BYTES}`,
        );
    }
    return parsed;
}

function envFlag(name: string, fallback: boolean): boolean {
    const value = process.env[name];
    if (value === undefined) return fallback;
    return !["0", "false", "no", "off"].includes(value.toLowerCase());
}

export interface BackofficeJwtSecretConfig {
    secret: string;
    legacySecret?: string;
}

export function parseBackofficeJwtSecrets(
    environment: NodeJS.ProcessEnv = process.env,
): BackofficeJwtSecretConfig {
    const mode = String(environment.NODE_ENV || "development")
        .trim()
        .toLowerCase();
    const production = mode === "production";
    const configuredSecret = environment.IMS_BACKOFFICE_JWT_SECRET;
    const legacySecret = environment.IMS_JWT_SECRET;
    const platformSecret = environment.IMS_PLATFORM_JWT_SECRET;

    if (production) {
        if (!configuredSecret) {
            throw new Error(
                "IMS_BACKOFFICE_JWT_SECRET is required in production and must be at least " +
                    "32 UTF-8 bytes; legacy IMS_JWT_SECRET is required only during the " +
                    "Backoffice compatibility window",
            );
        }
        if (Buffer.byteLength(configuredSecret, "utf8") < 32) {
            throw new Error(
                "IMS_BACKOFFICE_JWT_SECRET must be at least 32 UTF-8 bytes in production",
            );
        }
        if (legacySecret && Buffer.byteLength(legacySecret, "utf8") < 32) {
            throw new Error(
                "IMS_JWT_SECRET must be at least 32 UTF-8 bytes in production while " +
                    "legacy Backoffice verification is enabled",
            );
        }
        if (
            platformSecret &&
            (configuredSecret === platformSecret ||
                legacySecret === platformSecret)
        ) {
            throw new Error(
                "Backoffice JWT verification secrets and IMS_PLATFORM_JWT_SECRET must be " +
                    "different in production",
            );
        }
        return {
            secret: configuredSecret,
            ...(legacySecret ? { legacySecret } : {}),
        };
    }

    if (configuredSecret) {
        return {
            secret: configuredSecret,
            ...(legacySecret ? { legacySecret } : {}),
        };
    }
    if (legacySecret) {
        console.warn(
            "[SECURITY WARNING] IMS_JWT_SECRET is deprecated; set " +
                "IMS_BACKOFFICE_JWT_SECRET instead.",
        );
        return { secret: legacySecret, legacySecret };
    }
    console.warn(
        "[SECURITY WARNING] IMS_BACKOFFICE_JWT_SECRET is not set; using an insecure " +
            "development-only secret.",
    );
    return { secret: DEVELOPMENT_SECRET };
}

export function parsePlatformJwtSecret(
    environment: NodeJS.ProcessEnv = process.env,
): string {
    const mode = String(environment.NODE_ENV || "development")
        .trim()
        .toLowerCase();
    const production = mode === "production";
    const platformSecret = environment.IMS_PLATFORM_JWT_SECRET;
    if (production) {
        if (!platformSecret) {
            throw new Error(
                "IMS_PLATFORM_JWT_SECRET is required in production and must be at least " +
                    "32 UTF-8 bytes",
            );
        }
        if (Buffer.byteLength(platformSecret, "utf8") < 32) {
            throw new Error(
                "IMS_PLATFORM_JWT_SECRET must be at least 32 UTF-8 bytes in production",
            );
        }
        if (
            platformSecret === environment.IMS_BACKOFFICE_JWT_SECRET ||
            platformSecret === environment.IMS_JWT_SECRET
        ) {
            throw new Error(
                "IMS_PLATFORM_JWT_SECRET must be different from all Backoffice JWT " +
                    "verification secrets in production",
            );
        }
        return platformSecret;
    }
    if (platformSecret) return platformSecret;
    console.warn(
        "[SECURITY WARNING] IMS_PLATFORM_JWT_SECRET is not set; using an insecure " +
            "development-only Platform secret.",
    );
    return DEVELOPMENT_PLATFORM_SECRET;
}

const backofficeJwtSecrets = parseBackofficeJwtSecrets();
export const BACKOFFICE_JWT_SECRET = backofficeJwtSecrets.secret;
export const LEGACY_BACKOFFICE_JWT_SECRET = backofficeJwtSecrets.legacySecret;
export const PLATFORM_JWT_SECRET = parsePlatformJwtSecret();
export const STORY_MAX_UPLOAD_BYTES = parseStoryMaxUploadBytes(
    process.env.IMS_STORY_MAX_UPLOAD_BYTES,
);
export const SITE_PACKAGE_MAX_UPLOAD_BYTES = parseSitePackageMaxUploadBytes(
    process.env.IMS_SITE_PACKAGE_MAX_UPLOAD_BYTES,
);

export function parseSuperAdminUsername(
    value: string | undefined,
): string | undefined {
    const username = value?.trim();
    if (!username) return undefined;
    if (username.length > 128 || /[\0-\x1f\x7f]/.test(username)) {
        throw new Error(
            "IMS_SUPER_ADMIN_USERNAME must be at most 128 printable characters",
        );
    }
    return username;
}

export const SUPER_ADMIN_USERNAME = parseSuperAdminUsername(
    process.env.IMS_SUPER_ADMIN_USERNAME,
);

export function parseClientAddressSource(
    value: string | undefined,
): "direct" | "nginx" {
    const source = value?.trim().toLowerCase() || "direct";
    if (source !== "direct" && source !== "nginx") {
        throw new Error("IMS_CLIENT_ADDRESS_SOURCE must be direct or nginx");
    }
    return source;
}

export function parseFudabaPublicReadEnabled(
    value: string | undefined,
): boolean {
    const normalized = value?.trim().toLowerCase();
    if (!normalized) return false;
    if (["1", "true", "yes", "on"].includes(normalized)) return true;
    if (["0", "false", "no", "off"].includes(normalized)) return false;
    throw new Error("IMS_FUDABA_PUBLIC_READ_ENABLED must be true or false");
}

export function parseFudabaWriteEnabled(value: string | undefined): boolean {
    const normalized = value?.trim().toLowerCase();
    if (!normalized) return false;
    if (["1", "true", "yes", "on"].includes(normalized)) return true;
    if (["0", "false", "no", "off"].includes(normalized)) return false;
    throw new Error("IMS_FUDABA_WRITE_ENABLED must be true or false");
}

export interface FudabaMapConfig {
    enabled: boolean;
    styleUrl: string;
    prefixes: string[];
}

export interface FudabaGeocodingConfig {
    enabled: boolean;
    endpoint: string;
    userAgent: string;
    countryCodes: string;
}

export function parseFudabaMapEnabled(value: string | undefined): boolean {
    const normalized = value?.trim().toLowerCase();
    if (!normalized) return false;
    if (normalized === "true") return true;
    if (normalized === "false") return false;
    throw new Error("IMS_FUDABA_MAP_ENABLED must be true or false");
}

export function parseFudabaMapStyleUrl(value: string | undefined): string {
    if (value === undefined || value === "") return "";
    if (/[\0-\x1f\x7f]/.test(value)) {
        throw new Error(
            "IMS_FUDABA_MAP_STYLE_URL must be a same-origin absolute path " +
                "without query or hash",
        );
    }
    const normalized = value.trim();
    if (!normalized) return "";
    if (
        normalized.length > 2048 ||
        !normalized.startsWith("/") ||
        normalized.includes("//") ||
        normalized.includes("\\") ||
        normalized.includes("?") ||
        normalized.includes("#")
    ) {
        throw new Error(
            "IMS_FUDABA_MAP_STYLE_URL must be a same-origin absolute path " +
                "without query or hash",
        );
    }
    return normalized;
}

/**
 * Deployment allowlist of map delivery prefixes an operator may select.
 *
 * This is the trust boundary for operator-editable delivery: the stored
 * selection is checked against this list on both the write path and the read
 * path, so a poisoned object-store value falls back to the env default
 * instead of reaching a browser. An unset variable means no prefix may be
 * selected and the deployment stays on IMS_FUDABA_MAP_STYLE_URL.
 */
export function parseFudabaMapPrefixes(value: string | undefined): string[] {
    if (value === undefined) return [];
    const prefixes: string[] = [];
    for (const entry of value.split(",")) {
        const prefix = entry.trim();
        if (!prefix) continue;
        if (!isFudabaMapPrefix(prefix)) {
            throw new Error(
                "IMS_FUDABA_MAP_PREFIXES entries must be root-relative paths or " +
                    "absolute http(s) URLs ending with / and carrying no " +
                    `credentials, query, or hash (received ${prefix})`,
            );
        }
        if (!prefixes.includes(prefix)) prefixes.push(prefix);
    }
    return prefixes;
}

export function parseFudabaMapConfig(
    environment: NodeJS.ProcessEnv = process.env,
): FudabaMapConfig {
    const enabled = parseFudabaMapEnabled(environment.IMS_FUDABA_MAP_ENABLED);
    const styleUrl = parseFudabaMapStyleUrl(
        environment.IMS_FUDABA_MAP_STYLE_URL,
    );
    if (enabled && !styleUrl) {
        throw new Error(
            "IMS_FUDABA_MAP_STYLE_URL is required when IMS_FUDABA_MAP_ENABLED=true",
        );
    }
    const prefixes = parseFudabaMapPrefixes(
        environment.IMS_FUDABA_MAP_PREFIXES,
    );
    return { enabled, styleUrl, prefixes };
}

export function parseFudabaGeocodingConfig(
    environment: NodeJS.ProcessEnv = process.env,
): FudabaGeocodingConfig {
    const endpointValue =
        environment.IMS_FUDABA_GEOCODING_ENDPOINT?.trim() || "";
    const userAgent = environment.IMS_FUDABA_GEOCODING_USER_AGENT?.trim() || "";
    const countryCodes =
        environment.IMS_FUDABA_GEOCODING_COUNTRY_CODES?.trim().toLowerCase() ||
        "cn";
    if (!endpointValue) {
        if (userAgent) {
            throw new Error(
                "IMS_FUDABA_GEOCODING_ENDPOINT is required when a geocoding User-Agent is set",
            );
        }
        return { enabled: false, endpoint: "", userAgent: "", countryCodes };
    }
    let endpoint: URL;
    try {
        endpoint = new URL(endpointValue);
    } catch {
        throw new Error(
            "IMS_FUDABA_GEOCODING_ENDPOINT must be a valid HTTPS URL",
        );
    }
    if (
        endpoint.protocol !== "https:" ||
        endpoint.username ||
        endpoint.password ||
        endpoint.search ||
        endpoint.hash
    ) {
        throw new Error(
            "IMS_FUDABA_GEOCODING_ENDPOINT must be a credential-free HTTPS URL without query or hash",
        );
    }
    if (
        userAgent.length < 10 ||
        userAgent.length > 200 ||
        /[\0-\x1f\x7f]/.test(userAgent)
    ) {
        throw new Error(
            "IMS_FUDABA_GEOCODING_USER_AGENT must be 10-200 printable characters",
        );
    }
    if (!/^[a-z]{2}(?:,[a-z]{2})*$/.test(countryCodes)) {
        throw new Error(
            "IMS_FUDABA_GEOCODING_COUNTRY_CODES must be comma-separated ISO country codes",
        );
    }
    return {
        enabled: true,
        endpoint: endpoint.toString(),
        userAgent,
        countryCodes,
    };
}

export const CLIENT_ADDRESS_SOURCE = parseClientAddressSource(
    process.env.IMS_CLIENT_ADDRESS_SOURCE,
);
export const FUDABA_PUBLIC_READ_ENABLED = parseFudabaPublicReadEnabled(
    process.env.IMS_FUDABA_PUBLIC_READ_ENABLED,
);
export const FUDABA_WRITE_ENABLED = parseFudabaWriteEnabled(
    process.env.IMS_FUDABA_WRITE_ENABLED,
);
export const FUDABA_MAP_CONFIG = parseFudabaMapConfig();
export const FUDABA_MAP_ENABLED = FUDABA_MAP_CONFIG.enabled;
export const FUDABA_MAP_STYLE_URL = FUDABA_MAP_CONFIG.styleUrl;
export const FUDABA_MAP_PREFIXES = FUDABA_MAP_CONFIG.prefixes;
export const FUDABA_GEOCODING_CONFIG = parseFudabaGeocodingConfig();
const COOKIE_SECURE = envFlag("IMS_COOKIE_SECURE", IS_PRODUCTION);

export const COOKIE_OPTIONS: CookieOptions = {
    httpOnly: true,
    secure: COOKIE_SECURE,
    sameSite: "lax",
    path: "/",
};

export const CSRF_COOKIE_OPTIONS: CookieOptions = {
    httpOnly: false,
    secure: COOKIE_SECURE,
    sameSite: "lax",
    path: "/",
};
