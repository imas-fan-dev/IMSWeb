import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import {
    beginChronicleUploadIdempotency,
    completeChronicleIdempotency,
    deleteChronicleGenerationObject,
    ensureCurrentIdempotencyHandle,
    failChronicleIdempotency,
    idempotencyFingerprint,
    isCurrentIdempotencyHandle,
    type IdempotencyHandle
} from '@/domains/content/chronicle/chronicle-idempotency';
import {
    chroniclePrefix,
    mutateChronicleMeta,
    readChronicleMeta,
    recordsFromChronicleMeta,
    withChronicleRecords,
    type ChronicleRecord
} from '@/domains/content/chronicle/chronicle-records';
import { parseChronicleUploadRequest } from '@/domains/content/chronicle/request';
import type {
    ChronicleUploadErrorResponse,
    ChronicleUploadResponse
} from '@/domains/content/chronicle/response';
import { chronicleUploadIdempotencyKey } from '@/middleware/rate-limit';
import { randomHex } from '@/utils/crypto/random';
import { sha256Hex } from '@/utils/crypto/sha256';
import { messageFromError, statusFromError } from '@/utils/http/error-response';
import { services } from '@/middleware/hono-context';
import { safeUploadBaseName } from '@/utils/media/filename';
import { validateUploadedImage } from '@/utils/media/image-upload';

export async function handleUploadChronicleMedia(
    c: Context<AppEnvironment>
): Promise<Response> {
    const idempotencyKey = chronicleUploadIdempotencyKey(c.req.raw);
    const runtime = services(c);
    if (!runtime.uploads || !runtime.images || !runtime.storage) {
        throw new Error('Upload services unavailable');
    }
    const written: string[] = [];
    let handle: IdempotencyHandle | null = null;
    let metadataCommitted = false;
    try {
        const { activityId, username, uploads } = await parseChronicleUploadRequest(
            c.req.raw,
            runtime.uploads
        );
        const digested = await Promise.all(uploads.map(async (file) => ({
            file,
            digest: await sha256Hex(file.body)
        })));
        const fingerprint = await idempotencyFingerprint({
            activityId,
            username,
            files: digested.map(({ file, digest }) => ({
                filename: file.filename,
                contentType: file.contentType,
                byteLength: file.body.byteLength,
                digest
            }))
        });
        const started = await beginChronicleUploadIdempotency(c, idempotencyKey, fingerprint);
        if (started instanceof Response) return started;
        handle = started;
        const validated = await Promise.all(digested.map(async ({ file, digest }) => ({
            file,
            digest,
            info: await validateUploadedImage(file, runtime.images!)
        })));
        const claimedKey = handle?.key || '';
        const current = await readChronicleMeta(runtime.storage, activityId);
        const currentRecords = recordsFromChronicleMeta(current);
        if (claimedKey && currentRecords.some((record) => record.idempotencyKey === claimedKey)) {
            return completeChronicleIdempotency(handle, {
                success: true,
                count: currentRecords.filter((record) =>
                    record.idempotencyKey === claimedKey).length
            } satisfies ChronicleUploadResponse);
        }
        const newRecords: ChronicleRecord[] = [];
        for (const [index, { file, info }] of validated.entries()) {
            await ensureCurrentIdempotencyHandle(handle);
            const extension = info.format === 'jpeg' ? 'jpg' : info.format;
            const suffix = handle
                ? `${handle.token.slice(0, 24)}-${index}`
                : `${Date.now()}-${randomHex(6)}`;
            const filename = `${safeUploadBaseName(file.filename)}-${suffix}.${extension}`;
            const key = chroniclePrefix('upload', activityId, filename);
            await runtime.storage.put(key, file.body, {
                contentType: info.contentType,
                protectedAccess: true,
                ...(handle ? { ownerToken: handle.token } : {})
            });
            written.push(key);
            newRecords.push({
                filename,
                uploader: username,
                time: new Date().toISOString(),
                status: 'pending',
                ...(claimedKey ? { idempotencyKey: claimedKey } : {})
            });
        }
        await ensureCurrentIdempotencyHandle(handle);
        await mutateChronicleMeta(runtime.storage, activityId, (latest) => {
            const latestRecords = recordsFromChronicleMeta(latest);
            return claimedKey && latestRecords.some((record) =>
                record.idempotencyKey === claimedKey)
                ? latest
                : withChronicleRecords(latest, [...latestRecords, ...newRecords]);
        });
        metadataCommitted = true;
        return await completeChronicleIdempotency(handle, {
            success: true,
            count: newRecords.length
        } satisfies ChronicleUploadResponse);
    } catch (error) {
        if (!metadataCommitted && await isCurrentIdempotencyHandle(handle)) {
            await Promise.all(written.map((key) =>
                deleteChronicleGenerationObject(runtime, handle, key).catch(() => undefined)
            ));
        }
        await failChronicleIdempotency(handle);
        const status = statusFromError(error);
        if (status >= 500) {
            console.error('Chronicle upload failed', error);
            return c.json({
                success: false,
                error: '服务器错误'
            } satisfies ChronicleUploadErrorResponse, status as 500);
        }
        return c.json({
            success: false,
            error: messageFromError(error)
        } satisfies ChronicleUploadErrorResponse, status as 400);
    }
}
