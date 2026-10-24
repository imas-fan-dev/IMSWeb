import type { FudabaMapProviderConfig, FudabaMapSource, FudabaMapRouting } from '@imsweb/contracts/fudaba/map-delivery';
import type { ObjectStorage } from '@/ports/object-storage';
import { FUDABA_MAP_DELIVERY_OBJECT_KEY } from '@/utils/storage/business-object-keys';
import { decodeStoredMapProvider, describeMapProvider, describeRegionalSearchMap } from '@/domains/community/fudaba/map-delivery/map-provider-policy';
import { seedFudabaMapSources } from '@/domains/community/fudaba/map-delivery/map-delivery-bootstrap';

const CONTENT_TYPE = 'application/json; charset=utf-8';
const MAX_SOURCES = 50;
export const FUDABA_MAP_DELIVERY_VERSION = 4;
const SOURCE_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type { FudabaMapSource } from '@imsweb/contracts/fudaba/map-delivery';

export interface FudabaMapDeliveryStoreSnapshot {
    sources: FudabaMapSource[];
    activeSourceId: string;
    revision: string | null;
    routing?: FudabaMapRouting;
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
        const config = decodeStoredMapProvider(source);
        return {
            id: assertFudabaMapSourceId(source.id),
            name: assertFudabaMapSourceName(source.name),
            ...config,
        };
    });
    const ids = new Set(sources.map((source) => source.id));
    const names = new Set(
        sources.map((source) => source.name.toLocaleLowerCase()),
    );
    const styleUrls = new Set(sources.map((source) => describeMapProvider(source).identity));
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
): { sources: FudabaMapSource[]; activeSourceId: string; routing?: FudabaMapRouting } | null {
    let value: unknown;
    try {
        value = JSON.parse(new TextDecoder().decode(body));
    } catch {
        return null;
    }
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return null;
    const stored = value as Record<string, unknown>;
    if (stored.version !== FUDABA_MAP_DELIVERY_VERSION) return null;
    try {
        const allowed = ['version', 'sources', 'activeSourceId', 'updatedAt', 'routing'];
        if (Object.keys(stored).some((key) => !allowed.includes(key))) return null;
        if (typeof stored.updatedAt !== 'string' || !Number.isFinite(Date.parse(stored.updatedAt))) return null;
        const validated = validateSources(stored.sources, stored.activeSourceId);
        const routing = validateRouting(stored.routing, validated.sources);
        return { ...validated, ...(routing ? { routing } : {}) };
    } catch {
        return null;
    }
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
    storage: Pick<ObjectStorage, 'get'>,
    seedConfigs: readonly FudabaMapProviderConfig[],
): Promise<FudabaMapDeliveryStoreSnapshot> {
    const object = await storage.get(FUDABA_MAP_DELIVERY_OBJECT_KEY);
    const stored = object ? parseStoredDelivery(object.body) : null;
    if (stored && object) return { ...stored, revision: object.etag };
    const seeds = seedFudabaMapSources(seedConfigs, MAX_SOURCES);
    if (!seeds.length) {
        throw Object.assign(new Error('Fudaba map style is unavailable'), {
            status: 503,
        });
    }
    if (!object) {
        return {
            sources: seeds,
            activeSourceId: seeds[0]!.id,
            revision: null,
        };
    }
    return {
        sources: seeds,
        activeSourceId: seeds[0]!.id,
        revision: object.etag,
    };
}

export async function saveFudabaMapDelivery(
    storage: ObjectStorage,
    sources: readonly FudabaMapSource[],
    activeSourceId: string,
    expectedRevision: string | null,
    routing?: FudabaMapRouting,
): Promise<SavedFudabaMapDeliverySnapshot> {
    const validated = validateSources(sources, activeSourceId);
    const regional = validateRouting(routing, validated.sources);
    const current = await storage.get(FUDABA_MAP_DELIVERY_OBJECT_KEY);
    if ((current?.etag ?? null) !== expectedRevision) conflict();
    const body = new TextEncoder().encode(
        `${JSON.stringify(
            {
                version: FUDABA_MAP_DELIVERY_VERSION,
                sources: validated.sources,
                activeSourceId: validated.activeSourceId,
                ...(regional ? { routing: regional } : {}),
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
    return { ...validated, revision: stored.etag, ...(regional ? { routing: regional } : {}) };
}

function validateRouting(value: unknown, sources: readonly FudabaMapSource[]): FudabaMapRouting | undefined {
    if (value === undefined) return undefined;
    if (!value || typeof value !== 'object' || Array.isArray(value)) unprocessable('地区分流配置无效');
    const record = value as Record<string, unknown>;
    if (Object.keys(record).length !== 2 || !('mainlandSourceId' in record) || !('overseasSourceId' in record)) unprocessable('地区分流配置无效');
    const mainlandSourceId = assertFudabaMapSourceId(record.mainlandSourceId);
    const overseasSourceId = assertFudabaMapSourceId(record.overseasSourceId);
    if (![mainlandSourceId, overseasSourceId].every((id) => sources.some((source) => source.id === id))) {
        conflict('地区分流引用的地图源不存在，请先修改分流配置');
    }
    describeRegionalSearchMap(sources.find((source) => source.id === mainlandSourceId)!, sources.find((source) => source.id === overseasSourceId)!);
    return { mainlandSourceId, overseasSourceId };
}
