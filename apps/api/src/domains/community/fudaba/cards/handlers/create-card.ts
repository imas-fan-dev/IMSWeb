import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import { fudabaOwnerCardView } from '@/domains/community/fudaba/contracts/card';
import { ownerCardArtwork } from '@/domains/community/fudaba/cards/artwork-view';
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
        const frontInfo =
            rotations.front && frontImage
                ? await runtime.images.validate(rotatedFront, 'image/webp')
                : frontImage;
        const backInfo =
            rawBack && rotations.back
                ? await runtime.images.validate(rotatedBack!, 'image/webp')
                : rawBack;
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
                if (!turns) return converted;
                const body = await images.rotate!(converted.body, turns * 90);
                const info = await images.validate(body, 'image/webp');
                return { ...converted, body, width: info.width, height: info.height };
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
        ): Promise<void> => {
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
        };
        await store(
            `page-${randomUUID()}`,
            rotatedFront,
            frontInfo!.width,
            frontInfo!.height
        );
        for (const image of middleImages) {
            await store(
                `page-${randomUUID()}`,
                image.body,
                image.width,
                image.height
            );
        }
        // Page rows are the display order: front, middle pages, back.
        // The back must be stored after the middles or it becomes page 2.
        if (backImage) {
            await store(
                `page-${randomUUID()}`,
                backImage.body,
                backInfo!.width,
                backInfo!.height
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
            // 幂等恢复：创建其实已经落库时，页面行与本次写入逐页一致。
            const recoveredPages = recovered?.pages ?? [];
            if (
                recovered &&
                recoveredPages.length === pages.length &&
                pages.every((page, index) => {
                    const saved = recoveredPages[index];
                    return (
                        saved !== undefined &&
                        saved.page_id === page.pageId &&
                        saved.object_version === page.objectVersion
                    );
                })
            ) {
                const recoveredArtwork = ownerCardArtwork(recovered, {
                    live: recovered.pages,
                    pending: recovered.pending_pages ?? []
                });
                return c.json({
                    success: true,
                    card: fudabaOwnerCardView(
                        recovered,
                        recoveredArtwork.live,
                        recoveredArtwork.pending ?? undefined
                    )
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
        const savedArtwork = ownerCardArtwork(result.card, {
            live: result.card.pages,
            pending: result.card.pending_pages ?? []
        });
        return c.json({
            success: true,
            card: fudabaOwnerCardView(
                result.card,
                savedArtwork.live,
                savedArtwork.pending ?? undefined
            )
        }, 201);
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
