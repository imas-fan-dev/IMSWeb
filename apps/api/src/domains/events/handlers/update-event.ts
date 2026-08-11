import type { AppEnvironment } from '@/app';
import {
    parseUpdateEventRequest,
    type EventIdParams
} from '@/domains/events/request';
import type {
    EventErrorResponse,
    EventMutationResponse
} from '@/domains/events/response';
import { randomHex } from '@/utils/crypto/random';
import { messageFromError, statusFromError } from '@/utils/http/error-response';
import { eventRepository, services } from '@/middleware/hono-context';
import type { ValidatedRequestContext } from '@/middleware/request-validation';
import { safeUploadBaseName } from '@/utils/media/filename';
import { validateUploadedImage } from '@/utils/media/image-upload';
import { deleteObjectWithCompensation } from '@/utils/storage/delete-object';
import {
    eventPosterObjectKey,
    publicMediaObjectKey
} from '@/utils/storage/business-object-keys';

function managedEventObjectKey(url: string): string | null {
    try {
        return publicMediaObjectKey(url);
    } catch {
        return null;
    }
}

export async function handleUpdateEvent(
    c: ValidatedRequestContext<AppEnvironment, 'param', EventIdParams>
): Promise<Response> {
    const runtime = services(c);
    if (!runtime.uploads || !runtime.images || !runtime.storage) {
        throw new Error('Upload services unavailable');
    }
    const { id } = c.req.valid('param');
    if (!id) {
        return c.json({ error: '活动不存在' } satisfies EventErrorResponse, 404);
    }

    let stagedKey = '';
    let businessCommitted = false;
    try {
        const repository = eventRepository(c);
        const current = await repository.findEventMedia(id);
        if (!current) {
            return c.json({ error: '活动不存在' } satisfies EventErrorResponse, 404);
        }
        const submission = await parseUpdateEventRequest(c);
        let imageUrl = current.image_url;

        if (submission.image) {
            const info = await validateUploadedImage(submission.image, runtime.images);
            const extension = info.format === 'jpeg' ? 'jpg' : info.format;
            const filename = `${safeUploadBaseName(submission.image.filename)}-${Date.now()}-${randomHex(6)}.${extension}`;
            imageUrl = `/uploads/event/original/${filename}`;
            stagedKey = eventPosterObjectKey(filename);
            await runtime.storage.put(stagedKey, submission.image.body, {
                contentType: info.contentType,
                deferredPublication: true
            });
            if (!runtime.storage.publish) {
                throw new Error('Object publication unavailable');
            }
            await runtime.storage.publish(stagedKey);
        }

        const updated = await repository.updateEvent(id, {
            title: submission.title,
            name: submission.name,
            contact: submission.contact,
            imageUrl
        }, current.image_url);
        if (!updated) {
            const stillExists = await repository.findEventMedia(id);
            throw Object.assign(
                new Error(stillExists ? '活动已被其他管理员修改，请刷新后重试' : '活动不存在'),
                { status: stillExists ? 409 : 404 }
            );
        }
        businessCommitted = true;

        if (stagedKey) {
            const previousKey = managedEventObjectKey(current.image_url);
            if (previousKey && previousKey !== stagedKey) {
                try {
                    const references = await repository.countEventMediaReferences(
                        current.image_url
                    );
                    if (references === 0) {
                        await deleteObjectWithCompensation(runtime, previousKey);
                    }
                } catch (error) {
                    console.error('Failed to clean replaced event media', error);
                }
            }
        }
        return c.json({ success: true } satisfies EventMutationResponse);
    } catch (error) {
        if (stagedKey && !businessCommitted) {
            await deleteObjectWithCompensation(runtime, stagedKey).catch(() => undefined);
        }
        const status = statusFromError(error);
        if (status >= 500) {
            console.error('Failed to update event', error);
            return c.json({ error: '服务器错误' } satisfies EventErrorResponse, 500);
        }
        return c.json(
            { error: messageFromError(error) } satisfies EventErrorResponse,
            status as 400 | 404 | 409 | 413
        );
    }
}
