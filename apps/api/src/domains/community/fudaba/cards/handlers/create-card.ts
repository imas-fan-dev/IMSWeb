import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import { fudabaOwnerCardView } from '@/domains/community/fudaba/contracts/card';
import {
    parseFudabaCardCreateFields,
    parseMediaRotations
} from '@/domains/community/fudaba/cards/request';
import { deleteObjectWithCompensation } from '@/utils/storage/delete-object';
import { fudabaRepository, services } from '@/middleware/hono-context';
import type { UploadedFile } from '@/ports/http';
import type {
    FudabaCardMutationResult,
    FudabaCardPageWrite,
    FudabaCardRecord
} from '@/ports/repositories';
import { randomHex } from '@/utils/crypto/random';
import { messageFromError, statusFromError } from '@/utils/http/error-response';
import { convertUserImageToWebp } from '@/utils/media/user-image';
import { NAMECARD_MIDDLE_IMAGE_LIMIT } from '@imsweb/contracts/fudaba/runtime';
import { randomUUID } from 'node:crypto';
import { storeCardPage } from '@/domains/community/fudaba/cards/artwork-store';

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
    const createdKeys: string[] = [];
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
            maxFields: 17,
            maxParts: 20 + NAMECARD_MIDDLE_IMAGE_LIMIT
        });
        const front = oneFile(upload.files.front);
        const back = oneFile(upload.files.back);
        if (!front) {
            throw Object.assign(new Error('必须上传名片正面'), { status: 400 });
        }
        const fields = parseFudabaCardCreateFields(upload.fields);
        // 旋转和上传同一次保存：写入前转好，revision 只由这次创建产生。
        const rotations = parseMediaRotations(upload.fields.rotations);
        const frontImage = await convertUserImageToWebp(
            front,
            runtime.images,
            MAX_CARD_IMAGE_BYTES
        );
        // A single-sided card is legal: no back artwork, nothing uploaded.
        if ((rotations.front || rotations.back) && !runtime.images.rotate) {
            throw new Error('Image rotation is unavailable');
        }
        const rotatedFront = rotations.front
            ? await runtime.images.rotate!(
                  frontImage.body,
                  rotations.front * 90
              )
            : frontImage.body;
        const rawBack = back
            ? await convertUserImageToWebp(back, runtime.images, MAX_CARD_IMAGE_BYTES)
            : null;
        const rotatedBack = rawBack
            ? rotations.back
                ? await runtime.images.rotate!(rawBack.body, rotations.back * 90)
                : rawBack.body
            : null;
        const backImage = rawBack ? { ...rawBack, body: rotatedBack! } : null;
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
            middleFiles.map(async (file, index) => {
                const converted = await convertUserImageToWebp(
                    file,
                    images,
                    MAX_CARD_IMAGE_BYTES
                );
                const turns = rotations.middles[index] ?? 0;
                return turns
                    ? {
                          ...converted,
                          body: await images.rotate!(
                              converted.body,
                              turns * 90
                          )
                      }
                    : converted;
            }),
        );
        const accent = (await runtime.images.dominantColor?.(rotatedFront)) ?? null;
        const cardId = crypto.randomUUID();
        const ownerAccountId = c.get('platformUser')!.id;
        const pages: FudabaCardPageWrite[] = [];
        const store = async (
            pageId: string,
            body: Uint8Array,
            width: number,
            height: number
        ) => {
            const stored = await storeCardPage(runtime, {
                cardId,
                queue: 'live',
                pageId,
                body,
                width,
                height,
                accountId: ownerAccountId
            });
            createdKeys.push(stored.key);
            pages.push({
                pageId,
                objectVersion: stored.version,
                width,
                height
            });
            return stored.key;
        };
        const frontKey = await store(
            `page-${randomUUID()}`,
            rotatedFront,
            frontImage.width,
            frontImage.height
        );
        let backKey: string | null = null;
        if (backImage) {
            backKey = await store(
                `page-${randomUUID()}`,
                backImage.body,
                rawBack!.width,
                rawBack!.height
            );
        }
        const middleKeys: string[] = [];
        for (const [index, image] of middleImages.entries()) {
            middleKeys.push(
                await store(
                    `page-${randomUUID()}`,
                    image.body,
                    image.width,
                    image.height
                )
            );
        }
        const now = new Date().toISOString();
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
                pages,
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
            await Promise.all(createdKeys.map((key) =>
                deleteObjectWithCompensation(runtime, key)
            ));
            return c.json({ success: false, code: 'FUDABA_CARD_UNAVAILABLE' }, 409);
        }
        cleanupCreatedObjects = false;
        return c.json({ success: true, card: fudabaOwnerCardView(result.card) }, 201);
    } catch (error) {
        if (cleanupCreatedObjects) {
            await Promise.all(createdKeys.map((key) =>
                deleteObjectWithCompensation(runtime, key).catch(() => undefined)
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
