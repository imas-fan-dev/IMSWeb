import {
    fudabaMapPrefixSchema,
    isFudabaMapPrefix
} from '@imsweb/contracts/fudaba/map-delivery';
import type { ObjectStorage } from '@/ports/object-storage';
import { FUDABA_MAP_DELIVERY_OBJECT_KEY } from '@/utils/storage/business-object-keys';

const CONTENT_TYPE = 'application/json; charset=utf-8';

export interface FudabaMapDeliverySelection {
    prefix: string;
    updatedAt: string | null;
}

export interface FudabaMapDeliveryStoreSnapshot {
    /**
     * The stored selection, but only when it still passes the schema and the
     * deployment allowlist. A stored value that fails either check reads as
     * `null` so the caller falls back to the env default; this read-path
     * re-validation is what makes a poisoned object harmless.
     */
    selection: FudabaMapDeliverySelection | null;
    /** The object's etag, surfaced even for a rejected selection so an
     * operator can overwrite it with a correct compare-and-swap. */
    revision: string | null;
}

export interface SavedFudabaMapDeliverySnapshot
    extends FudabaMapDeliveryStoreSnapshot {
    selection: FudabaMapDeliverySelection;
    revision: string;
}

function conflict(): never {
    throw Object.assign(new Error('地图分发前缀已被其他管理员更新，请刷新后重试'), {
        status: 409
    });
}

function unprocessable(message: string): never {
    throw Object.assign(new Error(message), { status: 422 });
}

/**
 * Validate a candidate prefix in two stages, because a schema cannot express
 * deployment data: shape first, then membership in the env allowlist.
 */
export function assertAllowedFudabaMapPrefix(
    value: unknown,
    allowedPrefixes: readonly string[]
): string {
    const parsed = fudabaMapPrefixSchema.safeParse(value);
    if (!parsed.success) {
        unprocessable('地图分发前缀格式无效');
    }
    if (!allowedPrefixes.includes(parsed.data)) {
        unprocessable('地图分发前缀不在部署允许列表内');
    }
    return parsed.data;
}

function readSelection(
    body: Uint8Array,
    allowedPrefixes: readonly string[]
): FudabaMapDeliverySelection | null {
    let value: unknown;
    try {
        value = JSON.parse(new TextDecoder().decode(body));
    } catch {
        return null;
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const source = value as Record<string, unknown>;
    const prefix = source.prefix;
    if (typeof prefix !== 'string') return null;
    const normalized = prefix.trim();
    if (!isFudabaMapPrefix(normalized)) return null;
    if (!allowedPrefixes.includes(normalized)) return null;
    const updatedAt = source.updatedAt;
    return {
        prefix: normalized,
        updatedAt:
            typeof updatedAt === 'string' && !Number.isNaN(Date.parse(updatedAt))
                ? updatedAt
                : null
    };
}

export async function readFudabaMapDelivery(
    storage: ObjectStorage,
    allowedPrefixes: readonly string[]
): Promise<FudabaMapDeliveryStoreSnapshot> {
    const object = await storage.get(FUDABA_MAP_DELIVERY_OBJECT_KEY);
    if (!object) return { selection: null, revision: null };
    return {
        selection: readSelection(object.body, allowedPrefixes),
        revision: object.etag
    };
}

export async function saveFudabaMapDelivery(
    storage: ObjectStorage,
    prefix: unknown,
    allowedPrefixes: readonly string[],
    expectedRevision: string | null
): Promise<SavedFudabaMapDeliverySnapshot> {
    const allowed = assertAllowedFudabaMapPrefix(prefix, allowedPrefixes);
    const current = await readFudabaMapDelivery(storage, allowedPrefixes);
    if (current.revision !== expectedRevision) conflict();
    const selection: FudabaMapDeliverySelection = {
        prefix: allowed,
        updatedAt: new Date().toISOString()
    };
    const body = new TextEncoder().encode(
        `${JSON.stringify(selection, null, 2)}\n`
    );
    if (!storage.putIfUnchanged) {
        throw Object.assign(
            new Error('Object storage does not support conditional writes'),
            { status: 503 }
        );
    }
    const stored = await storage.putIfUnchanged(
        FUDABA_MAP_DELIVERY_OBJECT_KEY,
        expectedRevision,
        body,
        { contentType: CONTENT_TYPE }
    );
    if (!stored) conflict();
    return { selection, revision: stored.etag };
}
