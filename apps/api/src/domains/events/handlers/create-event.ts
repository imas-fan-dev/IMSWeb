import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import type { UploadedFile } from '@/ports/http';
import { randomHex } from '@/utils/crypto/random';
import { messageFromError, statusFromError } from '@/utils/http/error-response';
import { eventRepository, services } from '@/middleware/hono-context';
import { safeUploadBaseName } from '@/utils/media/filename';
import { validateUploadedImage } from '@/utils/media/image-upload';
import { deleteObjectWithCompensation } from '@/utils/storage/delete-object';

function oneFile(value: UploadedFile | UploadedFile[] | undefined): UploadedFile | null {
    if (!value || Array.isArray(value)) return null;
    return value;
}

export async function handleCreateEvent(c: Context<AppEnvironment>): Promise<Response> {
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
        const id = await eventRepository(c).insertEvent({
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
}
