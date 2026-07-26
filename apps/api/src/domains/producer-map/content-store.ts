import {
    defaultProducerMapContent,
    parseProducerMapContent,
    serializeProducerMapContent,
    validateProducerMapDraft,
    type ProducerMapContent
} from '@/domains/producer-map/data';
import type { ObjectStorage } from '@/ports/object-storage';
import { PRODUCER_MAP_OBJECT_KEY } from '@/utils/storage/business-object-keys';

const CONTENT_TYPE = 'application/json; charset=utf-8';

export interface ProducerMapSnapshot {
    content: ProducerMapContent;
    revision: string | null;
}

export async function readProducerMapContent(
    storage: ObjectStorage
): Promise<ProducerMapSnapshot> {
    const object = await storage.get(PRODUCER_MAP_OBJECT_KEY);
    return object
        ? { content: parseProducerMapContent(object.body), revision: object.etag }
        : { content: defaultProducerMapContent(), revision: null };
}

export async function saveProducerMapContent(
    storage: ObjectStorage,
    value: unknown,
    expectedRevision: string | null
): Promise<ProducerMapSnapshot> {
    const current = await readProducerMapContent(storage);
    if (current.revision !== expectedRevision) {
        throw Object.assign(new Error('制作人地图已被其他管理员更新，请刷新后重试'), {
            status: 409
        });
    }
    const content: ProducerMapContent = {
        ...validateProducerMapDraft(value),
        updatedAt: new Date().toISOString()
    };
    const body = serializeProducerMapContent(content);
    const stored = storage.putIfUnchanged
        ? await storage.putIfUnchanged(
            PRODUCER_MAP_OBJECT_KEY,
            expectedRevision,
            body,
            { contentType: CONTENT_TYPE }
        )
        : await storage.put(PRODUCER_MAP_OBJECT_KEY, body, { contentType: CONTENT_TYPE });
    if (!stored) {
        throw Object.assign(new Error('制作人地图已被其他管理员更新，请刷新后重试'), {
            status: 409
        });
    }
    return { content, revision: stored.etag };
}
