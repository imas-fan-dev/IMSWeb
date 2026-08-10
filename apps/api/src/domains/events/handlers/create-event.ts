import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import { parseCreateEventRequest } from '@/domains/events/request';
import type {
    CreateEventResponse,
    EventErrorResponse
} from '@/domains/events/response';
import { randomHex } from '@/utils/crypto/random';
import { messageFromError, statusFromError } from '@/utils/http/error-response';
import { eventRepository, services } from '@/middleware/hono-context';
import { safeUploadBaseName } from '@/utils/media/filename';
import { validateUploadedImage } from '@/utils/media/image-upload';
import { deleteObjectWithCompensation } from '@/utils/storage/delete-object';
import { eventPosterObjectKey } from '@/utils/storage/business-object-keys';

export async function handleCreateEvent(c: Context<AppEnvironment>): Promise<Response> {
    const runtime = services(c);
    if (!runtime.uploads || !runtime.images || !runtime.storage) throw new Error('Upload services unavailable');
    let key = '';
    let publicKey = '';
    let businessCommitted = false;
    try {
        const submission = await parseCreateEventRequest(c);
        const file = submission.image;
        const info = await validateUploadedImage(file, runtime.images);
        const extension = info.format === 'jpeg' ? 'jpg' : info.format;
        const filename = `${safeUploadBaseName(file.filename)}-${Date.now()}-${randomHex(6)}.${extension}`;
        publicKey = `uploads/event/original/${filename}`;
        key = eventPosterObjectKey(filename);
        await runtime.storage.put(key, file.body, {
            contentType: info.contentType,
            deferredPublication: true
        });
        const id = await eventRepository(c).insertEvent({
            title: submission.title,
            name: submission.name,
            contact: submission.contact,
            imageUrl: `/${publicKey}`
        });
        businessCommitted = true;
        try {
            await runtime.storage.publish?.(key);
        } catch (error) {
            console.error('Failed to publish committed event media; recovery will retry', error);
        }
        return c.json({ success: true, id } satisfies CreateEventResponse);
    } catch (error) {
        if (key && !businessCommitted) {
            await deleteObjectWithCompensation(runtime, key).catch(() => undefined);
        }
        const status = statusFromError(error);
        if (status >= 500) {
            console.error('Failed to create event', error);
            return c.json({ error: '服务器错误' } satisfies EventErrorResponse, status as 500);
        }
        return c.json({ error: messageFromError(error) } satisfies EventErrorResponse, status as 400);
    }
}
