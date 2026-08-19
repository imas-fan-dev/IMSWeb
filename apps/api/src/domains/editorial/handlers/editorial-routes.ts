import type { Context } from 'hono';
import type { ImsHonoApp } from '@/app';
import { handleEditorialEntry } from '@/domains/editorial/handlers/editorial-entry';
import {
    emptyArticleDocument,
    renderArticleBody,
    validateArticleBody
} from '@/domains/editorial/content';
import type {
    ArticleStatus,
    ChronicleDatePrecision,
    ChronicleSourceType,
    EditorialRepository,
    EventKind
} from '@/ports/repositories';
import { coreAuth, coreCsrf, opOnly } from '@/middleware/hono-auth';
import { editorialRepository, services } from '@/middleware/hono-context';
import { invalidRequest, requestRecord } from '@/utils/validation/request-data';
import { statusFromError } from '@/utils/http/error-response';
import { validateUploadedImage } from '@/utils/media/image-upload';
import { safeUploadBaseName } from '@/utils/media/filename';
import { randomHex } from '@/utils/crypto/random';
import { articleAssetObjectKey } from '@/utils/storage/business-object-keys';
import { deleteObjectWithCompensation } from '@/utils/storage/delete-object';
import { resolvePublicMediaUrl } from '@/utils/storage/public-object-url';

const ARTICLE_UPLOAD_LIMIT = 10 * 1024 * 1024 + 64 * 1024;

function idFromPath(c: Context): number {
    const id = Number(c.req.param('id'));
    if (!Number.isSafeInteger(id) || id <= 0) invalidRequest('ID 无效');
    return id;
}

function text(value: unknown, label: string, maximumLength: number, required = false): string | null {
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

function enumValue<T extends string>(value: unknown, allowed: readonly T[], label: string): T {
    if (typeof value !== 'string' || !allowed.includes(value as T)) invalidRequest(`${label}无效`);
    return value as T;
}

function revision(value: unknown): number {
    const result = Number(value);
    if (!Number.isSafeInteger(result) || result < 0) invalidRequest('revision无效');
    return result;
}

function sourceUrl(value: unknown): string | null {
    const candidate = text(value, '原页面链接', 1000);
    if (!candidate) return null;
    if (candidate.startsWith('/') && !candidate.startsWith('//')) return candidate;
    try {
        const url = new URL(candidate);
        if (url.protocol === 'http:' || url.protocol === 'https:') return url.href;
    } catch {
        // The common invalid-url response below is more useful to an editor.
    }
    invalidRequest('原页面链接只允许 HTTP(S) 或站内路径');
}

function documentHasPublicContent(value: unknown): boolean {
    if (Array.isArray(value)) return value.some(documentHasPublicContent);
    if (!value || typeof value !== 'object') return false;
    const record = value as Record<string, unknown>;
    if (record.type === 'image') return true;
    if (record.type === 'text' && typeof record.text === 'string' && record.text.trim()) return true;
    return Object.values(record).some(documentHasPublicContent);
}

function dateValue(value: unknown, precision: ChronicleDatePrecision | null): string | null {
    const raw = text(value, '日期', 32);
    if (!raw) return null;
    if (precision === 'year' && /^\d{4}$/.test(raw)) return `${raw}-01-01`;
    if (precision === 'month' && /^\d{4}-\d{2}$/.test(raw)) return `${raw}-01`;
    if (precision === 'day' && /^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    invalidRequest('日期格式无效');
}

async function jsonPayload(c: Context): Promise<Record<string, unknown>> {
    try {
        return requestRecord(await c.req.json(), '请求格式无效');
    } catch (error) {
        if (statusFromError(error, 400) === 400) throw error;
        invalidRequest('请求格式无效');
    }
}

async function articleFields(
    c: Context,
    repository: EditorialRepository,
    articleId: number,
    payload: Record<string, unknown>,
    current?: Record<string, unknown>
): Promise<{
    title: string;
    summary: string;
    coverUrl: string | null;
    bodyJson: Record<string, unknown>;
    bodyHtml: string;
    revision: number;
    userId: number;
}> {
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
        revision: revision(payload.revision ?? current?.revision),
        userId: c.get('user')?.id || 0
    };
}

function statusResponse(result: { status: string; revision?: number }, c: Context): Response | null {
    if (result.status === 'not-found') return c.json({ error: '内容不存在' }, 404);
    if (result.status === 'conflict') return c.json({ error: '内容已被其他操作更新', revision: result.revision }, 409);
    return null;
}

function publicArticleResponse(row: Record<string, unknown>, storage?: NonNullable<ReturnType<typeof services>['storage']>) {
    return (async function resolveArticle() {
        const result = { ...row };
        if (storage && typeof result.image_url === 'string') {
            result.image_url = await resolvePublicMediaUrl(storage, result.image_url);
        }
        return result;
    })();
}

async function handleAdminEventCreate(c: Context): Promise<Response> {
    const payload = await jsonPayload(c);
    const result = await editorialRepository(c).createEventDraft({
        title: text(payload.title, '标题', 160, true)!,
        kind: enumValue(payload.kind, ['event', 'notice'] as const, '活动类型'),
        userId: c.get('user')!.id
    });
    return c.json(result, 201);
}

async function handleAdminEventList(c: Context): Promise<Response> {
    const status = c.req.query('status');
    if (status && !['draft', 'published', 'archived'].includes(status)) invalidRequest('状态无效');
    return c.json({ items: await editorialRepository(c).listAdminEvents(status as ArticleStatus | undefined) });
}

async function handleAdminEventGet(c: Context): Promise<Response> {
    const row = await editorialRepository(c).findAdminEvent(idFromPath(c));
    return row ? c.json(row) : c.json({ error: '活动不存在' }, 404);
}

async function handleAdminEventUpdate(c: Context): Promise<Response> {
    const id = idFromPath(c);
    const repository = editorialRepository(c);
    const current = await repository.findAdminEvent(id);
    if (!current) return c.json({ error: '活动不存在' }, 404);
    const payload = await jsonPayload(c);
    const fields = await articleFields(c, repository, Number(current.article_id), payload, current);
    const kind = enumValue(payload.kind ?? current.kind, ['event', 'notice'] as const, '帖子类型');
    const isConcreteEvent = kind === 'event';
    const result = await repository.updateEditorialEvent(id, {
        ...fields,
        kind,
        sourceUrl: sourceUrl(payload.sourceUrl ?? current.source_url),
        name: isConcreteEvent ? text(payload.name ?? current.name, '主办方', 160) : null,
        contact: isConcreteEvent ? text(payload.contact ?? current.contact, '联系方式', 500) : null,
        startAt: isConcreteEvent ? text(payload.startAt ?? current.start_at, '开始时间', 64) : null,
        endAt: isConcreteEvent ? text(payload.endAt ?? current.end_at, '结束时间', 64) : null,
        timezone: text(payload.timezone ?? current.timezone, '时区', 80) || 'Asia/Shanghai',
        venueName: isConcreteEvent ? text(payload.venueName ?? current.venue_name, '地点名称', 240) : null,
        address: isConcreteEvent ? text(payload.address ?? current.address, '地址', 500) : null,
        registrationUrl: isConcreteEvent ? text(payload.registrationUrl ?? current.registration_url, '报名链接', 1000) : null,
        eventStatus: !isConcreteEvent || payload.eventStatus === null
            ? null
            : enumValue(payload.eventStatus ?? current.event_status ?? 'scheduled',
                ['scheduled', 'ongoing', 'ended', 'cancelled'] as const, '活动状态')
    });
    const conflict = statusResponse(result, c);
    if (conflict) return conflict;
    return c.json({ revision: result.revision });
}

async function handleAdminEventStatus(c: Context, status: ArticleStatus): Promise<Response> {
    const id = idFromPath(c);
    const repository = editorialRepository(c);
    const current = await repository.findAdminEvent(id);
    if (!current) return c.json({ error: '活动不存在' }, 404);
    if (status === 'published') {
        const body = typeof current.body_json === 'string'
            ? JSON.parse(current.body_json) as unknown
            : current.body_json;
        if (!documentHasPublicContent(body) && !sourceUrl(current.source_url)) {
            return c.json({ error: '发布社区帖子至少需要正文或原页面链接' }, 400);
        }
    }
    const payload = await jsonPayload(c);
    const expectedRevision = revision(payload.revision ?? current.revision);
    const result = await repository.setArticleStatus(
        Number(current.article_id), status, expectedRevision, c.get('user')!.id
    );
    const conflict = statusResponse(result, c);
    if (conflict) return conflict;
    return c.json({ status, revision: result.revision });
}

async function handleAdminEventDelete(c: Context): Promise<Response> {
    const deleted = await editorialRepository(c).deleteEditorialEvent(idFromPath(c));
    return deleted ? c.json({ success: true }) : c.json({ error: '活动不存在' }, 404);
}

async function handleAdminEventPreview(c: Context): Promise<Response> {
    const id = idFromPath(c);
    const repository = editorialRepository(c);
    const current = await repository.findAdminEvent(id);
    if (!current) return c.json({ error: '社区帖子不存在' }, 404);
    const payload = await jsonPayload(c);
    const fields = await articleFields(c, repository, Number(current.article_id), payload, current);
    const kind = enumValue(payload.kind ?? current.kind, ['event', 'notice'] as const, '帖子类型');
    return c.json({
        ...current,
        title: fields.title,
        summary: fields.summary,
        cover_url: fields.coverUrl,
        body_json: fields.bodyJson,
        body_html: fields.bodyHtml,
        kind,
        source_url: sourceUrl(payload.sourceUrl ?? current.source_url)
    });
}

async function handleAdminSpotlightList(c: Context): Promise<Response> {
    return c.json({ items: await editorialRepository(c).listAdminSpotlightEntries() });
}

async function handleAdminSpotlightReplace(c: Context): Promise<Response> {
    const payload = await jsonPayload(c);
    if (!Array.isArray(payload.items) || payload.items.length > 100) invalidRequest('精选列表格式无效');
    const seen = new Set<number>();
    const entries = payload.items.map((item) => {
        if (!item || typeof item !== 'object') invalidRequest('精选条目格式无效');
        const record = item as Record<string, unknown>;
        const postId = Number(record.postId);
        if (!Number.isSafeInteger(postId) || postId <= 0 || seen.has(postId)) {
            invalidRequest('精选条目包含无效或重复的帖子');
        }
        seen.add(postId);
        return {
            postId,
            category: enumValue(record.category, ['activity', 'fan'] as const, '精选分类')
        };
    });
    await editorialRepository(c).replaceHomepageSpotlightEntries(entries);
    return c.json({ success: true });
}

async function handlePublicSpotlightList(c: Context): Promise<Response> {
    const rows = await editorialRepository(c).listPublicSpotlightEntries();
    const storage = services(c).storage;
    const items = storage ? await Promise.all(rows.map((row) => publicArticleResponse(row, storage))) : rows;
    return c.json({ items });
}

async function handleLegacyInformationLookup(c: Context): Promise<Response> {
    const legacyInformationId = c.req.param('id')?.trim();
    if (!legacyInformationId || legacyInformationId.length > 80) invalidRequest('旧内容 ID 无效');
    const post = await editorialRepository(c).findLegacyInformationPost(legacyInformationId);
    return c.json({ postId: post?.id ?? null });
}

async function handleAdminChronicleCreate(c: Context): Promise<Response> {
    const payload = await jsonPayload(c);
    const result = await editorialRepository(c).createChronicleDraft({
        title: text(payload.title, '标题', 160, true)!,
        sourceType: enumValue(payload.sourceType, ['official', 'community'] as const, '来源类型'),
        userId: c.get('user')!.id
    });
    return c.json(result, 201);
}

async function handleAdminChronicleList(c: Context): Promise<Response> {
    const status = c.req.query('status');
    if (status && !['draft', 'published', 'archived'].includes(status)) invalidRequest('状态无效');
    return c.json({ items: await editorialRepository(c).listAdminChronicle(status as ArticleStatus | undefined) });
}

async function handleAdminChronicleGet(c: Context): Promise<Response> {
    const row = await editorialRepository(c).findAdminChronicle(idFromPath(c));
    return row ? c.json(row) : c.json({ error: '编年史不存在' }, 404);
}

async function handleAdminChronicleUpdate(c: Context): Promise<Response> {
    const id = idFromPath(c);
    const repository = editorialRepository(c);
    const current = await repository.findAdminChronicle(id);
    if (!current) return c.json({ error: '编年史不存在' }, 404);
    const payload = await jsonPayload(c);
    const precision = payload.datePrecision === undefined
        ? current.date_precision as ChronicleDatePrecision | null
        : payload.datePrecision === null
            ? null
            : enumValue(payload.datePrecision, ['year', 'month', 'day'] as const, '日期精度');
    const fields = await articleFields(c, repository, id, payload, current);
    const result = await repository.updateChronicle(id, {
        ...fields,
        occurredOn: dateValue(payload.occurredOn ?? current.occurred_on, precision),
        endedOn: dateValue(payload.endedOn ?? current.ended_on, precision),
        datePrecision: precision,
        sourceType: payload.sourceType === undefined
            ? current.source_type as ChronicleSourceType | null
            : enumValue(payload.sourceType, ['official', 'community'] as const, '来源类型'),
        sourceEventId: payload.sourceEventId === null || payload.sourceEventId === undefined
            ? (current.source_event_id === null ? null : Number(current.source_event_id))
            : Number(payload.sourceEventId),
        location: text(payload.location ?? current.location, '地点', 500),
        timelineOrder: payload.timelineOrder === undefined
            ? Number(current.timeline_order || 0)
            : revision(payload.timelineOrder),
        liveSourceId: text(payload.liveSourceId ?? current.live_source_id, 'Live来源ID', 160),
        liveTitle: text(payload.liveTitle ?? current.live_title, 'Live标题', 500),
        liveDate: text(payload.liveDate ?? current.live_date, 'Live日期', 80),
        liveTime: text(payload.liveTime ?? current.live_time, 'Live时间', 80),
        liveLocation: text(payload.liveLocation ?? current.live_location, 'Live地点', 500),
        liveDetailUrl: text(payload.liveDetailUrl ?? current.live_detail_url, 'Live详情地址', 1000),
        liveFranchises: Array.isArray(payload.liveFranchises)
            ? payload.liveFranchises.filter(isString).slice(0, 50)
            : Array.isArray(current.live_franchises) ? current.live_franchises as string[] : [],
        liveBrandCodes: Array.isArray(payload.liveBrandCodes)
            ? payload.liveBrandCodes.filter(isString).slice(0, 50)
            : Array.isArray(current.live_brand_codes) ? current.live_brand_codes as string[] : []
    });
    const conflict = statusResponse(result, c);
    if (conflict) return conflict;
    return c.json({ revision: result.revision });
}

async function handleAdminChronicleStatus(c: Context, status: ArticleStatus): Promise<Response> {
    const id = idFromPath(c);
    const repository = editorialRepository(c);
    const current = await repository.findAdminChronicle(id);
    if (!current) return c.json({ error: '编年史不存在' }, 404);
    if (status === 'published' && (!current.occurred_on || !current.source_type)) {
        return c.json({ error: '发布编年史至少需要年份和来源类型' }, 400);
    }
    const payload = await jsonPayload(c);
    const result = await repository.setArticleStatus(
        id, status, revision(payload.revision ?? current.revision), c.get('user')!.id
    );
    const conflict = statusResponse(result, c);
    if (conflict) return conflict;
    return c.json({ status, revision: result.revision });
}

async function handleAdminChronicleDelete(c: Context): Promise<Response> {
    const deleted = await editorialRepository(c).deleteEditorialChronicle(idFromPath(c));
    return deleted ? c.json({ success: true }) : c.json({ error: '编年史不存在' }, 404);
}

function encodeChronicleCursor(row: Record<string, unknown>): string {
    return Buffer.from(JSON.stringify({
        occurredOn: row.occurred_on,
        timelineOrder: Number(row.timeline_order || 0),
        articleId: String(row.article_id)
    })).toString('base64url');
}

function decodeChronicleCursor(value: string | undefined): {
    occurredOn: string;
    timelineOrder: number;
    articleId: string;
} | null {
    if (!value) return null;
    try {
        const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Record<string, unknown>;
        if (typeof parsed.occurredOn !== 'string' || !Number.isInteger(parsed.timelineOrder) ||
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

async function handlePublicChronicleList(c: Context): Promise<Response> {
    const limit = Math.min(Math.max(Number(c.req.query('limit') || 24), 1), 100);
    const cursor = decodeChronicleCursor(c.req.query('cursor'));
    if (c.req.query('cursor') && !cursor) return c.json({ error: '游标无效' }, 400);
    const rows = await editorialRepository(c).listPublicChronicle(limit + 1, cursor);
    const hasNextPage = rows.length > limit;
    const items = hasNextPage ? rows.slice(0, limit) : rows;
    return c.json({
        items,
        pageInfo: {
            hasNextPage,
            nextCursor: hasNextPage && items.length ? encodeChronicleCursor(items.at(-1)!) : null
        }
    });
}

async function handlePublicChronicleGet(c: Context): Promise<Response> {
    const row = await editorialRepository(c).findPublicChronicle(idFromPath(c));
    return row ? c.json(await publicArticleResponse(row, services(c).storage)) : c.json({ error: '编年史不存在' }, 404);
}

async function handleArticleAssetUpload(c: Context): Promise<Response> {
    const articleId = Number(c.req.param('articleId'));
    if (!Number.isSafeInteger(articleId) || articleId <= 0) invalidRequest('文章 ID 无效');
    const repository = editorialRepository(c);
    const article = await repository.findEditorialArticle(articleId);
    if (!article) return c.json({ error: '文章不存在' }, 404);
    const runtime = services(c);
    if (!runtime.uploads || !runtime.images || !runtime.storage) throw new Error('上传服务不可用');
    const parsed = await runtime.uploads.parse(c.req.raw, {
        maxBytes: ARTICLE_UPLOAD_LIMIT,
        fileFields: ['image'],
        maxFiles: 1,
        maxFields: 4,
        maxParts: 5
    });
    const candidate = parsed.files.image;
    const file = candidate && !Array.isArray(candidate) ? candidate : null;
    if (!file || file.body.byteLength > 10 * 1024 * 1024) invalidRequest('文章图片不能超过 10 MiB');
    const info = await validateUploadedImage(file, runtime.images);
    const webp = await runtime.images.toWebp(file.body);
    const stem = `${safeUploadBaseName(file.filename)}-${Date.now()}-${randomHex(6)}`;
    const filename = `${stem}.webp`;
    const objectKey = articleAssetObjectKey(articleId, filename);
    const publicPath = `/uploads/articles/${articleId}/${filename}`;
    await runtime.storage.put(objectKey, webp, { contentType: 'image/webp', deferredPublication: true });
    try {
        const asset = await repository.insertArticleAsset({
            articleId, objectKey, publicPath,
            usage: parsed.fields.usage === 'cover' ? 'cover' : 'body',
            altText: text(parsed.fields.altText, '图片替代文本', 240) || '',
            userId: c.get('user')!.id
        });
        await runtime.storage.publish?.(objectKey);
        return c.json({ ...asset, format: info.format }, 201);
    } catch (error) {
        await deleteObjectWithCompensation(runtime, objectKey).catch(ignoreCleanupError);
        throw error;
    }
}

async function handleArticleAssetDelete(c: Context): Promise<Response> {
    const articleId = Number(c.req.param('articleId'));
    const assetId = Number(c.req.param('assetId'));
    if (!Number.isSafeInteger(articleId) || !Number.isSafeInteger(assetId) || articleId <= 0 || assetId <= 0) {
        invalidRequest('素材 ID 无效');
    }
    const repository = editorialRepository(c);
    const asset = await repository.findArticleAsset(articleId, assetId);
    if (!asset) return c.json({ error: '素材不存在' }, 404);
    const article = await repository.findEditorialArticle(articleId);
    const publicPath = String(asset.public_path);
    if (article?.cover_url === publicPath || JSON.stringify(article?.body_json || '').includes(publicPath)) {
        return c.json({ error: '素材仍在正文或封面中使用' }, 409);
    }
    const deleted = await repository.deleteArticleAsset(articleId, assetId);
    if (!deleted) return c.json({ error: '素材不存在' }, 404);
    const runtime = services(c);
    if (runtime.storage && asset.object_key) {
        await deleteObjectWithCompensation(runtime, String(asset.object_key));
    }
    return c.json({ success: true });
}

async function handleArticleAssetList(c: Context): Promise<Response> {
    const articleId = Number(c.req.param('articleId'));
    if (!Number.isSafeInteger(articleId) || articleId <= 0) invalidRequest('文章 ID 无效');
    return c.json({ items: await editorialRepository(c).listArticleAssets(articleId) });
}

export function handleEditorialRoutes(app: ImsHonoApp): void {
    app.get('/api/chronicle', handlePublicChronicleList);
    app.get('/api/chronicle/:id', handlePublicChronicleGet);
    app.get('/api/community-posts/spotlight', handlePublicSpotlightList);
    app.get('/api/community-posts/legacy-information/:id', handleLegacyInformationLookup);
    app.get('/api/admin/community-posts/spotlight', coreAuth, opOnly, handleAdminSpotlightList);
    app.put('/api/admin/community-posts/spotlight', coreAuth, opOnly, coreCsrf, handleAdminSpotlightReplace);
    app.get('/api/admin/community-posts', coreAuth, opOnly, handleAdminEventList);
    app.post('/api/admin/community-posts', coreAuth, opOnly, coreCsrf, handleAdminEventCreate);
    app.get('/api/admin/community-posts/:id', coreAuth, opOnly, handleAdminEventGet);
    app.put('/api/admin/community-posts/:id', coreAuth, opOnly, coreCsrf, handleAdminEventUpdate);
    app.delete('/api/admin/community-posts/:id', coreAuth, opOnly, coreCsrf, handleAdminEventDelete);
    app.post('/api/admin/community-posts/:id/preview', coreAuth, opOnly, coreCsrf, handleAdminEventPreview);
    app.post('/api/admin/community-posts/:id/publish', coreAuth, opOnly, coreCsrf, handleAdminEventPublish);
    app.post('/api/admin/community-posts/:id/unpublish', coreAuth, opOnly, coreCsrf, handleAdminEventUnpublish);
    app.post('/api/admin/community-posts/:id/archive', coreAuth, opOnly, coreCsrf, handleAdminEventArchive);
    app.get('/api/admin/events', coreAuth, opOnly, handleAdminEventList);
    app.post('/api/admin/events', coreAuth, opOnly, coreCsrf, handleAdminEventCreate);
    app.get('/api/admin/events/:id', coreAuth, opOnly, handleAdminEventGet);
    app.put('/api/admin/events/:id', coreAuth, opOnly, coreCsrf, handleAdminEventUpdate);
    app.delete('/api/admin/events/:id', coreAuth, opOnly, coreCsrf, handleAdminEventDelete);
    app.post('/api/admin/events/:id/publish', coreAuth, opOnly, coreCsrf, handleAdminEventPublish);
    app.post('/api/admin/events/:id/unpublish', coreAuth, opOnly, coreCsrf, handleAdminEventUnpublish);
    app.post('/api/admin/events/:id/archive', coreAuth, opOnly, coreCsrf, handleAdminEventArchive);
    app.get('/api/admin/chronicle', coreAuth, opOnly, handleAdminChronicleList);
    app.post('/api/admin/chronicle', coreAuth, opOnly, coreCsrf, handleAdminChronicleCreate);
    app.get('/api/admin/chronicle/:id', coreAuth, opOnly, handleAdminChronicleGet);
    app.put('/api/admin/chronicle/:id', coreAuth, opOnly, coreCsrf, handleAdminChronicleUpdate);
    app.delete('/api/admin/chronicle/:id', coreAuth, opOnly, coreCsrf, handleAdminChronicleDelete);
    app.post('/api/admin/chronicle/:id/publish', coreAuth, opOnly, coreCsrf, handleAdminChroniclePublish);
    app.post('/api/admin/chronicle/:id/unpublish', coreAuth, opOnly, coreCsrf, handleAdminChronicleUnpublish);
    app.post('/api/admin/chronicle/:id/archive', coreAuth, opOnly, coreCsrf, handleAdminChronicleArchive);
    app.get('/api/admin/articles/:articleId/assets', coreAuth, opOnly, handleArticleAssetList);
    app.post('/api/admin/articles/:articleId/assets', coreAuth, opOnly, coreCsrf, handleArticleAssetUpload);
    app.delete('/api/admin/articles/:articleId/assets/:assetId', coreAuth, opOnly, coreCsrf, handleArticleAssetDelete);
}

function isString(value: unknown): value is string {
    return typeof value === 'string';
}

function ignoreCleanupError(): undefined {
    return undefined;
}

function handleAdminEventPublish(c: Context): Promise<Response> {
    return handleAdminEventStatus(c, 'published');
}

function handleAdminEventUnpublish(c: Context): Promise<Response> {
    return handleAdminEventStatus(c, 'draft');
}

function handleAdminEventArchive(c: Context): Promise<Response> {
    return handleAdminEventStatus(c, 'archived');
}

function handleAdminChroniclePublish(c: Context): Promise<Response> {
    return handleAdminChronicleStatus(c, 'published');
}

function handleAdminChronicleUnpublish(c: Context): Promise<Response> {
    return handleAdminChronicleStatus(c, 'draft');
}

function handleAdminChronicleArchive(c: Context): Promise<Response> {
    return handleAdminChronicleStatus(c, 'archived');
}
