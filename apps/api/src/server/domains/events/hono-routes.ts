import type { ImsHonoApp } from '@/app';
import { coreAuth, coreCsrf, opOnly } from '@/middleware/hono-auth';
import type { UploadedFile } from '@/ports/upload-parser';
import {
    coreRepository,
    messageFromError,
    positiveInteger,
    randomHex,
    safeUploadBaseName,
    services,
    statusFromError
} from '@/shared/hono-utils';
import { validateUploadedImage } from '@/shared/image-upload';
import { deleteObjectWithCompensation } from '@/shared/compensation';

function oneFile(value: UploadedFile | UploadedFile[] | undefined): UploadedFile | null {
    if (!value || Array.isArray(value)) return null;
    return value;
}

export function registerEventRoutes(app: ImsHonoApp): void {
    app.post('/api/events', coreAuth, opOnly, coreCsrf, async (c) => {
        const runtime = services(c);
        if (!runtime.uploads || !runtime.images || !runtime.storage) throw new Error('Upload services unavailable');
        let key = '';
        let businessCommitted = false;
        try {
            const parsed = await runtime.uploads.parse(c.req.raw, {
                maxBytes: 3 * 1024 * 1024 + 64 * 1024,
                fileFields: ['image'],
                maxFiles: 1,
                maxFields: 8,
                maxParts: 9
            });
            const file = oneFile(parsed.files.image);
            if (!file || file.body.byteLength > 3 * 1024 * 1024) {
                return c.json({ error: '必须上传一张图片' }, 400);
            }
            const info = await validateUploadedImage(file, runtime.images);
            const extension = info.format === 'jpeg' ? 'jpg' : info.format;
            const filename = `${safeUploadBaseName(file.filename)}-${Date.now()}-${randomHex(6)}.${extension}`;
            key = `uploads/event/original/${filename}`;
            await runtime.storage.put(key, file.body, {
                contentType: info.contentType,
                deferredPublication: true
            });
            const id = await coreRepository(c).insertEvent({
                title: parsed.fields.title || '',
                name: parsed.fields.name || '',
                contact: parsed.fields.contact || '',
                imageUrl: `/${key}`
            });
            businessCommitted = true;
            try {
                await runtime.storage.publish?.(key);
            } catch (error) {
                console.error('Failed to publish committed event media; recovery will retry', error);
            }
            return c.json({ success: true, id });
        } catch (error) {
            if (key && !businessCommitted) {
                await deleteObjectWithCompensation(runtime, key).catch(() => undefined);
            }
            const status = statusFromError(error);
            if (status >= 500) {
                console.error('Failed to create event', error);
                return c.json({ error: '服务器错误' }, status as 500);
            }
            return c.json({ error: messageFromError(error) }, status as 400);
        }
    });

    app.get('/api/events', async (c) => {
        const page = Number.parseInt(c.req.query('page') || '', 10) || 1;
        const size = Number.parseInt(c.req.query('size') || '', 10) || 5;
        const total = await coreRepository(c).countEvents();
        const list = await coreRepository(c).listEvents(size, (page - 1) * size);
        return c.json({ list, totalPage: Math.ceil(total / size) });
    });

    app.get('/api/events/:id', async (c) => {
        const id = positiveInteger(c.req.param('id'));
        const event = id ? await coreRepository(c).findEvent(id) : null;
        return event ? c.json(event) : c.json({ error: '活动不存在' }, 404);
    });

    app.delete('/api/events/:id', coreAuth, opOnly, coreCsrf, async (c) => {
        const id = positiveInteger(c.req.param('id'));
        if (!id) return c.json({ error: '不存在' }, 404);
        const repository = coreRepository(c);
        const media = await repository.findEventMedia(id);
        if (!media) return c.json({ error: '不存在' }, 404);
        await repository.deleteEvent(id);
        const key = media.image_url.replace(/^\/+/, '');
        try {
            await deleteObjectWithCompensation(services(c), key);
        } catch (error) {
            console.error('Failed to clean media for committed event deletion', error);
        }
        return c.json({ success: true });
    });
}
