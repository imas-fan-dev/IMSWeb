import assert from "node:assert/strict";
import test from "node:test";
import { parseNodeCacheConfig } from "@/config/cache";

test("cache configuration defaults tests to memory and development to local Valkey", () => {
    assert.deepEqual(parseNodeCacheConfig({ NODE_ENV: "test" }), {
        backend: "memory",
        valkeyUrl: undefined,
        keyPrefix: "imsweb:cache:",
        connectTimeoutMs: 5000,
    });
    assert.deepEqual(parseNodeCacheConfig({ NODE_ENV: "development" }), {
        backend: "valkey",
        valkeyUrl: "redis://127.0.0.1:6379",
        keyPrefix: "imsweb:cache:",
        connectTimeoutMs: 5000,
    });
});

test("production cache configuration requires Valkey and validates its URL", () => {
    assert.throws(
        () => parseNodeCacheConfig({ NODE_ENV: "production" }),
        /IMS_VALKEY_URL is required/,
    );
    assert.throws(
        () =>
            parseNodeCacheConfig({
                NODE_ENV: "production",
                IMS_CACHE_BACKEND: "memory",
            }),
        /IMS_CACHE_BACKEND=valkey is required/,
    );
    assert.deepEqual(
        parseNodeCacheConfig({
            NODE_ENV: "production",
            IMS_CACHE_BACKEND: "valkey",
            IMS_VALKEY_URL: "rediss://cache.example.test:6380",
        }),
        {
            backend: "valkey",
            valkeyUrl: "rediss://cache.example.test:6380",
            keyPrefix: "imsweb:cache:",
            connectTimeoutMs: 5000,
        },
    );
});

test("cache configuration rejects unsafe prefixes and timeouts", () => {
    assert.throws(
        () =>
            parseNodeCacheConfig({
                NODE_ENV: "development",
                IMS_VALKEY_KEY_PREFIX: "cache prefix",
            }),
        /IMS_VALKEY_KEY_PREFIX/,
    );
    assert.throws(
        () =>
            parseNodeCacheConfig({
                NODE_ENV: "development",
                IMS_VALKEY_CONNECT_TIMEOUT_MS: "100",
            }),
        /IMS_VALKEY_CONNECT_TIMEOUT_MS/,
    );
    assert.throws(
        () =>
            parseNodeCacheConfig({
                NODE_ENV: "development",
                IMS_VALKEY_URL: "http://127.0.0.1:6379",
            }),
        /redis:\/\//,
    );
});
