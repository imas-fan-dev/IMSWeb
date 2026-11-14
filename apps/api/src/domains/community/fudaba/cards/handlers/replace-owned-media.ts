import { NAMECARD_MIDDLE_IMAGE_LIMIT } from '@imsweb/contracts/fudaba/runtime';
import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import {
    fudabaOwnerCardView,
    parseFudabaRevision,
    validFudabaCardId
} from '@/domains/community/fudaba/contracts/card';
import { fudabaRepository, services } from '@/middleware/hono-context';
import type { UploadedFile } from '@/ports/http';
import { randomHex } from '@/utils/crypto/random';
import { messageFromError, statusFromError } from '@/utils/http/error-response';
import { convertUserImageToWebp } from '@/utils/media/user-image';
import { parseMediaRotations } from '@/domains/community/fudaba/cards/request';
import { storeCardPage } from '@/domains/community/fudaba/cards/artwork-store';
import { parseCardPageObjectKey } from '@/utils/storage/business-object-keys';
import type { FudabaCardPageWrite } from '@/ports/repositories';
import {
    deleteObjectWithCompensation,
    deleteOwnedObjectWithCompensation
} from '@/utils/storage/delete-object';
import { cardPageObjectKeys } from '@/domains/community/fudaba/cards/card-media-resolver';
import { ownerCardArtwork } from '@/domains/community/fudaba/cards/artwork-view';

const MAX_CARD_IMAGE_BYTES = 8 * 1024 * 1024;
// Twenty 8 MiB originals would be a 160 MiB body; the editor downscales and the
// widened cap leaves room for multipart overhead.
const MAX_MEDIA_TOTAL_BYTES = 56 * 1024 * 1024;
const MAX_MEDIA_SLOTS = 2 + NAMECARD_MIDDLE_IMAGE_LIMIT;

function uploadedFiles(
    value: UploadedFile | UploadedFile[] | undefined
): UploadedFile[] {
    if (!value) return [];
    return Array.isArray(value) ? value : [value];
}

/**
 * The card artwork is one ordered list of slots: slot 0 is the front, the last
 * slot is the back, and everything in between is a middle page. The owner edits
 * a local copy of that list and submits it once, so a single request can replace
 * one image, reorder the set and move a page across roles (a middle page
 * becoming the back, say) without any intermediate state on the server.
 *
 * `order` never exposes object keys: `@n` is the n-th uploaded file in this
 * request and `#i` is the i-th slot the card currently has, in the same order
 * the editor got from the API. Keeping a page therefore costs no re-upload.
 */
function resolveOrder(
    order: string,
    fileCount: number,
    existing: readonly string[]
): string[] {
    let parsed: unknown;
    try {
        parsed = JSON.parse(order);
    } catch {
        throw Object.assign(new Error('名片图片顺序格式无效'), { status: 400 });
    }
    if (!Array.isArray(parsed) || parsed.length === 0) {
        throw Object.assign(new Error('名片至少需要一张图片'), { status: 400 });
    }
    const seenUpload = new Set<number>();
    const seenExisting = new Set<string>();
    const slots: string[] = [];
    for (const item of parsed) {
        if (typeof item !== 'string') {
            throw Object.assign(new Error('名片图片顺序格式无效'), { status: 400 });
        }
        const upload = /^@(\d{1,2})$/.exec(item);
        if (upload) {
            const index = Number(upload[1]);
            if (index >= fileCount || seenUpload.has(index)) {
                throw Object.assign(new Error('名片图片顺序引用了不存在的上传'), {
                    status: 400
                });
            }
            seenUpload.add(index);
            slots.push(`@${index}`);
            continue;
        }
        const kept = /^#(\d{1,2})$/.exec(item);
        if (!kept) {
            throw Object.assign(new Error('名片图片顺序格式无效'), { status: 400 });
        }
        const key = existing[Number(kept[1])];
        if (!key) {
            throw Object.assign(new Error('名片图片顺序引用了不存在的历史图片'), {
                status: 400
            });
        }
        if (seenExisting.has(key)) {
            throw Object.assign(new Error('同一张历史图片不能重复使用'), {
                status: 400
            });
        }
        seenExisting.add(key);
        slots.push(key);
    }
    if (seenUpload.size !== fileCount) {
        throw Object.assign(new Error('有上传的图片未出现在顺序中'), { status: 400 });
    }
    if (slots.length > MAX_MEDIA_SLOTS) {
        throw Object.assign(
            new Error(`名片最多 ${MAX_MEDIA_SLOTS} 张图片`),
            { status: 400 }
        );
    }
    return slots;
}

function exactFields(fields: Record<string, string>, allowed: readonly string[]): void {
    const expected = new Set(allowed);
    if (Object.keys(fields).some((key) => !expected.has(key))) {
        throw Object.assign(new Error('上传包含未知字段'), { status: 400 });
    }
}

export async function handleReplaceFudabaOwnedMedia(
    c: Context<AppEnvironment>
): Promise<Response> {
    const cardId = c.req.param('cardId') || '';
    if (!validFudabaCardId(cardId)) {
        return c.json({ success: false, code: 'FUDABA_CARD_NOT_FOUND' }, 404);
    }
    const runtime = services(c);
    if (!runtime.uploads || !runtime.images || !runtime.storage) {
        throw new Error('Upload services unavailable');
    }
    const accountId = c.get('platformUser')!.id;
    const createdKeys: string[] = [];
    let committed = false;
    try {
        const upload = await runtime.uploads.parse(c.req.raw, {
            maxBytes: MAX_MEDIA_TOTAL_BYTES,
            fileFields: ['images'],
            maxFiles: MAX_MEDIA_SLOTS,
            // expectedRevision + order + rotations，外加一个哨兵：busboy 在
            // 触到上限时就会丢弃后续字段，字段顺序不能影响结果。
            maxFields: 4,
            maxParts: MAX_MEDIA_SLOTS + 2
        });

        exactFields(upload.fields, ['expectedRevision', 'order', 'rotations']);
        const rotations = parseMediaRotations(upload.fields.rotations);
        const expectedRevision = parseFudabaRevision(upload.fields.expectedRevision);
        const files = uploadedFiles(upload.files.images);
        if (files.length > MAX_MEDIA_SLOTS) {
            throw Object.assign(
                new Error(`名片最多 ${MAX_MEDIA_SLOTS} 张图片`),
                { status: 400 }
            );
        }
        const repository = fudabaRepository(c);
        const current = await repository.findCardForOwner(cardId, accountId);
        if (!current) {
            return c.json({ success: false, code: 'FUDABA_CARD_NOT_FOUND' }, 404);
        }
        if (current.revision !== expectedRevision) {
            return c.json({
                success: false,
                code: 'FUDABA_CARD_CONFLICT',
                revision: current.revision
            }, 409);
        }
        const pages = await repository.listCardPages(cardId);
        /*
          属主编辑的是完整的一套页面：有暂存版本时是完整的待审快照（未改动的页
          仍指向线上对象），否则就是线上那套。
        */
        const surface =
            pages.pending.length > 0
                ? cardPageObjectKeys(cardId, 'pending', pages.pending)
                : cardPageObjectKeys(cardId, 'live', pages.live);
        const order = resolveOrder(
            upload.fields.order ??
                JSON.stringify(files.map((_file, index) => `@${index}`)),
            files.length,
            surface
        );
        const uploadedKeys: string[] = [];
        const uploadedBodies: Uint8Array[] = [];
        const uploadedPages: FudabaCardPageWrite[] = [];
        const queue = current.publication_status === 'published' ? 'pending' : 'live';
        for (const [index, file] of files.entries()) {
            const converted = await convertUserImageToWebp(
                file,
                runtime.images,
                MAX_CARD_IMAGE_BYTES
            );
            uploadedBodies.push(converted.body);
            const stored = await storeCardPage(runtime, {
                cardId,
                queue,
                pageId: `page-${crypto.randomUUID()}`,
                body: converted.body,
                width: converted.width,
                height: converted.height,
                accountId
            });
            uploadedPages.push({
                pageId: stored.pageId,
                objectVersion: stored.version,
                width: stored.width,
                height: stored.height
            });
            createdKeys.push(stored.key);
            uploadedKeys.push(stored.key);
        }
        const slots = order.map((item) =>
            item.startsWith('@') ? uploadedKeys[Number(item.slice(1))]! : item
        );
        const rotationOnly =
            files.length === 0 &&
            (rotations.front !== 0 || rotations.back !== 0) &&
            slots.length === surface.length &&
            slots.every((key, index) => key === surface[index]);
        /*
          旋转与换图是同一次保存：在这里把最终落到正面/背面的对象转好，revision
          只加一次。旧的独立旋转接口会为每次 90° 各加一版，把审核窗口的版本栅栏
          顶掉。
        */
        if ((rotations.front || rotations.back) && !runtime.images.rotate) {
            throw new Error('Image rotation is unavailable');
        }
        const rotateSlot = async (
            key: string,
            turns: number,
            queue: 'live' | 'pending'
        ): Promise<string> => {
            const turn = ((turns % 4) + 4) % 4;
            if (turn === 0) return key;
            const object = await runtime.storage!.get(key);
            if (!object) {
                throw Object.assign(new Error('名片图片不可用'), { status: 400 });
            }
            const rotated = await runtime.images!.rotate!(object.body, turn * 90);
            if (!runtime.images!.validate) {
                throw new Error('Image validation is unavailable');
            }
            const info = await runtime.images!.validate(rotated, 'image/webp');
            // 旧布局的槽位在第一次旋转时顺带换成统一布局，身份取稳定槽位。
            const pageId =
                parseCardPageObjectKey(key)?.pageId ?? `page-${crypto.randomUUID()}`;
            const stored = await storeCardPage(runtime, {
                cardId,
                queue,
                pageId,
                body: rotated,
                width: info.width,
                height: info.height,
                accountId
            });
            createdKeys.push(stored.key);
            rotatedPages.push({
                pageId: stored.pageId,
                objectVersion: stored.version,
                width: stored.width,
                height: stored.height
            });
            return stored.key;
        };
        // 已发布的卡有了待审页面行，这次改动就落在待审那一套上。
        const staged =
            current.publication_status === 'published' && pages.pending.length > 0;
        const rotatedPages: FudabaCardPageWrite[] = [];
        if (rotationOnly) {
            /*
              只转不换：页序与页数都没变，按「页序调整」同档直接落库，不进复审。
              卡上有暂存图片时改待审那一套（仍是同一个待审版本），否则改线上。
            */
            const rotated = [...slots];
            rotated[0] = await rotateSlot(
                rotated[0]!,
                rotations.front,
                staged ? 'pending' : 'live'
            );
            if (rotated.length > 1) {
                rotated[rotated.length - 1] = await rotateSlot(
                    rotated[rotated.length - 1]!,
                    rotations.back,
                    staged ? 'pending' : 'live'
                );
            }
            for (let index = 0; index < Math.max(0, rotated.length - 2); index += 1) {
                const turns = rotations.middles[index] ?? 0;
                if (turns === 0) continue;
                rotated[index + 1] = await rotateSlot(
                    rotated[index + 1]!,
                    turns,
                    staged ? 'pending' : 'live'
                );
            }
            const result = await repository.rotateCardMediaForOwner({
                cardId,
                ownerAccountId: accountId,
                frontObjectKey: rotated[0]!,
                backObjectKey: rotated.length > 1 ? rotated[rotated.length - 1]! : null,
                middleObjectKeys: rotated.slice(1, Math.max(1, rotated.length - 1)),
                pages: rotatedPages,
                staged,
                expectedRevision,
                updatedAt: new Date().toISOString()
            });
            if (result.status !== 'saved') {
                for (const key of createdKeys) {
                    await deleteObjectWithCompensation(runtime, key).catch(
                        () => undefined
                    );
                }
                return result.status === 'conflict'
                    ? c.json({
                          success: false,
                          code: 'FUDABA_CARD_CONFLICT',
                          revision: result.revision
                      }, 409)
                    : c.json({ success: false, code: 'FUDABA_CARD_NOT_FOUND' }, 404);
            }
            committed = true;
            // 线上图必须可公开读取；待审那套等审核通过时统一发布。
            if (!staged && runtime.storage.publish) {
                await Promise.all(
                    createdKeys.map((key) => runtime.storage!.publish!(key))
                ).catch((error) => {
                    console.error('Failed to publish rotated card media', error);
                });
            }
            /*
              暂存版本的页面行里，未改动的页仍指向线上对象，所以保留集要同时收下
              线上与待审两套页面：只按这次旋转出来的 key 删会删掉线上图。
            */
            const kept = new Set<string>([
                ...cardPageObjectKeys(result.card.id, 'live', result.card.pages),
                ...cardPageObjectKeys(
                    result.card.id,
                    'pending',
                    result.card.pending_pages
                ),
            ]);
            for (const previous of result.previousObjectKeys ?? []) {
                if (rotated.includes(previous) || kept.has(previous)) continue;
                await deleteObjectWithCompensation(runtime, previous).catch(
                    () => undefined
                );
            }
            const artwork = ownerCardArtwork(result.card, {
                live: result.card.pages,
                pending: result.card.pending_pages ?? []
            });
            return c.json({
                success: true,
                card: fudabaOwnerCardView(
                    result.card,
                    artwork.live,
                    artwork.pending ?? undefined
                )
            });
        }
        const replaceQueue =
            current.publication_status === 'published' ? 'pending' : 'live';
        if (slots.length > 0) {
            slots[0] = await rotateSlot(slots[0]!, rotations.front, replaceQueue);
        }
        if (slots.length > 1) {
            slots[slots.length - 1] = await rotateSlot(
                slots[slots.length - 1]!,
                rotations.back,
                replaceQueue
            );
        }
        // 中间页按页序携带圈数；位置 1 起的槽位与 middles 一一对应。
        const middleCount = Math.max(0, slots.length - 2);
        for (let index = 0; index < middleCount; index += 1) {
            const turns = rotations.middles[index] ?? 0;
            if (turns === 0) continue;
            slots[index + 1] = await rotateSlot(slots[index + 1]!, turns, replaceQueue);
        }
        // The accent belongs to the front artwork, so it is only resampled when
        // the front slot is a new upload; a reorder keeps the existing colour.
        const uploadedAccent =
            order[0]?.startsWith('@') === true
                ? ((await runtime.images.dominantColor?.(
                      uploadedBodies[Number(order[0].slice(1))]!
                  )) ?? null)
                : null;
        const result = await repository.replaceCardMediaForOwner({
            cardId,
            ownerAccountId: accountId,
            frontObjectKey: slots[0]!,
            backObjectKey: slots.length > 1 ? slots[slots.length - 1]! : null,
            middleObjectKeys: slots.slice(1, Math.max(1, slots.length - 1)),
            pages: uploadedPages,
            accent: uploadedAccent,
            expectedRevision: expectedRevision!,
            updatedAt: new Date().toISOString()
        });
        if (result.status !== 'saved') {
            for (const key of createdKeys) {
                await deleteObjectWithCompensation(runtime, key).catch(
                    () => undefined
                );
            }
            return result.status === 'conflict'
                ? c.json({
                    success: false,
                    code: 'FUDABA_CARD_CONFLICT',
                    revision: result.revision
                }, 409)
                : c.json({ success: false, code: 'FUDABA_CARD_NOT_FOUND' }, 404);
        }
        committed = true;
        // 只保留保存后的卡仍然指向的对象：线上与待审两套页面行都要收下，
        // 其余这次请求不再引用的对象才安排删除。
        const kept = new Set<string>([
            ...cardPageObjectKeys(result.card.id, 'live', result.card.pages),
            ...cardPageObjectKeys(
                result.card.id,
                'pending',
                result.card.pending_pages
            ),
        ]);
        for (const previous of result.previousObjectKeys ?? []) {
            if (kept.has(previous)) continue;
            await deleteObjectWithCompensation(runtime, previous).catch((error) => {
                console.error(
                    'Failed to schedule replaced Fudaba card image cleanup',
                    error
                );
            });
        }
        const artwork = ownerCardArtwork(result.card, {
            live: result.card.pages,
            pending: result.card.pending_pages ?? []
        });
        return c.json({
            success: true,
            card: fudabaOwnerCardView(
                result.card,
                artwork.live,
                artwork.pending ?? undefined
            )
        });
    } catch (error) {
        if (!committed) {
            for (const key of createdKeys) {
                await deleteObjectWithCompensation(runtime, key).catch(
                    () => undefined
                );
            }
        }
        const status = statusFromError(error);
        if (status >= 500) {
            console.error('Failed to replace Fudaba card media', error);
        }
        return c.json(
            {
                success: false,
                code: status >= 500 ? 'FUDABA_UPLOAD_FAILED' : 'FUDABA_CARD_INVALID',
                message: status >= 500 ? '名片图片更新失败' : messageFromError(error)
            },
            status as 400 | 413 | 500
        );
    }
}
