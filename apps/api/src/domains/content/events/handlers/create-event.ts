import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import { writeAudit } from '@/domains/admin/audit/write-audit';
import {
    beginChronicleIdempotency,
    completeChronicleIdempotency,
    failChronicleIdempotency,
    idempotencyFingerprint,
    type IdempotencyHandle
} from '@/domains/content/chronicle/chronicle-idempotency';
import { parseCreateEventRequest } from '@/domains/content/events/request';
import type { CreateEventResponse, EventErrorResponse } from '@/domains/content/events/response';
import { chronicleUploadIdempotencyKey } from '@/middleware/rate-limit';
import { eventRepository, services } from '@/middleware/hono-context';
import { randomHex } from '@/utils/crypto/random';
import { sha256Hex } from '@/utils/crypto/sha256';
import { messageFromError, statusFromError } from '@/utils/http/error-response';
import { safeUploadBaseName } from '@/utils/media/filename';
import { validateUploadedImage } from '@/utils/media/image-upload';
import { deleteObjectWithCompensation } from '@/utils/storage/delete-object';
import { eventPosterObjectKey, publicMediaObjectKey } from '@/utils/storage/business-object-keys';

export async function handleCreateEvent(c: Context<AppEnvironment>): Promise<Response> {
    const runtime = services(c);
    let key = '';
    let businessCommitted = false;
    let handle: IdempotencyHandle | null = null;
    try {
        const operationKey = chronicleUploadIdempotencyKey(c.req.raw);
        if (!operationKey) {
            return c.json({ error: 'Idempotency-Key is required' } satisfies EventErrorResponse, 400);
        }
        if (!runtime.uploads || !runtime.images || !runtime.storage) {
            throw new Error('Upload services unavailable');
        }
        const submission = await parseCreateEventRequest(c);
        const file = submission.image;
        const digest = await sha256Hex(file.body);
        const requestFingerprint = {
            title: submission.title,
            name: submission.name,
            contact: submission.contact,
            image: {
                filename: file.filename,
                contentType: file.contentType,
                byteLength: file.body.byteLength,
                digest
            }
        };
        const fingerprint = await idempotencyFingerprint(requestFingerprint);
        const started = await beginChronicleIdempotency(
            c,
            'events:create',
            requestFingerprint
        );
        if (started instanceof Response) return started;
        if (!started) throw Object.assign(new Error('Idempotency-Key is required'), { status: 400 });
        handle = started;

        const repository = eventRepository(c);
        const existing = await repository.findEventByOperationKey(operationKey);
        if (existing) {
            if (existing.request_fingerprint !== fingerprint) {
                throw Object.assign(new Error('Idempotency-Key does not match request'), { status: 409 });
            }
            const id = Number(existing.id);
            const existingUrl = String(existing.image_url);
            const resumedPublication = existing.publication_state !== 'ready';
            await runtime.storage.publish?.(publicMediaObjectKey(existingUrl));
            if (!await repository.markEventReady(id, operationKey)) {
                throw new Error('Failed to finalize recovered event publication');
            }
            businessCommitted = true;
            if (resumedPublication) {
                await writeAudit(c, '创建活动', `event_id=${id};operation_key=${operationKey}`);
            }
            return completeChronicleIdempotency(
                handle,
                { success: true, id } satisfies CreateEventResponse
            );
        }

        const info = await validateUploadedImage(file, runtime.images);
        const extension = info.format === 'jpeg' ? 'jpg' : info.format;
        const filename = `${safeUploadBaseName(file.filename)}-${Date.now()}-${randomHex(6)}.${extension}`;
        const publicKey = `uploads/event/original/${filename}`;
        key = eventPosterObjectKey(filename);
        await runtime.storage.put(key, file.body, {
            contentType: info.contentType,
            deferredPublication: true,
            ownerToken: handle.token
        });
        const id = await repository.insertEvent({
            title: submission.title,
            name: submission.name,
            contact: submission.contact,
            imageUrl: `/${publicKey}`,
            operationKey,
            requestFingerprint: fingerprint
        });
        businessCommitted = true;
        await runtime.storage.publish?.(key);
        if (!await repository.markEventReady(id, operationKey)) {
            throw new Error('Failed to finalize event publication');
        }
        await writeAudit(c, '创建活动', `event_id=${id};operation_key=${operationKey}`);
        return completeChronicleIdempotency(
            handle,
            { success: true, id } satisfies CreateEventResponse
        );
    } catch (error) {
        if (key && !businessCommitted) {
            await deleteObjectWithCompensation(runtime, key).catch(() => undefined);
        }
        await failChronicleIdempotency(handle);
        const status = statusFromError(error);
        if (status >= 500) {
            console.error('Failed to create event', error);
            return c.json({ error: '服务器错误' } satisfies EventErrorResponse, 500);
        }
        return c.json({ error: messageFromError(error) } satisfies EventErrorResponse, status as 400);
    }
}
