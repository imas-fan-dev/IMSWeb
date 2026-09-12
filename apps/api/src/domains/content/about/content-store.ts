import {
    parseAboutPageContent,
    serializeAboutPageContent,
    validateAboutPageDraft,
    type AboutPageContent,
    type AboutPageDraft
} from '@/domains/content/about/data';
import type { ObjectStorage } from '@/ports/object-storage';
import { ABOUT_PAGE_OBJECT_KEY } from '@/utils/storage/business-object-keys';

const CONTENT_TYPE = 'application/json; charset=utf-8';

export interface AboutPageSnapshot {
    content: AboutPageContent | null;
    revision: string | null;
}

export interface SavedAboutPageSnapshot extends AboutPageSnapshot {
    content: AboutPageContent;
    revision: string;
}

export async function readAboutPageContent(storage: ObjectStorage): Promise<AboutPageSnapshot> {
    const object = await storage.get(ABOUT_PAGE_OBJECT_KEY);
    return object
        ? { content: parseAboutPageContent(object.body), revision: object.etag }
        : { content: null, revision: null };
}

export async function saveAboutPageContent(
    storage: ObjectStorage,
    value: AboutPageDraft,
    expectedRevision: string | null
): Promise<SavedAboutPageSnapshot> {
    const current = await readAboutPageContent(storage);
    if (current.revision !== expectedRevision) {
        throw Object.assign(new Error('关于页已被其他管理员更新，请刷新后重试'), { status: 409 });
    }
    const content: AboutPageContent = {
        ...validateAboutPageDraft(value),
        updatedAt: new Date().toISOString()
    };
    const body = serializeAboutPageContent(content);
    const stored = storage.putIfUnchanged
        ? await storage.putIfUnchanged(
            ABOUT_PAGE_OBJECT_KEY,
            expectedRevision,
            body,
            { contentType: CONTENT_TYPE }
        )
        : await storage.put(ABOUT_PAGE_OBJECT_KEY, body, { contentType: CONTENT_TYPE });
    if (!stored) {
        throw Object.assign(new Error('关于页已被其他管理员更新，请刷新后重试'), { status: 409 });
    }
    return { content, revision: stored.etag };
}
