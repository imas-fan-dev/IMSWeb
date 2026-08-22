import { createHash } from "node:crypto";
import type { Context } from "hono";
import type { AppEnvironment } from "@/app";
import type { CacheStore } from "@/ports/cache";
import type { FudabaGeocodingRuntimeConfig } from "@/ports/runtime-services";
import { services } from "@/middleware/hono-context";

const RESULT_LIMIT = 5;
const CACHE_TTL_SECONDS = 24 * 60 * 60;
const ATTRIBUTION = "© OpenStreetMap contributors";
const LANGUAGE = "zh-CN,zh,en";

type PlaceSearchResponse = {
    success: true;
    items: Array<{
        id: string;
        label: string;
        address: string;
        city: string;
        location: {
            latitude: number;
            longitude: number;
            precision: "exact";
        };
    }>;
    attribution: string;
};

type UpstreamPlace = {
    place_id?: unknown;
    osm_type?: unknown;
    osm_id?: unknown;
    display_name?: unknown;
    name?: unknown;
    lat?: unknown;
    lon?: unknown;
    address?: unknown;
};

function query(value: string | undefined): string | null {
    const normalized = value?.trim().replace(/\s+/g, " ") || "";
    if (
        normalized.length < 2 ||
        normalized.length > 120 ||
        /[\0-\x1f\x7f]/.test(normalized)
    ) {
        return null;
    }
    return normalized;
}

function text(value: unknown, maximum: number): string | null {
    if (typeof value !== "string") return null;
    const normalized = value.trim().replace(/\s+/g, " ");
    return normalized && normalized.length <= maximum ? normalized : null;
}

function coordinate(
    value: unknown,
    minimum: number,
    maximum: number,
): number | null {
    if (typeof value !== "string" && typeof value !== "number") return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= minimum && parsed <= maximum
        ? parsed
        : null;
}

function addressPart(address: unknown, names: string[]): string | null {
    if (!address || typeof address !== "object" || Array.isArray(address))
        return null;
    const record = address as Record<string, unknown>;
    for (const name of names) {
        const value = text(record[name], 100);
        if (value) return value;
    }
    return null;
}

function identifier(value: unknown, maximum: number): string | null {
    if (typeof value === "number" && Number.isSafeInteger(value)) {
        return String(value);
    }
    return text(value, maximum);
}

function placeId(place: UpstreamPlace, index: number): string {
    const osmType = text(place.osm_type, 20);
    const osmId = identifier(place.osm_id, 40);
    if (osmType && osmId) return `${osmType}:${osmId}`;
    const providerId = identifier(place.place_id, 80);
    return providerId ? `place:${providerId}` : `result:${index}`;
}

function result(place: UpstreamPlace, index: number) {
    const address = text(place.display_name, 240);
    const latitude = coordinate(place.lat, -90, 90);
    const longitude = coordinate(place.lon, -180, 180);
    const city = addressPart(place.address, [
        "city",
        "town",
        "village",
        "municipality",
        "county",
        "state",
        "country",
    ]);
    if (!address || latitude === null || longitude === null || !city)
        return null;
    return {
        id: placeId(place, index),
        label: text(place.name, 160) ?? address,
        address,
        city,
        location: { latitude, longitude, precision: "exact" as const },
    };
}

function cacheKey(
    endpoint: string,
    countryCodes: string,
    search: string,
): string {
    const digest = createHash("sha256")
        .update(
            `${endpoint}\n${countryCodes}\n${LANGUAGE}\n${search.toLowerCase()}`,
        )
        .digest("hex");
    return `fudaba:place-search:${digest}`;
}

function cachedResponse(value: string | null): PlaceSearchResponse | null {
    if (!value) return null;
    try {
        const parsed = JSON.parse(value) as Partial<PlaceSearchResponse>;
        if (
            parsed.success !== true ||
            parsed.attribution !== ATTRIBUTION ||
            !Array.isArray(parsed.items)
        ) {
            return null;
        }
        return parsed as PlaceSearchResponse;
    } catch {
        return null;
    }
}

async function readCachedResponse(
    cache: CacheStore,
    key: string,
): Promise<PlaceSearchResponse | null> {
    try {
        return cachedResponse(await cache.get(key));
    } catch {
        return null;
    }
}

async function cacheResponse(
    cache: CacheStore,
    key: string,
    body: PlaceSearchResponse,
): Promise<void> {
    try {
        await cache.set(key, JSON.stringify(body), CACHE_TTL_SECONDS);
    } catch {
        // Search remains available when the cache is temporarily unavailable.
    }
}

async function searchProvider(
    fetcher: typeof globalThis.fetch,
    config: FudabaGeocodingRuntimeConfig,
    search: string,
): Promise<PlaceSearchResponse["items"]> {
    let url: URL;
    try {
        url = new URL(config.endpoint);
    } catch {
        throw new Error("Invalid geocoding provider endpoint");
    }
    url.searchParams.set("q", search);
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("addressdetails", "1");
    url.searchParams.set("limit", String(RESULT_LIMIT));
    url.searchParams.set("accept-language", LANGUAGE);
    if (config.countryCodes) {
        url.searchParams.set("countrycodes", config.countryCodes);
    }
    const response = await fetcher(url, {
        headers: {
            accept: "application/json",
            "accept-language": LANGUAGE,
            "user-agent": config.userAgent,
        },
        signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) throw new Error("Geocoding provider request failed");
    const payload = await response.json();
    if (!Array.isArray(payload)) throw new Error("Invalid geocoding response");
    return payload
        .slice(0, RESULT_LIMIT)
        .map((place, index) => result(place as UpstreamPlace, index))
        .filter((place) => place !== null);
}

export async function handleSearchFudabaPlaces(
    c: Context<AppEnvironment>,
): Promise<Response> {
    const search = query(c.req.query("q"));
    if (!search) {
        return c.json(
            {
                success: false,
                code: "FUDABA_PLACE_SEARCH_INVALID",
                message: "请输入 2 至 120 个字符的地点关键词",
            },
            400,
        );
    }

    const runtime = services(c);
    const config = runtime.config?.fudabaGeocoding;
    if (
        !config?.enabled ||
        !config.endpoint ||
        !config.userAgent ||
        !runtime.fetch ||
        !runtime.cache ||
        !runtime.rateLimiter
    ) {
        return c.json(
            {
                success: false,
                code: "FUDABA_PLACE_SEARCH_UNAVAILABLE",
            },
            503,
        );
    }

    const key = cacheKey(config.endpoint, config.countryCodes, search);
    const cached = await readCachedResponse(runtime.cache, key);
    if (cached) return c.json(cached);

    const limit = await runtime.rateLimiter.consume(
        "fudaba-geocoding-provider",
        "global",
        1,
        1,
    );
    if (!limit.allowed) {
        c.header(
            "Retry-After",
            String(Math.max(1, Math.ceil((limit.resetAt - Date.now()) / 1000))),
        );
        return c.json(
            {
                success: false,
                code: "FUDABA_PLACE_SEARCH_BUSY",
            },
            429,
        );
    }

    try {
        const body: PlaceSearchResponse = {
            success: true,
            items: await searchProvider(runtime.fetch, config, search),
            attribution: ATTRIBUTION,
        };
        await cacheResponse(runtime.cache, key, body);
        return c.json(body);
    } catch {
        return c.json(
            {
                success: false,
                code: "FUDABA_PLACE_SEARCH_FAILED",
            },
            502,
        );
    }
}
