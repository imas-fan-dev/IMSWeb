import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import type {
    ArticleStatus,
    EditorialChronicleCursor,
    SpotlightCategory
} from '@/ports/repositories';
import { services } from '@/middleware/hono-context';
import type { ValidatedRequestInput } from '@/middleware/request-validation';
import type { UploadedFile } from '@/ports/http';
import { text } from '@/domains/content/editorial/contracts/article-input';
import { invalidRequest, requestRecord } from '@/utils/validation/request-data';
import { positiveInteger } from '@/utils/validation/number';

const ARTICLE_STATUSES = ['draft', 'published', 'archived'] as const;
const SPOTLIGHT_CATEGORIES = ['activity', 'fan'] as const;
const DEFAULT_CHRONICLE_PAGE_SIZE = 24;
const MAXIMUM_CHRONICLE_PAGE_SIZE = 100;
const MAXIMUM_SPOTLIGHT_ENTRIES = 100;
const MAXIMUM_LEGACY_INFORMATION_ID = 80;
export const ARTICLE_IMAGE_LIMIT = 10 * 1024 * 1024;
// 多留 64 KiB 给 multipart 的字段与边界，图片本身仍以 10 MiB 为准。
const ARTICLE_UPLOAD_LIMIT = ARTICLE_IMAGE_LIMIT + 64 * 1024;

export interface EditorialIdParams {
    id: number;
}

export interface EditorialStatusQuery {
    status: ArticleStatus | null;
}

export interface EditorialChronicleQuery {
    limit: number;
    cursor: EditorialChronicleCursor | null;
}

export interface LegacyInformationParams {
    legacyInformationId: string;
}

export interface ArticleAssetParams {
    articleId: number;
    assetId: number | null;
}

export interface SpotlightSelectionRequest {
    items: Array<{ postId: number; category: SpotlightCategory }>;
}

export interface UploadArticleAssetRequest {
    image: UploadedFile;
    usage: 'cover' | 'body';
    altText: string;
}

/**
 * 文章正文与活动字段要和库里的当前行合并后才能校验（PUT 是部分更新），
 * 所以中间件只保证请求体是一个 JSON 对象，逐字段校验留在
 * contracts/article-input.ts 里按当前行执行。
 */
export interface EditorialArticlePayload {
    [field: string]: unknown;
}

export function validateEditorialArticlePayload(
    value: unknown
): EditorialArticlePayload {
    return requestRecord(value, '请求格式无效');
}

export function validateEditorialIdParams(value: unknown): EditorialIdParams {
    const params = requestRecord(value, 'ID 无效');
    const id = positiveInteger(params.id);
    if (!id) invalidRequest('ID 无效');
    return { id };
}

export function validateEditorialStatusQuery(
    value: unknown
): EditorialStatusQuery {
    const query = requestRecord(value, '状态无效');
    if (query.status === undefined) return { status: null };
    if (typeof query.status !== 'string' || !query.status) return { status: null };
    if (!ARTICLE_STATUSES.includes(query.status as ArticleStatus)) {
        invalidRequest('状态无效');
    }
    return { status: query.status as ArticleStatus };
}

function decodeChronicleCursor(value: string): EditorialChronicleCursor | null {
    try {
        const parsed = JSON.parse(
            Buffer.from(value, 'base64url').toString('utf8')
        ) as Record<string, unknown>;
        if (typeof parsed.occurredOn !== 'string' ||
            !Number.isInteger(parsed.timelineOrder) ||
            typeof parsed.articleId !== 'string') return null;
        return {
            occurredOn: parsed.occurredOn,
            timelineOrder: parsed.timelineOrder as number,
            articleId: parsed.articleId
        };
    } catch {
        return null;
    }
}

export function validateEditorialChronicleQuery(
    value: unknown
): EditorialChronicleQuery {
    const query = requestRecord(value, '编年史分页参数无效');
    const requested = Number(query.limit ?? DEFAULT_CHRONICLE_PAGE_SIZE);
    const limit = Number.isFinite(requested)
        ? Math.min(Math.max(requested, 1), MAXIMUM_CHRONICLE_PAGE_SIZE)
        : DEFAULT_CHRONICLE_PAGE_SIZE;
    if (query.cursor === undefined) return { limit, cursor: null };
    if (typeof query.cursor !== 'string') invalidRequest('游标无效');
    const cursor = decodeChronicleCursor(query.cursor as string);
    if (!cursor) invalidRequest('游标无效');
    return { limit, cursor };
}

export function validateLegacyInformationParams(
    value: unknown
): LegacyInformationParams {
    const params = requestRecord(value, '旧内容 ID 无效');
    const legacyInformationId = text(
        params.id,
        '旧内容 ID',
        MAXIMUM_LEGACY_INFORMATION_ID,
        true
    )!;
    return { legacyInformationId };
}

export function validateArticleAssetParams(value: unknown): ArticleAssetParams {
    const params = requestRecord(value, '素材 ID 无效');
    const articleId = positiveInteger(params.articleId);
    if (!articleId) invalidRequest('文章 ID 无效');
    if (params.assetId === undefined) return { articleId, assetId: null };
    const assetId = positiveInteger(params.assetId);
    if (!assetId) invalidRequest('素材 ID 无效');
    return { articleId, assetId };
}

export function validateSpotlightSelection(
    value: unknown
): SpotlightSelectionRequest {
    const payload = requestRecord(value, '精选列表格式无效');
    if (!Array.isArray(payload.items) ||
        payload.items.length > MAXIMUM_SPOTLIGHT_ENTRIES) {
        invalidRequest('精选列表格式无效');
    }
    const seen = new Set<number>();
    const items: SpotlightSelectionRequest['items'] = [];
    for (const item of payload.items as unknown[]) {
        const record = requestRecord(item, '精选条目格式无效');
        const postId = positiveInteger(record.postId);
        if (!postId || seen.has(postId)) {
            invalidRequest('精选条目包含无效或重复的帖子');
        }
        seen.add(postId);
        if (typeof record.category !== 'string' ||
            !SPOTLIGHT_CATEGORIES.includes(record.category as SpotlightCategory)) {
            invalidRequest('精选分类无效');
        }
        items.push({ postId, category: record.category as SpotlightCategory });
    }
    return { items };
}

export type EditorialIdRequestContext = Context<
    AppEnvironment,
    string,
    ValidatedRequestInput<'param', EditorialIdParams>
>;

export type EditorialArticleRequestContext = Context<
    AppEnvironment,
    string,
    ValidatedRequestInput<'param', EditorialIdParams> &
    ValidatedRequestInput<'json', EditorialArticlePayload>
>;

export type EditorialPayloadRequestContext = Context<
    AppEnvironment,
    string,
    ValidatedRequestInput<'json', EditorialArticlePayload>
>;

export type EditorialStatusRequestContext = Context<
    AppEnvironment,
    string,
    ValidatedRequestInput<'query', EditorialStatusQuery>
>;

export type EditorialChronicleRequestContext = Context<
    AppEnvironment,
    string,
    ValidatedRequestInput<'query', EditorialChronicleQuery>
>;

export type LegacyInformationRequestContext = Context<
    AppEnvironment,
    string,
    ValidatedRequestInput<'param', LegacyInformationParams>
>;

export type ArticleAssetRequestContext = Context<
    AppEnvironment,
    string,
    ValidatedRequestInput<'param', ArticleAssetParams>
>;

export type SpotlightSelectionRequestContext = Context<
    AppEnvironment,
    string,
    ValidatedRequestInput<'json', SpotlightSelectionRequest>
>;

export async function parseUploadArticleAssetRequest(
    c: Context<AppEnvironment>
): Promise<UploadArticleAssetRequest> {
    const runtime = services(c);
    if (!runtime.uploads) throw new Error('Upload parser unavailable');
    const parsed = await runtime.uploads.parse(c.req.raw, {
        maxBytes: ARTICLE_UPLOAD_LIMIT,
        fileFields: ['image'],
        maxFiles: 1,
        maxFields: 4,
        maxParts: 5
    });
    const candidate = parsed.files.image;
    const image = candidate && !Array.isArray(candidate) ? candidate : null;
    if (!image || image.body.byteLength > ARTICLE_IMAGE_LIMIT) {
        invalidRequest('文章图片不能超过 10 MiB');
    }
    return {
        image,
        usage: parsed.fields.usage === 'cover' ? 'cover' : 'body',
        altText: text(parsed.fields.altText, '图片替代文本', 240) || ''
    };
}
