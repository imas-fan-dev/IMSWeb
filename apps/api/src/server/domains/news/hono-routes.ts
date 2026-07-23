import type { Context } from 'hono';
import type { AppEnvironment, ImsHonoApp } from '@/app';
import { coreAuth, coreCsrf, opOnly } from '@/middleware/hono-auth';
import type { UploadedFile } from '@/ports/upload-parser';
import {
    coreRepository,
    messageFromError,
    randomHex,
    safeUploadBaseName,
    services,
    statusFromError
} from '@/shared/hono-utils';
import { writeAudit } from '@/domains/audit/hono-service';
import { validateUploadedImage } from '@/shared/image-upload';
import { deleteObjectWithCompensation } from '@/shared/compensation';

interface NewsSubmission {
    title?: unknown;
    content?: unknown;
    file?: UploadedFile;
}

async function parseSubmission(c: Context<AppEnvironment>): Promise<NewsSubmission> {
    const runtime = services(c);
    const contentType = c.req.header('content-type') || '';
    if (contentType.toLowerCase().startsWith('multipart/form-data')) {
        if (!runtime.uploads) throw new Error('Upload parser unavailable');
        const parsed = await runtime.uploads.parse(c.req.raw, {
            maxBytes: 10 * 1024 * 1024 + 128 * 1024,
            fileFields: ['image'],
            maxFiles: 1,
            maxFields: 4,
            maxParts: 5
        });
        const value = parsed.files.image;
        if (Array.isArray(value) && value.length > 1) {
            throw Object.assign(new Error('只能上传一张图片'), { status: 400 });
        }
        return {
            title: parsed.fields.title,
            content: parsed.fields.content,
            file: Array.isArray(value) ? value[0] : value
        };
    }
    try {
        return await c.req.json<NewsSubmission>();
    } catch {
        throw Object.assign(new Error('资讯标题或链接无效'), { status: 400 });
    }
}

export function registerNewsRoutes(app: ImsHonoApp): void {
    app.get('/api/news', async (c) => {
        try {
            return c.json(await coreRepository(c).listPublicNews());
        } catch {
            return c.json([], 500);
        }
    });

    app.get('/api/admin/news', coreAuth, opOnly, async (c) => {
        try {
            return c.json({ success: true, data: await coreRepository(c).listAdminNews() });
        } catch {
            return c.json({ success: false, msg: '数据库错误' });
        }
    });

    app.post('/api/admin/news', coreAuth, opOnly, coreCsrf, async (c) => {
        const runtime = services(c);
        let originalKey = '';
        let thumbnailKey = '';
        let businessCommitted = false;
        try {
            const submission = await parseSubmission(c);
            let url: URL;
            try {
                url = new URL(String(submission.content || ''));
            } catch {
                return c.json({ success: false, msg: '资讯链接无效' }, 400);
            }
            if (
                typeof submission.title !== 'string' || !submission.title.trim() ||
                submission.title.length > 300 || !['http:', 'https:'].includes(url.protocol) ||
                url.href.length > 4096
            ) {
                return c.json({ success: false, msg: '资讯标题或链接无效' }, 400);
            }

            if (submission.file) {
                if (!runtime.images || !runtime.storage) throw new Error('Image services unavailable');
                if (submission.file.body.byteLength > 10 * 1024 * 1024) {
                    return c.json({ success: false, msg: '图片过大' }, 400);
                }
                const info = await validateUploadedImage(submission.file, runtime.images);
                const extension = info.format === 'jpeg' ? 'jpg' : info.format;
                const filename = `${safeUploadBaseName(submission.file.filename)}-${Date.now()}-${randomHex(6)}.${extension}`;
                originalKey = `uploads/news/original/${filename}`;
                const thumbnailName = filename.replace('.', '_thumb.');
                thumbnailKey = `uploads/news/thumb/${thumbnailName}`;
                await runtime.storage.put(originalKey, submission.file.body, {
                    contentType: info.contentType,
                    deferredPublication: true
                });
                const thumbnail = await runtime.images.thumbnailPng(submission.file.body, 300, 200);
                await runtime.storage.put(thumbnailKey, thumbnail, {
                    contentType: 'image/png',
                    deferredPublication: true
                });
            }

            const user = await coreRepository(c).findUserById(c.get('user')!.id);
            if (!user) {
                if (runtime.storage) {
                    await Promise.all([originalKey, thumbnailKey].filter(Boolean).map((key) =>
                        deleteObjectWithCompensation(runtime, key)
                    ));
                }
                return c.json({ success: false, msg: '用户信息获取失败' });
            }
            await coreRepository(c).insertNews({
                title: submission.title.trim(),
                image: originalKey ? `/${originalKey}` : '',
                thumbnail: thumbnailKey ? `/${thumbnailKey}` : '',
                content: url.href,
                date: new Date().toISOString(),
                author: user.producername || '未知P'
            });
            businessCommitted = true;
            if (runtime.storage?.publish) {
                try {
                    await Promise.all([originalKey, thumbnailKey].filter(Boolean).map((key) =>
                        runtime.storage!.publish!(key)
                    ));
                } catch (error) {
                    console.error('Failed to publish committed news media; recovery will retry', error);
                }
            }
            await writeAudit(c, '发布新闻', submission.title);
            return c.json({ success: true });
        } catch (error) {
            if (runtime.storage && !businessCommitted) {
                await Promise.all([originalKey, thumbnailKey].filter(Boolean).map((key) =>
                    deleteObjectWithCompensation(runtime, key).catch(() => undefined)
                ));
            }
            const status = statusFromError(error);
            if (status >= 500) {
                console.error('Failed to create news', error);
                return c.json({ success: false, msg: '服务器异常' }, status as 500);
            }
            return c.json({ success: false, msg: messageFromError(error) }, status as 400);
        }
    });

    app.delete('/api/admin/news/:id', coreAuth, opOnly, coreCsrf, async (c) => {
        const id = Number(c.req.param('id'));
        const media = await coreRepository(c).findNewsMedia(id);
        await coreRepository(c).deleteNews(id);
        if (media) {
            try {
                await Promise.all([media.image, media.thumbnail].filter(Boolean).map((url) =>
                    deleteObjectWithCompensation(services(c), url.replace(/^\/+/, ''))
                ));
            } catch (error) {
                console.error('Failed to clean media for committed news deletion', error);
            }
        }
        await writeAudit(c, '删除新闻', `ID=${id}`);
        return c.json({ success: true });
    });
}
