import type { ObjectStorage } from '@/ports/object-storage';
import { publicMediaObjectKey } from '@/utils/storage/business-object-keys';

export async function resolvePublicObjectUrl(
    storage: ObjectStorage,
    key: string,
    fallback: string
): Promise<string> {
    if (!storage.createPublicReadUrl) return fallback;
    try {
        return await storage.createPublicReadUrl(key, { publicPath: fallback }) ?? fallback;
    } catch {
        return fallback;
    }
}

export async function requirePublicObjectUrl(
    storage: ObjectStorage,
    key: string
): Promise<string> {
    if (!storage.createPublicReadUrl) {
        throw Object.assign(new Error('公开对象读取地址未配置'), { status: 503 });
    }
    try {
        const url = await storage.createPublicReadUrl(key);
        if (url) return url;
    } catch (cause) {
        throw Object.assign(new Error('公开对象读取地址不可用', { cause }), {
            status: 503
        });
    }
    throw Object.assign(new Error('公开对象读取地址不可用'), { status: 503 });
}

export async function resolvePublicMediaUrl(
    storage: ObjectStorage,
    value: string
): Promise<string> {
    if (!value.startsWith('/') || value.startsWith('//')) return value;
    try {
        return await resolvePublicObjectUrl(storage, publicMediaObjectKey(value), value);
    } catch {
        return value;
    }
}

export async function resolvePublicMediaFields<T extends Record<string, unknown>>(
    storage: ObjectStorage,
    record: T,
    fields: readonly string[]
): Promise<T> {
    const resolved: Record<string, unknown> = { ...record };
    await Promise.all(fields.map(async (field) => {
        const value = record[field];
        if (typeof value === 'string' && value) {
            resolved[field] = await resolvePublicMediaUrl(storage, value);
        }
    }));
    return resolved as T;
}
