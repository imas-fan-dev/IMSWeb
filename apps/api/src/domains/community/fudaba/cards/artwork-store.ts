import type { ImageProcessor } from '@/ports/media';
import type { ObjectStorage } from '@/ports/object-storage';
import {
    CARD_PAGE_WIDTHS,
    cardPageCacheObjectKey,
    cardPageObjectKey
} from '@/utils/storage/business-object-keys';
import { randomUUID } from 'node:crypto';

export type CardPageQueue = 'live' | 'pending';

export interface CardPageStoreRuntime {
    storage?: ObjectStorage | undefined;
    images?: ImageProcessor | undefined;
}

export interface StoreCardPageInput {
    cardId: string;
    queue: CardPageQueue;
    pageId: string;
    body: Uint8Array;
    width: number;
    height: number;
    accountId: string;
    /** Optional ownership token so a failed claim/supplement copy can be compensated. */
    ownerToken?: string;
    /** Called before the put so a failed write can still be compensated. */
    onBeforePut?: (key: string) => void;
}

export interface StoredCardPage {
    pageId: string;
    version: string;
    key: string;
    width: number;
    height: number;
}

/**
 * 写入一面名片图：只负责对象本身，不生成缩略图、不发布、不改数据库。
 * 数据库行由调用方在同一事务里写入；发布由 `publishCardPage` 在确认为线上时执行。
 */
export async function storeCardPage(
    runtime: CardPageStoreRuntime,
    input: StoreCardPageInput
): Promise<StoredCardPage> {
    const storage = runtime.storage;
    if (!storage) throw new Error('Object storage is unavailable');
    const version = randomUUID();
    const key = cardPageObjectKey(
        input.cardId,
        input.queue,
        input.pageId,
        version
    );
    input.onBeforePut?.(key);
    await storage.put(key, input.body, {
        contentType: 'image/webp',
        // 所有页面先私有落盘；上线时由 publish 决定可见性。
        protectedAccess: true,
        ...(input.ownerToken ? { ownerToken: input.ownerToken } : {}),
        metadata: {
            kind: 'fudaba-card-image',
            page: input.pageId,
            queue: input.queue,
            account: input.accountId
        }
    });
    return {
        pageId: input.pageId,
        version,
        key,
        width: input.width,
        height: input.height
    };
}

/** 把已经落盘的页面转为公开对象（只在确认它要上墙时调用）。 */
export async function publishCardPage(
    runtime: CardPageStoreRuntime,
    page: StoredCardPage
): Promise<void> {
    if (!runtime.storage?.publish) {
        throw new Error('Object storage publication is unavailable');
    }
    await runtime.storage.publish(page.key);
}

export interface SizedCardPageRequest {
    key: string;
    width: number;
}

/**
 * 读取按宽度缩放后的副本：命中缓存直接返回，未命中用 sharp 生成并按版本缓存。
 * 缓存 key 与源对象同作用域，私有图的缓存不会因为被缓存而公开。
 */
export async function readSizedCardPage(
    runtime: CardPageStoreRuntime,
    input: SizedCardPageRequest
): Promise<{ body: Uint8Array; contentType: string; cacheKey: string } | null> {
    const storage = runtime.storage;
    if (!storage) throw new Error('Object storage is unavailable');
    if (!(CARD_PAGE_WIDTHS as readonly number[]).includes(input.width)) {
        throw Object.assign(new Error('不支持的图片宽度'), { status: 400 });
    }
    const cacheKey = cacheKeyFor(input.key, input.width);
    if (cacheKey) {
        const cached = await storage.get(cacheKey);
        if (cached) {
            return { body: cached.body, contentType: cached.contentType, cacheKey };
        }
    }
    const source = await storage.get(input.key);
    if (!source) return null;
    if (!runtime.images?.resizeWebp) {
        throw new Error('Image resizing is unavailable');
    }
    const body = await runtime.images.resizeWebp(source.body, input.width);
    if (cacheKey) {
        await storage.put(cacheKey, body, {
            contentType: 'image/webp',
            // 与源对象一致：源是私有对象时，缓存也必须私有。
            protectedAccess: await isProtected(storage, input.key)
        });
    }
    return { body, contentType: 'image/webp', cacheKey: cacheKey ?? input.key };
}

function cacheKeyFor(key: string, width: number): string | null {
    // cards/<cardId>/<queue>/<pageId>.<version>.webp
    const match = /^community\/fudaba\/cards\/([^/]+)\/([^/]+)\/(front|back|page-[0-9a-f-]{8,})\.([0-9a-f-]{8,})\.webp$/.exec(
        key
    );
    if (!match) return null;
    return cardPageCacheObjectKey(match[1]!, match[2]!, match[3]!, match[4]!, width);
}

async function isProtected(
    storage: ObjectStorage,
    key: string
): Promise<boolean> {
    // 存储适配器不暴露作用域时按私有处理：宁可多一次鉴权，也不误公开。
    if (!storage.createPublicReadUrl) return true;
    try {
        return (await storage.createPublicReadUrl(key)) === null;
    } catch {
        return true;
    }
}
