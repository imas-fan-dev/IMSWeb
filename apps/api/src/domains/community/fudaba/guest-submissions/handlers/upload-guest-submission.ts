import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import { storeProtectedNamecardMedia } from '@/domains/community/fudaba/card-media-assets';
import { normalizeNamecardImage } from '@/domains/community/fudaba/guest-submissions/image';
import { parseUploadGuestSubmissionRequest } from '@/domains/community/fudaba/guest-submissions/request';
import {
    type FudabaGuestSubmissionReceiptResponse,
    type GuestSubmissionMessageResponse,
    type GuestSubmissionRateLimitResponse,
} from '@/domains/community/fudaba/guest-submissions/response';
import { purgeExpiredNamecardSubmissions } from '@/domains/community/fudaba/guest-submissions/ttl-purge';
import {
    getClientAddress,
    namecardRepository,
    services,
} from '@/middleware/hono-context';
import { md5Hex } from '@/utils/crypto/md5';
import { randomHex } from '@/utils/crypto/random';
import { sha256Hex } from '@/utils/crypto/sha256';
import { messageFromError, statusFromError } from '@/utils/http/error-response';
import { safeUploadBaseName } from '@/utils/media/filename';
import { deleteObjectWithCompensation } from '@/utils/storage/delete-object';

export async function enforcePublicUploadLimit(
    c: Context<AppEnvironment>,
): Promise<Response | null> {
    const limiter = services(c).rateLimiter;
    if (!limiter) return null;
    const result = await limiter.consume(
        'public-upload',
        getClientAddress(c),
        30,
        60 * 60,
    );
    return result.allowed
        ? null
        : c.json(
              {
                  error: 'Too many requests',
              } satisfies GuestSubmissionRateLimitResponse,
              429,
          );
}

async function handleUploadGuestSubmission(
    c: Context<AppEnvironment>,
): Promise<Response> {
    const limited = await enforcePublicUploadLimit(c);
    if (limited) return limited;
    await purgeExpiredNamecardSubmissions(c);
    const runtime = services(c);
    if (!runtime.uploads || !runtime.images || !runtime.storage) {
        throw new Error('Upload services unavailable');
    }
    const generated: string[] = [];
    try {
        const {
            images: files,
            seriesCode,
            favoriteIdolIds,
            producerName,
            displayName,
            bio,
            accent,
        } = await parseUploadGuestSubmissionRequest(c);
        if (files.some((file) => !file.contentType.startsWith('image/'))) {
            return c.json(
                { msg: '只允许上传图片文件' } satisfies GuestSubmissionMessageResponse,
                400,
            );
        }
        if (files.length !== 2) {
            return c.json(
                { msg: '必须上传2张图片' } satisfies GuestSubmissionMessageResponse,
                400,
            );
        }
        if (files.some((file) => file.body.byteLength > 3 * 1024 * 1024)) {
            return c.json(
                { msg: '文件过大' } satisfies GuestSubmissionMessageResponse,
                400,
            );
        }
        const outputs: Array<{ url: string; hash: string }> = [];
        for (const file of files) {
            const webp = await normalizeNamecardImage(file, runtime.images);
            const filename = `${safeUploadBaseName(file.filename)}-${Date.now()}-${randomHex(6)}.webp`;
            const stored = await storeProtectedNamecardMedia(
                {
                    compensation: runtime.compensation,
                    images: runtime.images,
                    storage: runtime.storage,
                },
                filename,
                webp,
            );
            generated.push(...stored.keys);
            outputs.push({ url: stored.url, hash: md5Hex(webp) });
        }
        if (
            await namecardRepository(c).findCardByOrderedHashes(
                outputs[0].hash,
                outputs[1].hash,
            )
        ) {
            await Promise.all(
                generated.map((key) => deleteObjectWithCompensation(runtime, key)),
            );
            return c.json(
                { msg: '重复上传' } satisfies GuestSubmissionMessageResponse,
                409,
            );
        }
        const withdrawalToken = randomHex(32);
        const id = await namecardRepository(c).insertPendingCard({
            image1Url: outputs[0].url,
            image2Url: outputs[1].url,
            hash1: outputs[0].hash,
            hash2: outputs[1].hash,
            ip: getClientAddress(c),
            withdrawalTokenHash: await sha256Hex(
                new TextEncoder().encode(withdrawalToken),
            ),
            seriesCode,
            idolIds: favoriteIdolIds,
            submissionKind: 'guest',
            producerName,
            displayName,
            bio,
            accent,
        });
        const message = '上传成功，等待审核';
        return c.json({
            success: true,
            message,
            submission: {
                id,
                publicationStatus: 'pending',
                revision: 0,
            },
            withdrawalToken,
        } satisfies FudabaGuestSubmissionReceiptResponse);
    } catch (error) {
        await Promise.all(
            generated.map((key) =>
                deleteObjectWithCompensation(runtime, key).catch(() => undefined),
            ),
        );
        const status = statusFromError(error);
        if (status >= 500) {
            console.error('Failed to upload Fudaba guest submission', error);
            return c.json(
                { msg: '服务器错误' } satisfies GuestSubmissionMessageResponse,
                status as 500,
            );
        }
        return c.json(
            { msg: messageFromError(error) } satisfies GuestSubmissionMessageResponse,
            status as 400,
        );
    }
}

export function handleCreateFudabaGuestSubmission(
    c: Context<AppEnvironment>,
): Promise<Response> {
    return handleUploadGuestSubmission(c);
}
