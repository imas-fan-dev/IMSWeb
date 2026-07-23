import type { ImsHonoApp } from '@/app';
import { writeAudit } from '@/domains/audit/hono-service';
import {
    INFORMATION_CATEGORIES,
    INFORMATION_CONTENT_TYPES,
    INFORMATION_INDEX_KEY,
    defaultInformationIndex,
    informationAssetUrl,
    informationCardSummary,
    informationLink,
    parseInformationIndex,
    serializeInformationIndex,
    type InformationCard,
    type InformationCategory,
    type InformationContentType,
    type InformationIndex
} from '@/domains/information/data';
import { coreAuth, coreCsrf, opOnly } from '@/middleware/hono-auth';
import type { ObjectStorage } from '@/ports/object-storage';
import type { UploadedFile } from '@/ports/upload-parser';
import { deleteObjectWithCompensation } from '@/shared/compensation';
import {
    messageFromError,
    randomHex,
    safeUploadBaseName,
    services,
    statusFromError
} from '@/shared/hono-utils';
import { validateUploadedImage } from '@/shared/image-upload';

const INDEX_CONTENT_TYPE = 'application/json; charset=utf-8';
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_HTML_LENGTH = 500_000;

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

function oneFile(value: UploadedFile | UploadedFile[] | undefined): UploadedFile | null {
    if (!value || Array.isArray(value)) return null;
    return value;
}

function createId(): string {
    return `info-${Date.now().toString(36)}-${randomHex(6)}`;
}

async function readIndex(storage: ObjectStorage): Promise<IndexSnapshot> {
    const object = await storage.get(INFORMATION_INDEX_KEY);
    return object
        ? { index: parseInformationIndex(object.body), etag: object.etag }
        : { index: defaultInformationIndex(), etag: null };
}

async function updateIndex(
    storage: ObjectStorage,
    update: (index: InformationIndex) => InformationIndex
): Promise<InformationIndex> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
        const snapshot = await readIndex(storage);
        const next = update(snapshot.index);
        const body = serializeInformationIndex(next);
        if (!storage.putIfUnchanged) {
            await storage.put(INFORMATION_INDEX_KEY, body, { contentType: INDEX_CONTENT_TYPE });
            return next;
        }
        const stored = await storage.putIfUnchanged(
            INFORMATION_INDEX_KEY,
            snapshot.etag,
            body,
            { contentType: INDEX_CONTENT_TYPE }
        );
        if (stored) return next;
    }
    throw Object.assign(new Error('内容已被其他管理员更新，请刷新后重试'), { status: 409 });
}

function validateSubmission(value: unknown): Omit<InformationCard, 'id' | 'link' | 'updatedAt'> & {
    externalUrl: string;
} {
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

function cardFromSubmission(
    id: string,
    submission: ReturnType<typeof validateSubmission>
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

function cardUsesAsset(card: InformationCard, asset: string): boolean {
    return card.image === asset || Boolean(card.html?.includes(asset));
}

export function registerInformationRoutes(app: ImsHonoApp): void {
    app.get('/api/information', async (c) => {
        const storage = services(c).storage;
        if (!storage) throw new Error('Object storage unavailable');
        const { index } = await readIndex(storage);
        c.header('Cache-Control', 'no-cache');
        return c.json({ cards: index.cards.map(informationCardSummary) });
    });

    app.get('/api/information/:id', async (c) => {
        const storage = services(c).storage;
        if (!storage) throw new Error('Object storage unavailable');
        const { index } = await readIndex(storage);
        const card = index.cards.find((candidate) => candidate.id === c.req.param('id'));
        if (!card || card.contentType !== 'html') {
            return c.json({ error: '活动内容不存在' }, 404);
        }
        c.header('Cache-Control', 'no-cache');
        return c.json({ card });
    });

    app.get('/api/admin/information', coreAuth, opOnly, async (c) => {
        const storage = services(c).storage;
        if (!storage) throw new Error('Object storage unavailable');
        const { index } = await readIndex(storage);
        return c.json(index);
    });

    app.post('/api/admin/information/assets', coreAuth, opOnly, coreCsrf, async (c) => {
        const runtime = services(c);
        if (!runtime.uploads || !runtime.images || !runtime.storage) {
            throw new Error('Upload services unavailable');
        }
        let key = '';
        try {
            const parsed = await runtime.uploads.parse(c.req.raw, {
                maxBytes: MAX_IMAGE_BYTES + 64 * 1024,
                fileFields: ['image'],
                maxFiles: 1,
                maxFields: 1,
                maxParts: 2
            });
            const file = oneFile(parsed.files.image);
            if (!file || file.body.byteLength > MAX_IMAGE_BYTES) {
                return c.json({ error: '必须上传一张不超过 10MB 的图片' }, 400);
            }
            await validateUploadedImage(file, runtime.images);
            const webp = await runtime.images.toWebp(file.body, 88);
            const filename = `${safeUploadBaseName(file.filename)}-${Date.now()}-${randomHex(6)}.webp`;
            key = `uploads/information/original/${filename}`;
            const url = `/${key}`;
            await runtime.storage.put(key, webp, { contentType: 'image/webp' });
            await updateIndex(runtime.storage, (index) => ({
                ...index,
                assets: index.assets.includes(url) ? index.assets : [...index.assets, url]
            }));
            await writeAudit(c, '上传活动图片', url);
            return c.json({ success: true, url });
        } catch (error) {
            if (key) await deleteObjectWithCompensation(runtime, key).catch(() => undefined);
            const status = statusFromError(error);
            if (status >= 500) {
                console.error('Failed to upload information asset', error);
                return c.json({ error: '图片上传失败' }, status as 500);
            }
            return c.json({ error: messageFromError(error) }, status as 400);
        }
    });

    app.post('/api/admin/information', coreAuth, opOnly, coreCsrf, async (c) => {
        const runtime = services(c);
        if (!runtime.storage) throw new Error('Object storage unavailable');
        try {
            const submission = validateSubmission(await c.req.json());
            const id = createId();
            const card = cardFromSubmission(id, submission);
            await updateIndex(runtime.storage, (index) => {
                if (!index.assets.includes(card.image)) {
                    throw Object.assign(new Error('封面图片尚未托管'), { status: 409 });
                }
                return { ...index, cards: [card, ...index.cards] };
            });
            await writeAudit(c, '发布活动内容', card.title);
            return c.json({ success: true, card });
        } catch (error) {
            const status = statusFromError(error);
            if (status >= 500) console.error('Failed to create information card', error);
            return c.json({
                error: status >= 500 ? '活动内容保存失败' : messageFromError(error)
            }, status as 400 | 409 | 500);
        }
    });

    app.put('/api/admin/information/:id', coreAuth, opOnly, coreCsrf, async (c) => {
        const runtime = services(c);
        if (!runtime.storage) throw new Error('Object storage unavailable');
        try {
            const submission = validateSubmission(await c.req.json());
            const id = c.req.param('id');
            const card = cardFromSubmission(id, submission);
            await updateIndex(runtime.storage, (index) => {
                const position = index.cards.findIndex((candidate) => candidate.id === id);
                if (position < 0) throw Object.assign(new Error('活动内容不存在'), { status: 404 });
                if (!index.assets.includes(card.image)) {
                    throw Object.assign(new Error('封面图片尚未托管'), { status: 409 });
                }
                const cards = [...index.cards];
                cards[position] = card;
                return { ...index, cards };
            });
            await writeAudit(c, '更新活动内容', card.title);
            return c.json({ success: true, card });
        } catch (error) {
            const status = statusFromError(error);
            if (status >= 500) console.error('Failed to update information card', error);
            return c.json({
                error: status >= 500 ? '活动内容保存失败' : messageFromError(error)
            }, status as 400 | 404 | 409 | 500);
        }
    });

    app.delete('/api/admin/information/assets', coreAuth, opOnly, coreCsrf, async (c) => {
        const runtime = services(c);
        if (!runtime.storage) throw new Error('Object storage unavailable');
        try {
            const body = await c.req.json<{ url?: unknown }>();
            const url = typeof body.url === 'string' ? body.url.trim() : '';
            if (!informationAssetUrl(url)) {
                return c.json({ error: '图片地址无效' }, 400);
            }
            await updateIndex(runtime.storage, (index) => {
                if (index.cards.some((card) => cardUsesAsset(card, url))) {
                    throw Object.assign(new Error('图片仍被活动内容使用'), { status: 409 });
                }
                return { ...index, assets: index.assets.filter((asset) => asset !== url) };
            });
            try {
                await deleteObjectWithCompensation(runtime, url.replace(/^\/+/, ''));
            } catch (error) {
                console.error('Failed to clean committed information asset deletion', error);
            }
            await writeAudit(c, '删除活动图片', url);
            return c.json({ success: true });
        } catch (error) {
            const status = statusFromError(error);
            if (status >= 500) console.error('Failed to delete information asset', error);
            return c.json({
                error: status >= 500 ? '图片删除失败' : messageFromError(error)
            }, status as 400 | 409 | 500);
        }
    });

    app.delete('/api/admin/information/:id', coreAuth, opOnly, coreCsrf, async (c) => {
        const runtime = services(c);
        if (!runtime.storage) throw new Error('Object storage unavailable');
        const id = c.req.param('id');
        let title = id;
        try {
            await updateIndex(runtime.storage, (index) => {
                const card = index.cards.find((candidate) => candidate.id === id);
                if (!card) throw Object.assign(new Error('活动内容不存在'), { status: 404 });
                title = card.title;
                return { ...index, cards: index.cards.filter((candidate) => candidate.id !== id) };
            });
            await writeAudit(c, '删除活动内容', title);
            return c.json({ success: true });
        } catch (error) {
            const status = statusFromError(error);
            if (status >= 500) console.error('Failed to delete information card', error);
            return c.json({
                error: status >= 500 ? '活动内容删除失败' : messageFromError(error)
            }, status as 404 | 409 | 500);
        }
    });
}
