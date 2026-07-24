import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import { writeAudit } from '@/domains/audit/hono-service';
import { parseNewsSubmission } from '@/domains/news/submission';
import { randomHex } from '@/utils/crypto/random';
import { messageFromError, statusFromError } from '@/utils/http/error-response';
import { authRepository, newsRepository, services } from '@/middleware/hono-context';
import { safeUploadBaseName } from '@/utils/media/filename';
import { validateUploadedImage } from '@/utils/media/image-upload';
import { deleteObjectWithCompensation } from '@/utils/storage/delete-object';

export async function handleCreateNews(c: Context<AppEnvironment>): Promise<Response> {
    const runtime = services(c);
    let originalKey = '';
    let thumbnailKey = '';
    let businessCommitted = false;
    try {
        const submission = await parseNewsSubmission(c);
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

        const user = await authRepository(c).findUserById(c.get('user')!.id);
        if (!user) {
            if (runtime.storage) {
                await Promise.all([originalKey, thumbnailKey].filter(Boolean).map((key) =>
                    deleteObjectWithCompensation(runtime, key)
                ));
            }
            return c.json({ success: false, msg: '用户信息获取失败' });
        }
        await newsRepository(c).insertNews({
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
}
