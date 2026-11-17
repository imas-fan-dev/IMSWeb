import { publicUploadsPath } from '@imsweb/contracts/paths';
import type {
    CommunityContent,
    CommunityContentDraft,
    CommunityContentEntry,
    AdminCommunityContentUpdateRequest,
} from '@imsweb/contracts/community-content';
import {
    invalidRequest,
    requestRecord,
    revisionedContentRequest,
} from '@/utils/validation/request-data';
export type {
    CommunityContent,
    CommunityContentDraft,
    AdminCommunityContentUpdateRequest as CommunityContentUpdateRequest,
};
export const defaultCommunityContent = (): CommunityContent => ({
    version: 1,
    title: '制作人社区',
    introduction: '浏览制作人社群、名片与共同创作的社区内容。',
    entries: [],
    updatedAt: null,
});
function text(value: unknown, max: number, empty = false): string {
    if (
        typeof value !== 'string' ||
        (!empty && !value.trim()) ||
        value.length > max
    )
        invalidRequest('制作人社区文本无效');
    return value;
}
export function validateCommunityLink(value: unknown): string {
    const href = text(value, 500);
    let decoded: string;
    try {
        decoded = decodeURIComponent(href);
    } catch {
        invalidRequest('链接无效');
    }
    if (
        /[\\\u0000-\u0020\u007f]/.test(href) ||
        /[\\\u0000-\u0020\u007f]/.test(decoded)
    )
        invalidRequest('链接无效');
    if (href.startsWith('/') && !decoded.startsWith('//')) return href;
    try {
        const url = new URL(href);
        if (
            !['http:', 'https:'].includes(url.protocol) ||
            url.username ||
            url.password
        )
            invalidRequest('链接无效');
    } catch {
        invalidRequest('链接无效');
    }
    return href;
}
export function communityImageFilename(value: string): string {
    const prefix = publicUploadsPath('/community-content/');
    const filename = value.startsWith(prefix) ? value.slice(prefix.length) : '';
    if (!/^[a-zA-Z0-9_-]+-\d+-[a-f0-9]{12}\.webp$/.test(filename))
        invalidRequest('图片必须为本业务上传的素材');
    return filename;
}
function exactKeys(
    source: Record<string, unknown>,
    keys: readonly string[],
): void {
    if (Object.keys(source).some((key) => !keys.includes(key)))
        invalidRequest('配置包含未知字段');
}
function entry(value: unknown): CommunityContentEntry {
    const source = requestRecord(value, '入口格式无效');
    exactKeys(source, [
        'id',
        'title',
        'description',
        'href',
        'icon',
        'imageUrl',
        'enabled',
        'audience',
        'availability',
    ]);
    const id = text(source.id, 80);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) invalidRequest('入口 ID 无效');
    if (
        typeof source.enabled !== 'boolean' ||
        typeof source.audience !== 'string' ||
        !['all', 'web', 'app'].includes(source.audience) ||
        typeof source.availability !== 'string' ||
        !['always', 'exchange'].includes(source.availability)
    )
        invalidRequest('入口状态无效');
    if (source.imageUrl !== null)
        communityImageFilename(text(source.imageUrl, 500));
    return {
        id,
        title: text(source.title, 80),
        description: text(source.description, 300, true),
        href: validateCommunityLink(source.href),
        icon: text(source.icon, 80),
        imageUrl: source.imageUrl as string | null,
        enabled: source.enabled,
        audience: source.audience as CommunityContentEntry['audience'],
        availability:
            source.availability as CommunityContentEntry['availability'],
    };
}
export function validateCommunityContentDraft(
    value: unknown,
): CommunityContentDraft {
    const source = requestRecord(value, '配置格式无效');
    exactKeys(source, ['version', 'title', 'introduction', 'entries']);
    if (
        source.version !== 1 ||
        !Array.isArray(source.entries) ||
        source.entries.length > 100
    )
        invalidRequest('配置版本或入口数量无效');
    const entries = source.entries.map(entry);
    if (new Set(entries.map((item) => item.id)).size !== entries.length)
        invalidRequest('入口 ID 不能重复');
    return {
        version: 1,
        title: text(source.title, 80),
        introduction: text(source.introduction, 300, true),
        entries,
    };
}
export function validateCommunityContentUpdateRequest(
    value: unknown,
): AdminCommunityContentUpdateRequest {
    const payload = revisionedContentRequest(value, '制作人社区');
    return {
        content: validateCommunityContentDraft(payload.content),
        revision: payload.revision,
    };
}
export function parseCommunityContent(body: Uint8Array): CommunityContent {
    try {
        const source = requestRecord(
            JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body)),
            '存储配置无效',
        );
        exactKeys(source, [
            'version',
            'title',
            'introduction',
            'entries',
            'updatedAt',
        ]);
        if (
            source.updatedAt !== null &&
            (typeof source.updatedAt !== 'string' ||
                !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(
                    source.updatedAt,
                ) ||
                Number.isNaN(Date.parse(source.updatedAt)) ||
                new Date(source.updatedAt).toISOString().slice(0, 19) !==
                    source.updatedAt.slice(0, 19))
        )
            throw new Error('Stored community timestamp invalid');
        const { updatedAt, ...draft } = source;
        return {
            ...validateCommunityContentDraft(draft),
            updatedAt: updatedAt as string | null,
        };
    } catch (cause) {
        throw new Error('Stored community content invalid', { cause });
    }
}
export function serializeCommunityContent(
    content: CommunityContent,
): Uint8Array {
    return new TextEncoder().encode(JSON.stringify(content));
}
