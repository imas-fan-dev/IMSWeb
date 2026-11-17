import {
    parseCommunityContent,
    serializeCommunityContent,
    validateCommunityContentDraft,
    type CommunityContent,
    type CommunityContentDraft,
    defaultCommunityContent,
    communityImageFilename,
} from '@/domains/content/community-content/data';
import type { ObjectStorage } from '@/ports/object-storage';
import {
    COMMUNITY_CONTENT_OBJECT_KEY,
    communityContentAssetObjectKey,
} from '@/utils/storage/business-object-keys';

const CONTENT_TYPE = 'application/json; charset=utf-8';

export interface CommunityContentSnapshot {
    content: CommunityContent;
    revision: string | null;
}

export interface SavedCommunityContentSnapshot extends CommunityContentSnapshot {
    content: CommunityContent;
    revision: string;
}

export async function readCommunityContent(
    storage: ObjectStorage,
): Promise<CommunityContentSnapshot> {
    const object = await storage.get(COMMUNITY_CONTENT_OBJECT_KEY);
    return object
        ? { content: parseCommunityContent(object.body), revision: object.etag }
        : { content: defaultCommunityContent(), revision: null };
}

export async function saveCommunityContent(
    storage: ObjectStorage,
    value: CommunityContentDraft,
    expectedRevision: string | null,
): Promise<SavedCommunityContentSnapshot> {
    if (!storage.putIfUnchanged)
        throw new Error('Atomic community content storage unavailable');
    const current = await readCommunityContent(storage);
    if (current.revision !== expectedRevision) {
        throw Object.assign(
            new Error('制作人社区已被其他管理员更新，请刷新后重试'),
            {
                status: 409,
            },
        );
    }
    const content: CommunityContent = {
        ...validateCommunityContentDraft(value),
        updatedAt: new Date().toISOString(),
    };
    for (const entry of content.entries) {
        if (
            entry.imageUrl &&
            !(await storage.exists(
                communityContentAssetObjectKey(
                    communityImageFilename(entry.imageUrl),
                ),
            ))
        ) {
            throw Object.assign(new Error('图片素材不存在'), { status: 400 });
        }
    }
    const body = serializeCommunityContent(content);
    const stored = await storage.putIfUnchanged(
        COMMUNITY_CONTENT_OBJECT_KEY,
        expectedRevision,
        body,
        { contentType: CONTENT_TYPE, protectedAccess: true },
    );
    if (!stored) {
        throw Object.assign(
            new Error('制作人社区已被其他管理员更新，请刷新后重试'),
            {
                status: 409,
            },
        );
    }
    return { content, revision: stored.etag };
}
