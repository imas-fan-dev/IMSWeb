import type { RuntimeEnvironment } from "@/config/env";

export type CacheBackend = "memory" | "valkey";

export interface NodeCacheConfig {
    backend: CacheBackend;
    valkeyUrl?: string;
    keyPrefix: string;
    connectTimeoutMs: number;
}

const DEFAULT_VALKEY_URL = "redis://127.0.0.1:6379";
const DEFAULT_KEY_PREFIX = "imsweb:cache:";
const DEFAULT_CONNECT_TIMEOUT_MS = 5_000;

function runtime(environment: NodeJS.ProcessEnv): RuntimeEnvironment {
    const value = String(environment.NODE_ENV || "development")
        .trim()
        .toLowerCase();
    if (!["development", "test", "production"].includes(value)) {
        throw new Error("NODE_ENV must be development, test, or production");
    }
    return value as RuntimeEnvironment;
}

function parseBackend(
    value: string | undefined,
    environment: RuntimeEnvironment,
): CacheBackend {
    const configured = value?.trim().toLowerCase();
    const backend =
        configured || (environment === "test" ? "memory" : "valkey");
    if (backend !== "memory" && backend !== "valkey") {
        throw new Error("IMS_CACHE_BACKEND must be memory or valkey");
    }
    if (environment === "production" && backend !== "valkey") {
        throw new Error("IMS_CACHE_BACKEND=valkey is required in production");
    }
    return backend;
}

function parseValkeyUrl(
    value: string | undefined,
    environment: RuntimeEnvironment,
    backend: CacheBackend,
): string | undefined {
    if (backend !== "valkey") return undefined;
    const raw =
        value?.trim() ||
        (environment === "production" ? "" : DEFAULT_VALKEY_URL);
    if (!raw)
        throw new Error(
            "IMS_VALKEY_URL is required when Valkey cache is enabled",
        );
    let parsed: URL;
    try {
        parsed = new URL(raw);
    } catch {
        throw new Error(
            "IMS_VALKEY_URL must be a valid redis:// or rediss:// URL",
        );
    }
    if (!["redis:", "rediss:"].includes(parsed.protocol)) {
        throw new Error("IMS_VALKEY_URL must use redis:// or rediss://");
    }
    if (!parsed.hostname || parsed.search || parsed.hash) {
        throw new Error(
            "IMS_VALKEY_URL must include a host and no query or hash",
        );
    }
    return parsed.toString();
}

function parseKeyPrefix(value: string | undefined): string {
    const prefix = value?.trim() || DEFAULT_KEY_PREFIX;
    if (
        prefix.length > 128 ||
        /[\0-\x20\x7f]/.test(prefix) ||
        !/^[A-Za-z0-9:_-]+$/.test(prefix)
    ) {
        throw new Error(
            "IMS_VALKEY_KEY_PREFIX must contain at most 128 printable key characters",
        );
    }
    return prefix.endsWith(":") ? prefix : `${prefix}:`;
}

function parseConnectTimeout(value: string | undefined): number {
    if (value === undefined || value.trim() === "")
        return DEFAULT_CONNECT_TIMEOUT_MS;
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < 250 || parsed > 30_000) {
        throw new Error(
            "IMS_VALKEY_CONNECT_TIMEOUT_MS must be an integer between 250 and 30000",
        );
    }
    return parsed;
}

export function parseNodeCacheConfig(
    environment: NodeJS.ProcessEnv = process.env,
): NodeCacheConfig {
    const currentRuntime = runtime(environment);
    const backend = parseBackend(environment.IMS_CACHE_BACKEND, currentRuntime);
    return {
        backend,
        valkeyUrl: parseValkeyUrl(
            environment.IMS_VALKEY_URL,
            currentRuntime,
            backend,
        ),
        keyPrefix: parseKeyPrefix(environment.IMS_VALKEY_KEY_PREFIX),
        connectTimeoutMs: parseConnectTimeout(
            environment.IMS_VALKEY_CONNECT_TIMEOUT_MS,
        ),
    };
}
