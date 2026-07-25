import {
    INFORMATION_CATEGORIES,
    INFORMATION_CONTENT_TYPES,
    defaultInformationIndex,
    informationAssetUrl,
    informationLink,
    parseInformationIndex,
    serializeInformationIndex,
    type InformationCard,
    type InformationCategory,
    type InformationContentType,
    type InformationIndex
} from '@/domains/information/data';
import type { UploadedFile } from '@/ports/http';
import type { ObjectStorage } from '@/ports/object-storage';
import { randomHex } from '@/utils/crypto/random';
import {
    INFORMATION_INDEX_OBJECT_KEY
} from '@/utils/storage/business-object-keys';

const INDEX_CONTENT_TYPE = 'application/json; charset=utf-8';
const MAX_HTML_LENGTH = 500_000;

export const MAX_INFORMATION_IMAGE_BYTES = 10 * 1024 * 1024;

interface IndexSnapshot {
    index: InformationIndex;
    etag: string | null;
}

interface CardSubmission {
    title?: unknown;
    category?: unknown;
    contentType?: unknown;
    externalUrl?: unknown;
    html?: unknown;
    image?: unknown;
}

export function oneInformationFile(
    value: UploadedFile | UploadedFile[] | undefined
): UploadedFile | null {
    if (!value || Array.isArray(value)) return null;
    return value;
}

export function createInformationId(): string {
    return `info-${Date.now().toString(36)}-${randomHex(6)}`;
}

export async function readInformationIndex(storage: ObjectStorage): Promise<IndexSnapshot> {
    const object = await storage.get(INFORMATION_INDEX_OBJECT_KEY);
    return object
        ? { index: parseInformationIndex(object.body), etag: object.etag }
        : { index: defaultInformationIndex(), etag: null };
}

export async function updateInformationIndex(
    storage: ObjectStorage,
    update: (index: InformationIndex) => InformationIndex
): Promise<InformationIndex> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
        const snapshot = await readInformationIndex(storage);
        const next = update(snapshot.index);
        const body = serializeInformationIndex(next);
        if (!storage.putIfUnchanged) {
            await storage.put(INFORMATION_INDEX_OBJECT_KEY, body, {
                contentType: INDEX_CONTENT_TYPE
            });
            return next;
        }
        const stored = await storage.putIfUnchanged(
            INFORMATION_INDEX_OBJECT_KEY,
            snapshot.etag,
            body,
            { contentType: INDEX_CONTENT_TYPE }
        );
        if (stored) return next;
    }
    throw Object.assign(new Error('内容已被其他管理员更新，请刷新后重试'), { status: 409 });
}

export function validateInformationSubmission(
    value: unknown
): Omit<InformationCard, 'id' | 'link' | 'updatedAt'> & { externalUrl: string } {
    if (!value || typeof value !== 'object') {
        throw Object.assign(new Error('内容格式无效'), { status: 400 });
    }
    const submission = value as CardSubmission;
    const title = typeof submission.title === 'string' ? submission.title.trim() : '';
    const category = submission.category as InformationCategory;
    const contentType = submission.contentType as InformationContentType;
    const externalUrl = typeof submission.externalUrl === 'string'
        ? submission.externalUrl.trim()
        : '';
    const html = typeof submission.html === 'string' ? submission.html.trim() : '';
    const image = typeof submission.image === 'string' ? submission.image.trim() : '';

    if (!title || title.length > 200) {
        throw Object.assign(new Error('请填写 1-200 字的标题'), { status: 400 });
    }
    if (!INFORMATION_CATEGORIES.includes(category)) {
        throw Object.assign(new Error('活动分类无效'), { status: 400 });
    }
    if (!INFORMATION_CONTENT_TYPES.includes(contentType)) {
        throw Object.assign(new Error('内容类型无效'), { status: 400 });
    }
    if (!informationAssetUrl(image)) {
        throw Object.assign(new Error('请先上传封面图片'), { status: 400 });
    }
    if (contentType === 'external' && !informationLink(externalUrl)) {
        throw Object.assign(new Error('外部链接无效'), { status: 400 });
    }
    if (
        contentType === 'html' &&
        (!html || html.length > MAX_HTML_LENGTH || /[\u0000\u007f]/.test(html))
    ) {
        throw Object.assign(new Error(`HTML 正文必须为 1-${MAX_HTML_LENGTH} 字符`), { status: 400 });
    }

    return {
        title,
        category,
        contentType,
        image,
        html: contentType === 'html' ? html : undefined,
        externalUrl
    };
}

export function informationCardFromSubmission(
    id: string,
    submission: ReturnType<typeof validateInformationSubmission>
): InformationCard {
    return {
        id,
        category: submission.category,
        contentType: submission.contentType,
        title: submission.title,
        image: submission.image,
        link: submission.contentType === 'html'
            ? `/information/${encodeURIComponent(id)}`
            : submission.externalUrl,
        ...(submission.contentType === 'html' ? { html: submission.html } : {}),
        updatedAt: new Date().toISOString()
    };
}

export function informationCardUsesAsset(card: InformationCard, asset: string): boolean {
    return card.image === asset || Boolean(card.html?.includes(asset));
}
