import { isFudabaMapStyleUrl } from '@imsweb/contracts/fudaba/map-delivery';
import type { ObjectStorage } from '@/ports/object-storage';
import { FUDABA_MAP_DELIVERY_OBJECT_KEY } from '@/utils/storage/business-object-keys';

const CONTENT_TYPE = 'application/json; charset=utf-8';
const MAX_SOURCES = 50;
const SOURCE_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export interface FudabaMapSource {
    id: string;
    name: string;
    styleUrl: string;
}

export interface FudabaMapDeliveryStoreSnapshot {
    sources: FudabaMapSource[];
    activeSourceId: string;
    revision: string | null;
}

export interface SavedFudabaMapDeliverySnapshot
    extends FudabaMapDeliveryStoreSnapshot {
    revision: string;
}

function conflict(message = '地图源已被其他管理员更新，请刷新后重试'): never {
    throw Object.assign(new Error(message), { status: 409 });
}

function unprocessable(message: string): never {
    throw Object.assign(new Error(message), { status: 422 });
}

export function assertFudabaMapStyleUrl(value: unknown): string {
    if (typeof value !== 'string') {
        unprocessable('地图样式地址格式无效');
    }
    const normalized = value.trim();
    if (!isFudabaMapStyleUrl(normalized)) {
        unprocessable('地图样式地址格式无效');
    }
    return normalized;
}

export function assertFudabaMapSourceName(value: unknown): string {
    if (typeof value !== 'string') {
        unprocessable('地图源名称格式无效');
    }
    const normalized = value.trim();
    if (
        !normalized ||
        normalized.length > 80 ||
        /[\0-\x1f\x7f]/.test(normalized)
    ) {
        unprocessable('地图源名称格式无效');
    }
    return normalized;
}

function assertFudabaMapSourceId(value: unknown): string {
    if (
        typeof value !== 'string' ||
        value.length > 80 ||
        !SOURCE_ID_PATTERN.test(value)
    ) {
        unprocessable('地图源 ID 格式无效');
    }
    return value;
}

function seedSourceName(styleUrl: string): string {
    if (styleUrl.startsWith('/')) return '站点自托管';
    let url: URL;
    try {
        url = new URL(styleUrl);
    } catch {
        return '部署地图源';
    }
    const styleName = decodeURIComponent(
        url.pathname.split('/').filter(Boolean).at(-1) || '地图样式',
    );
    if (url.hostname === 'tiles.openfreemap.org') {
        return `OpenFreeMap ${styleName[0]?.toUpperCase() ?? ''}${styleName.slice(1)}`;
    }
    return `${url.hostname} · ${styleName}`.slice(0, 80);
}

function uniqueSourceName(
    preferred: string,
    usedNames: Set<string>,
    index: number,
): string {
    let candidate = preferred;
    let suffix = index + 1;
    while (usedNames.has(candidate.toLocaleLowerCase())) {
        const marker = ` (${suffix})`;
        candidate = `${preferred.slice(0, 80 - marker.length)}${marker}`;
        suffix += 1;
    }
    usedNames.add(candidate.toLocaleLowerCase());
    return candidate;
}

function seedSources(styleUrls: readonly string[]): FudabaMapSource[] {
    const uniqueUrls = [
        ...new Set(
            styleUrls
                .map((styleUrl) => styleUrl.trim())
                .filter(isFudabaMapStyleUrl),
        ),
    ].slice(0, MAX_SOURCES);
    const usedNames = new Set<string>();
    return uniqueUrls.map((styleUrl, index) => ({
        id: `seed-${index + 1}`,
        name: uniqueSourceName(seedSourceName(styleUrl), usedNames, index),
        styleUrl,
    }));
}

function validateSources(
    value: unknown,
    activeSourceId: unknown,
): { sources: FudabaMapSource[]; activeSourceId: string } {
    if (
        !Array.isArray(value) ||
        value.length < 1 ||
        value.length > MAX_SOURCES
    ) {
        unprocessable('地图源配置集合无效');
    }
    const sources = value.map((entry) => {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
            unprocessable('地图源配置格式无效');
        }
        const source = entry as Record<string, unknown>;
        return {
            id: assertFudabaMapSourceId(source.id),
            name: assertFudabaMapSourceName(source.name),
            styleUrl: assertFudabaMapStyleUrl(source.styleUrl),
        };
    });
    const ids = new Set(sources.map((source) => source.id));
    const names = new Set(
        sources.map((source) => source.name.toLocaleLowerCase()),
    );
    const styleUrls = new Set(sources.map((source) => source.styleUrl));
    if (
        ids.size !== sources.length ||
        names.size !== sources.length ||
        styleUrls.size !== sources.length
    ) {
        conflict('地图源名称和样式地址不能重复');
    }
    const active = assertFudabaMapSourceId(activeSourceId);
    if (!ids.has(active)) unprocessable('当前激活的地图源不存在');
    return { sources, activeSourceId: active };
}

function parseStoredDelivery(
    body: Uint8Array,
    seeds: FudabaMapSource[],
): { sources: FudabaMapSource[]; activeSourceId: string } | null {
    let value: unknown;
    try {
        value = JSON.parse(new TextDecoder().decode(body));
    } catch {
        return null;
    }
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return null;
    const stored = value as Record<string, unknown>;
    if (stored.version === 2) {
        try {
            return validateSources(stored.sources, stored.activeSourceId);
        } catch {
            return null;
        }
    }

    if (typeof stored.styleUrl !== 'string') return null;
    const legacyStyleUrl = stored.styleUrl.trim();
    if (!isFudabaMapStyleUrl(legacyStyleUrl)) return null;
    const sources = [...seeds];
    let active = sources.find((source) => source.styleUrl === legacyStyleUrl);
    if (!active && sources.length < MAX_SOURCES) {
        const usedNames = new Set(
            sources.map((source) => source.name.toLocaleLowerCase()),
        );
        active = {
            id: `seed-${sources.length + 1}`,
            name: uniqueSourceName(
                seedSourceName(legacyStyleUrl),
                usedNames,
                sources.length,
            ),
            styleUrl: legacyStyleUrl,
        };
        sources.push(active);
    }
    return active ? { sources, activeSourceId: active.id } : null;
}

export function createFudabaMapSourceId(
    existingSources: readonly FudabaMapSource[],
): string {
    const existingIds = new Set(existingSources.map((source) => source.id));
    let id: string;
    do {
        id = `source-${globalThis.crypto.randomUUID()}`;
    } while (existingIds.has(id));
    return id;
}

export async function readFudabaMapDelivery(
    storage: ObjectStorage,
    seedStyleUrls: readonly string[],
): Promise<FudabaMapDeliveryStoreSnapshot> {
    const seeds = seedSources(seedStyleUrls);
    if (!seeds.length) {
        throw Object.assign(new Error('Fudaba map style is unavailable'), {
            status: 503,
        });
    }
    const object = await storage.get(FUDABA_MAP_DELIVERY_OBJECT_KEY);
    if (!object) {
        return {
            sources: seeds,
            activeSourceId: seeds[0]!.id,
            revision: null,
        };
    }
    const stored = parseStoredDelivery(object.body, seeds);
    return {
        sources: stored?.sources ?? seeds,
        activeSourceId: stored?.activeSourceId ?? seeds[0]!.id,
        revision: object.etag,
    };
}

export async function saveFudabaMapDelivery(
    storage: ObjectStorage,
    sources: readonly FudabaMapSource[],
    activeSourceId: string,
    expectedRevision: string | null,
): Promise<SavedFudabaMapDeliverySnapshot> {
    const validated = validateSources(sources, activeSourceId);
    const current = await storage.get(FUDABA_MAP_DELIVERY_OBJECT_KEY);
    if ((current?.etag ?? null) !== expectedRevision) conflict();
    const body = new TextEncoder().encode(
        `${JSON.stringify(
            {
                version: 2,
                sources: validated.sources,
                activeSourceId: validated.activeSourceId,
                updatedAt: new Date().toISOString(),
            },
            null,
            2,
        )}\n`,
    );
    if (!storage.putIfUnchanged) {
        throw Object.assign(
            new Error('Object storage does not support conditional writes'),
            { status: 503 },
        );
    }
    const stored = await storage.putIfUnchanged(
        FUDABA_MAP_DELIVERY_OBJECT_KEY,
        expectedRevision,
        body,
        { contentType: CONTENT_TYPE },
    );
    if (!stored) conflict();
    return { ...validated, revision: stored.etag };
}
