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
import type { FudabaCardRecord } from '@/ports/repositories';
import { randomHex } from '@/utils/crypto/random';
import { messageFromError, statusFromError } from '@/utils/http/error-response';
import { convertUserImageToWebp } from '@/utils/media/user-image';
import {
    deleteObjectWithCompensation,
    deleteOwnedObjectWithCompensation
} from '@/utils/storage/delete-object';
import { fudabaCardMediaVersionObjectKey } from '@/utils/storage/business-object-keys';

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

/**
 * The slots the owner edits: the staged set of a published card (falling back to
 * the live one per field while a legacy partial staging exists), otherwise the
 * live set.
 */
function editableSlots(card: FudabaCardRecord): string[] {
    const staged = card.publication_status === 'published';
    const front = staged
        ? (card.pending_front_object_key ?? card.front_object_key)
        : card.front_object_key;
    const back = staged
        ? (card.pending_back_object_key ?? card.back_object_key)
        : card.back_object_key;
    const middles =
        staged && card.pending_middle_object_keys.length > 0
            ? card.pending_middle_object_keys
            : card.middle_object_keys;
    // The back closes the list, so the editor's slot order matches the order the
    // picker shows: front, middle pages, back.
    return [front, ...middles, back].filter(
        (key): key is string => typeof key === 'string' && key.length > 0
    );
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
    const created: Array<{ key: string; token: string }> = [];
    let committed = false;
    try {
        const upload = await runtime.uploads.parse(c.req.raw, {
            maxBytes: MAX_MEDIA_TOTAL_BYTES,
            fileFields: ['images'],
            maxFiles: MAX_MEDIA_SLOTS,
            maxFields: 2,
            maxParts: MAX_MEDIA_SLOTS + 2
        });
        exactFields(upload.fields, ['expectedRevision', 'order']);
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
        const order = resolveOrder(
            upload.fields.order ??
                JSON.stringify(files.map((_file, index) => `@${index}`)),
            files.length,
            editableSlots(current)
        );
        const uploadedKeys: string[] = [];
        const uploadedBodies: Uint8Array[] = [];
        for (const [index, file] of files.entries()) {
            const converted = await convertUserImageToWebp(
                file,
                runtime.images,
                MAX_CARD_IMAGE_BYTES
            );
            uploadedBodies.push(converted.body);
            const key = fudabaCardMediaVersionObjectKey(
                cardId,
                crypto.randomUUID()
            );
            const ownerToken = randomHex(32);
            await runtime.storage.put(key, converted.body, {
                contentType: 'image/webp',
                protectedAccess: true,
                ownerToken,
                metadata: {
                    kind: 'fudaba-card-image',
                    side: `slot-${index}`,
                    account: accountId
                }
            });
            created.push({ key, token: ownerToken });
            uploadedKeys.push(key);
        }
        const slots = order.map((item) =>
            item.startsWith('@') ? uploadedKeys[Number(item.slice(1))]! : item
        );
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
            accent: uploadedAccent,
            expectedRevision: expectedRevision!,
            updatedAt: new Date().toISOString()
        });
        if (result.status !== 'saved') {
            for (const entry of created) {
                await deleteOwnedObjectWithCompensation(
                    runtime,
                    entry.key,
                    entry.token
                ).catch(() => undefined);
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
        // Retain everything the saved card now points at; only the objects this
        // request made irrelevant are deleted. Live artwork of a published card
        // is not part of the edited surface, so it never appears here.
        const kept = new Set<string>([
            result.card.front_object_key,
            result.card.back_object_key,
            ...result.card.middle_object_keys,
            ...(result.card.pending_front_object_key
                ? [result.card.pending_front_object_key]
                : []),
            ...(result.card.pending_back_object_key
                ? [result.card.pending_back_object_key]
                : []),
            ...result.card.pending_middle_object_keys
        ].filter((key): key is string => typeof key === 'string' && key.length > 0));
        for (const previous of result.previousObjectKeys ?? []) {
            if (kept.has(previous)) continue;
            await deleteObjectWithCompensation(runtime, previous).catch((error) => {
                console.error(
                    'Failed to schedule replaced Fudaba card image cleanup',
                    error
                );
            });
        }
        return c.json({ success: true, card: fudabaOwnerCardView(result.card) });
    } catch (error) {
        if (!committed) {
            for (const entry of created) {
                await deleteOwnedObjectWithCompensation(
                    runtime,
                    entry.key,
                    entry.token
                ).catch(() => undefined);
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
