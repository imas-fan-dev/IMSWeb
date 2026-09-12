import type { Context } from 'hono';
import type {
    EditorialCoverTransform,
    EditorialRelatedLink,
    EditorialRepository,
    ChronicleDatePrecision
} from '@/ports/repositories';
import {
    emptyArticleDocument,
    renderArticleBody,
    validateArticleBody
} from '@/domains/content/editorial/article-body';
import { invalidRequest, requestRecord } from '@/utils/validation/request-data';
import { statusFromError } from '@/utils/http/error-response';

// 文章骨架在社区帖子与编年史两个 capability 之间共享，因此解析规则集中在
// domain 的 contracts/ 下，capability 只消费不重复定义。

export function idFromPath(c: Context): number {
    const id = Number(c.req.param('id'));
    if (!Number.isSafeInteger(id) || id <= 0) invalidRequest('ID 无效');
    return id;
}

export function text(
    value: unknown,
    label: string,
    maximumLength: number,
    required = false
): string | null {
    if (value === null || value === undefined) {
        if (required) invalidRequest(`${label}不能为空`);
        return null;
    }
    if (typeof value !== 'string') invalidRequest(`${label}格式无效`);
    const result = value.trim();
    if (result.length > maximumLength) invalidRequest(`${label}过长`);
    if (required && !result) invalidRequest(`${label}不能为空`);
    return result || null;
}

export function enumValue<T extends string>(
    value: unknown,
    allowed: readonly T[],
    label: string
): T {
    if (typeof value !== 'string' || !allowed.includes(value as T)) {
        invalidRequest(`${label}无效`);
    }
    return value as T;
}

export function revision(value: unknown): number {
    const result = Number(value);
    if (!Number.isSafeInteger(result) || result < 0) invalidRequest('revision无效');
    return result;
}

export function publicUrl(
    value: unknown,
    label: string,
    required = false
): string | null {
    const candidate = text(value, label, 1000, required);
    if (!candidate) return null;
    if (candidate.startsWith('/') && !candidate.startsWith('//')) return candidate;
    try {
        const url = new URL(candidate);
        if (url.protocol === 'http:' || url.protocol === 'https:') return url.href;
    } catch {
        // The common invalid-url response below is more useful to an editor.
    }
    invalidRequest(`${label}只允许 HTTP(S) 或站内路径`);
}

export function sourceUrl(value: unknown): string | null {
    return publicUrl(value, '原页面链接');
}

function relatedLinkUrl(value: unknown): string {
    return publicUrl(value, '相关链接', true)!;
}

export function coverTransform(
    value: unknown,
    current?: Record<string, unknown>
): EditorialCoverTransform {
    const record = value === undefined
        ? {}
        : requestRecord(value, '封面构图格式无效');
    const values = {
        focalX: Number(record.focalX ?? current?.cover_focal_x ?? 0.5),
        focalY: Number(record.focalY ?? current?.cover_focal_y ?? 0.5),
        zoom: Number(record.zoom ?? current?.cover_zoom ?? 1)
    };
    if (!Number.isFinite(values.focalX) || values.focalX < 0 || values.focalX > 1
        || !Number.isFinite(values.focalY) || values.focalY < 0 || values.focalY > 1
        || !Number.isFinite(values.zoom) || values.zoom < 1 || values.zoom > 3) {
        invalidRequest('封面构图参数无效');
    }
    return values;
}

function storedRelatedLinks(value: unknown): unknown {
    if (typeof value !== 'string') return value;
    try {
        return JSON.parse(value) as unknown;
    } catch {
        return [];
    }
}

export function relatedLinks(
    value: unknown,
    current?: Record<string, unknown>
): EditorialRelatedLink[] {
    const candidate = value === undefined
        ? storedRelatedLinks(current?.related_links) ?? []
        : value;
    if (!Array.isArray(candidate)) invalidRequest('相关链接格式无效');
    if (candidate.length > 20) invalidRequest('相关链接最多添加20条');
    return candidate.map((item) => {
        const record = requestRecord(item, '相关链接格式无效');
        return {
            label: text(record.label, '链接名', 80, true)!,
            url: relatedLinkUrl(record.url)
        };
    });
}

export function dateValue(
    value: unknown,
    precision: ChronicleDatePrecision | null
): string | null {
    const raw = text(value, '日期', 32);
    if (!raw) return null;
    if (precision === 'year' && /^\d{4}$/.test(raw)) return `${raw}-01-01`;
    if (precision === 'month' && /^\d{4}-\d{2}$/.test(raw)) return `${raw}-01`;
    if (precision === 'day' && /^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    invalidRequest('日期格式无效');
}

export async function jsonPayload(c: Context): Promise<Record<string, unknown>> {
    try {
        return requestRecord(await c.req.json(), '请求格式无效');
    } catch (error) {
        if (statusFromError(error, 400) === 400) throw error;
        invalidRequest('请求格式无效');
    }
}

export interface ArticleFields {
    title: string;
    summary: string;
    coverUrl: string | null;
    bodyJson: Record<string, unknown>;
    bodyHtml: string;
    coverTransform: EditorialCoverTransform;
    revision: number;
    userId: number;
}

export async function articleFields(
    c: Context,
    repository: EditorialRepository,
    articleId: number,
    payload: Record<string, unknown>,
    current?: Record<string, unknown>
): Promise<ArticleFields> {
    const title = text(payload.title ?? current?.title, '标题', 160, true)!;
    const summary = text(payload.summary ?? current?.summary, '摘要', 1000) || '';
    const coverUrl = text(payload.coverUrl ?? current?.cover_url, '封面地址', 1000);
    const storedBody = current?.body_json;
    const bodyCandidate = payload.bodyJson ?? (
        typeof storedBody === 'string'
            ? (function parseStoredBody() {
                try { return JSON.parse(storedBody) as unknown; } catch { return emptyArticleDocument; }
            })()
            : storedBody
    ) ?? emptyArticleDocument;
    const validated = validateArticleBody(bodyCandidate);
    for (const image of validated.images) {
        const asset = await repository.findArticleAsset(articleId, image.assetId);
        if (!asset || asset.public_path !== image.src) invalidRequest('正文引用了无效的文章素材');
    }
    return {
        title,
        summary,
        coverUrl,
        bodyJson: validated.document,
        bodyHtml: renderArticleBody(validated.document),
        coverTransform: coverTransform(payload.coverTransform, current),
        revision: revision(payload.revision ?? current?.revision),
        userId: c.get('user')?.id || 0
    };
}
