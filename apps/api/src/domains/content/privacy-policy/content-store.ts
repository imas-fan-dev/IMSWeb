import {
    parsePrivacyPolicyContent,
    serializePrivacyPolicyContent,
    validatePrivacyPolicyDraft,
    type PrivacyPolicyContent,
    type PrivacyPolicyDraft
} from '@/domains/content/privacy-policy/data';
import type { ObjectStorage } from '@/ports/object-storage';
import { PRIVACY_POLICY_OBJECT_KEY } from '@/utils/storage/business-object-keys';

const CONTENT_TYPE = 'application/json; charset=utf-8';
const CONFLICT_MESSAGE = '隐私条款已被其他管理员更新，请刷新后重试';

export interface PrivacyPolicySnapshot {
    content: PrivacyPolicyContent | null;
    revision: string | null;
}

export interface SavedPrivacyPolicySnapshot {
    content: PrivacyPolicyContent;
    revision: string;
}

export async function readPrivacyPolicyContent(
    storage: ObjectStorage
): Promise<PrivacyPolicySnapshot> {
    const object = await storage.get(PRIVACY_POLICY_OBJECT_KEY);
    return object
        ? { content: parsePrivacyPolicyContent(object.body), revision: object.etag }
        : { content: null, revision: null };
}

export async function savePrivacyPolicyContent(
    storage: ObjectStorage,
    value: PrivacyPolicyDraft,
    expectedRevision: string | null
): Promise<SavedPrivacyPolicySnapshot> {
    const current = await readPrivacyPolicyContent(storage);
    if (current.revision !== expectedRevision) {
        throw Object.assign(new Error(CONFLICT_MESSAGE), { status: 409 });
    }
    const content: PrivacyPolicyContent = {
        ...validatePrivacyPolicyDraft(value),
        updatedAt: new Date().toISOString()
    };
    const body = serializePrivacyPolicyContent(content);
    const stored = storage.putIfUnchanged
        ? await storage.putIfUnchanged(
            PRIVACY_POLICY_OBJECT_KEY,
            expectedRevision,
            body,
            { contentType: CONTENT_TYPE }
        )
        : await storage.put(PRIVACY_POLICY_OBJECT_KEY, body, { contentType: CONTENT_TYPE });
    if (!stored) {
        throw Object.assign(new Error(CONFLICT_MESSAGE), { status: 409 });
    }
    return { content, revision: stored.etag };
}
