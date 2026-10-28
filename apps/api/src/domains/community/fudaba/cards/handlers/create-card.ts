import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import { fudabaOwnerCardView } from '@/domains/community/fudaba/contracts/card';
import { parseFudabaCardCreateFields } from '@/domains/community/fudaba/cards/request';
import { fudabaRepository, services } from '@/middleware/hono-context';
import type { UploadedFile } from '@/ports/http';
import type { FudabaCardMutationResult, FudabaCardRecord } from '@/ports/repositories';
import { randomHex } from '@/utils/crypto/random';
import { messageFromError, statusFromError } from '@/utils/http/error-response';
import { convertUserImageToWebp } from '@/utils/media/user-image';
import { NAMECARD_MIDDLE_IMAGE_LIMIT } from '@imsweb/contracts/fudaba/runtime';
import {
    fudabaCardBackObjectKey,
    fudabaCardFrontObjectKey,
    fudabaCardMiddleVersionObjectKey
} from '@/utils/storage/business-object-keys';
import { deleteOwnedObjectWithCompensation } from '@/utils/storage/delete-object';

const MAX_CARD_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_CARD_REQUEST_BYTES = (MAX_CARD_IMAGE_BYTES * 2) + (128 * 1024);

function oneFile(value: UploadedFile | UploadedFile[] | undefined): UploadedFile | null {
    return value && !Array.isArray(value) ? value : null;
}

export async function handleCreateFudabaCard(
    c: Context<AppEnvironment>
): Promise<Response> {
    const runtime = services(c);
    if (!runtime.uploads || !runtime.images || !runtime.storage) {
        throw new Error('Upload services unavailable');
    }
    const created: Array<{ key: string; ownerToken: string }> = [];
    let cleanupCreatedObjects = true;
    try {
        const upload = await runtime.uploads.parse(c.req.raw, {
            maxBytes: MAX_CARD_REQUEST_BYTES,
            // The picker hands the server an ordered set: `front`, `back`,
            // then `images` in reading order (the middle pages). A single
            // image means a single-sided card.
            fileFields: ['front', 'back', 'images'],
            maxFiles: 2 + NAMECARD_MIDDLE_IMAGE_LIMIT,
            // 13 text fields today (producer, reading, series, characters,
            // bio, trade note, exchange mode, made on, group, three flags,
            // credits).
            maxFields: 16,
            maxParts: 20 + NAMECARD_MIDDLE_IMAGE_LIMIT
        });
        const front = oneFile(upload.files.front);
        const back = oneFile(upload.files.back);
        if (!front) {
            throw Object.assign(new Error('必须上传名片正面'), { status: 400 });
        }
        const fields = parseFudabaCardCreateFields(upload.fields);
        const frontImage = await convertUserImageToWebp(
            front,
            runtime.images,
            MAX_CARD_IMAGE_BYTES
        );
        // A single-sided card is legal: no back artwork, nothing uploaded.
        const backImage = back
            ? await convertUserImageToWebp(back, runtime.images, MAX_CARD_IMAGE_BYTES)
            : null;
        // The picker marks the second slot of a multi-image submission as the
        // back, so middle pages cannot exist without one: a card with two or
        // more images always has a back, and anything else is a client bug.
        const middleFiles = Array.isArray(upload.files.images)
            ? upload.files.images
            : upload.files.images
              ? [upload.files.images]
              : [];
        if (middleFiles.length > 0 && !back) {
            throw Object.assign(new Error('中间页需要先提供名片背面'), {
                status: 400
            });
        }
        if (middleFiles.length > NAMECARD_MIDDLE_IMAGE_LIMIT) {
            throw Object.assign(
                new Error(`最多上传 ${NAMECARD_MIDDLE_IMAGE_LIMIT} 张中间页`),
                { status: 400 },
            );
        }
        const images = runtime.images;
        const middleImages = await Promise.all(
            middleFiles.map((file) =>
                convertUserImageToWebp(file, images, MAX_CARD_IMAGE_BYTES),
            ),
        );
        const accent = (await runtime.images.dominantColor?.(frontImage.body)) ?? null;
        const cardId = crypto.randomUUID();
        const frontKey = fudabaCardFrontObjectKey(cardId, 'webp');
        const backKey = backImage ? fudabaCardBackObjectKey(cardId, 'webp') : null;
        const pendingUploads: Array<{
            key: string;
            body: Uint8Array;
            side: string;
        }> = [{ key: frontKey, body: frontImage.body, side: 'front' }];
        if (backKey && backImage) {
            pendingUploads.push({ key: backKey, body: backImage.body, side: 'back' });
        }
        const middleKeys: string[] = [];
        middleImages.forEach((image, index) => {
            const key = fudabaCardMiddleVersionObjectKey(cardId, index + 1, '0');
            middleKeys.push(key);
            pendingUploads.push({
                key,
                body: image.body,
                side: `middle-${index + 1}`,
            });
        });
        for (const image of pendingUploads) {
            const ownerToken = randomHex(32);
            await runtime.storage.put(image.key, image.body, {
                contentType: 'image/webp',
                protectedAccess: true,
                ownerToken,
                metadata: {
                    kind: 'fudaba-card-image',
                    side: image.side,
                    account: c.get('platformUser')!.id
                }
            });
            created.push({ key: image.key, ownerToken });
        }
        const now = new Date().toISOString();
        const ownerAccountId = c.get('platformUser')!.id;
        const repository = fudabaRepository(c);
        cleanupCreatedObjects = false;
        let result: FudabaCardMutationResult;
        try {
            result = await repository.createCardForOwner({
                id: cardId,
                ownerAccountId,
                ...fields,
                frontObjectKey: frontKey,
                backObjectKey: backKey,
                middleObjectKeys: middleKeys,
                accent,
                createdAt: now,
                updatedAt: now
            });
        } catch (error) {
            let recovered: FudabaCardRecord | null | undefined;
            try {
                recovered = await repository.findCardForOwner(cardId, ownerAccountId);
            } catch (recoveryError) {
                console.error(
                    'Unable to reconcile an uncertain Fudaba card creation',
                    recoveryError
                );
            }
            if (
                recovered?.front_object_key === frontKey &&
                recovered.back_object_key === backKey
            ) {
                return c.json({
                    success: true,
                    card: fudabaOwnerCardView(recovered)
                }, 201);
            }
            throw error;
        }
        if (result.status !== 'saved') {
            cleanupCreatedObjects = true;
            await Promise.all(created.map(({ key, ownerToken }) =>
                deleteOwnedObjectWithCompensation(runtime, key, ownerToken)
            ));
            return c.json({ success: false, code: 'FUDABA_CARD_UNAVAILABLE' }, 409);
        }
        cleanupCreatedObjects = false;
        return c.json({ success: true, card: fudabaOwnerCardView(result.card) }, 201);
    } catch (error) {
        if (cleanupCreatedObjects) {
            await Promise.all(created.map(({ key, ownerToken }) =>
                deleteOwnedObjectWithCompensation(runtime, key, ownerToken)
                    .catch(() => undefined)
            ));
        }
        const status = statusFromError(error);
        if (status >= 500) console.error('Failed to create Fudaba card', error);
        return c.json({
            success: false,
            code: status >= 500 ? 'FUDABA_CARD_CREATE_FAILED' : 'FUDABA_CARD_INVALID',
            message: status >= 500 ? '名片创建失败' : messageFromError(error)
        }, status as 400 | 413 | 500);
    }
}
