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
import {
    deleteObjectWithCompensation,
    deleteOwnedObjectWithCompensation
} from '@/utils/storage/delete-object';
import { fudabaCardMiddleVersionObjectKey } from '@/utils/storage/business-object-keys';

const MAX_CARD_IMAGE_BYTES = 8 * 1024 * 1024;
// Eighteen 8 MiB originals would be a 144 MiB body; the editor downscales and
// the widened cap leaves room for multipart overhead.
const MAX_MIDDLE_TOTAL_BYTES = 48 * 1024 * 1024;

function middleFiles(
    value: UploadedFile | UploadedFile[] | undefined
): UploadedFile[] {
    if (!value) return [];
    return Array.isArray(value) ? value : [value];
}

/**
 * `order` describes the final page sequence without exposing object keys:
 * `@n` is the n-th uploaded file, `#i` is the i-th page the card already has.
 * Keeping a page therefore costs no re-upload.
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
        throw Object.assign(new Error('中间页顺序格式无效'), { status: 400 });
    }
    if (!Array.isArray(parsed)) {
        throw Object.assign(new Error('中间页顺序格式无效'), { status: 400 });
    }
    const seenUpload = new Set<number>();
    const keys: string[] = [];
    for (const item of parsed) {
        if (typeof item !== 'string') {
            throw Object.assign(new Error('中间页顺序格式无效'), { status: 400 });
        }
        const upload = /^@(\d{1,2})$/.exec(item);
        if (upload) {
            const index = Number(upload[1]);
            if (index >= fileCount || seenUpload.has(index)) {
                throw Object.assign(new Error('中间页顺序引用了不存在的上传'), { status: 400 });
            }
            seenUpload.add(index);
            keys.push(`@${index}`);
            continue;
        }
        const kept = /^#(\d{1,2})$/.exec(item);
        if (!kept) {
            throw Object.assign(new Error('中间页顺序格式无效'), { status: 400 });
        }
        const key = existing[Number(kept[1])];
        if (!key) {
            throw Object.assign(new Error('中间页顺序引用了不存在的历史页'), { status: 400 });
        }
        keys.push(key);
    }
    if (seenUpload.size !== fileCount) {
        throw Object.assign(new Error('有上传的中间页未出现在顺序中'), { status: 400 });
    }
    if (keys.length > NAMECARD_MIDDLE_IMAGE_LIMIT) {
        throw Object.assign(
            new Error(`中间页最多 ${NAMECARD_MIDDLE_IMAGE_LIMIT} 张`),
            { status: 400 }
        );
    }
    return keys;
}

function exactFields(fields: Record<string, string>, allowed: readonly string[]): void {
    const expected = new Set(allowed);
    if (Object.keys(fields).some((key) => !expected.has(key))) {
        throw Object.assign(new Error('上传包含未知字段'), { status: 400 });
    }
}

/**
 * Middle pages are ordered, so they are replaced as a whole: the editor sends
 * the final set in display order and the server swaps it in one revision bump.
 * An empty set is valid and turns a multi-page card back into front/back.
 */
export async function handleReplaceFudabaOwnedMiddleMedia(
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
            maxBytes: MAX_MIDDLE_TOTAL_BYTES,
            fileFields: ['images'],
            maxFiles: NAMECARD_MIDDLE_IMAGE_LIMIT,
            maxFields: 2,
            maxParts: NAMECARD_MIDDLE_IMAGE_LIMIT + 2
        });
        exactFields(upload.fields, ['expectedRevision', 'order']);
        const expectedRevision = parseFudabaRevision(upload.fields.expectedRevision);
        const files = middleFiles(upload.files.images);
        if (files.length > NAMECARD_MIDDLE_IMAGE_LIMIT) {
            throw Object.assign(
                new Error(`中间页最多 ${NAMECARD_MIDDLE_IMAGE_LIMIT} 张`),
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
        // A published card edits the staged pages, so that is the set `#i`
        // refers to; anything else edits its own pages.
        const existing =
            current.publication_status === 'published'
                ? current.pending_middle_object_keys
                : current.middle_object_keys;
        const order = resolveOrder(
            upload.fields.order ?? JSON.stringify(files.map((_file, index) => `@${index}`)),
            files.length,
            existing
        );
        const uploadedKeys: string[] = [];
        for (const [index, file] of files.entries()) {
            const converted = await convertUserImageToWebp(
                file,
                runtime.images,
                MAX_CARD_IMAGE_BYTES
            );
            const key = fudabaCardMiddleVersionObjectKey(
                cardId,
                index + 1,
                crypto.randomUUID()
            );
            const ownerToken = randomHex(32);
            await runtime.storage.put(key, converted.body, {
                contentType: 'image/webp',
                protectedAccess: true,
                ownerToken,
                metadata: {
                    kind: 'fudaba-card-image',
                    side: `middle-${index + 1}`,
                    account: accountId
                }
            });
            created.push({ key, token: ownerToken });
            uploadedKeys.push(key);
        }
        const result = await repository.replaceCardMiddleMediaForOwner({
            cardId,
            ownerAccountId: accountId,
            objectKeys: order.map((item) =>
                item.startsWith('@') ? uploadedKeys[Number(item.slice(1))]! : item
            ),
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
        // Only the set just written is retained: live pages of a published card
        // stay untouched, and the pages it replaced were never public.
        const kept = new Set(
            result.card.publication_status === 'published'
                ? result.card.pending_middle_object_keys
                : result.card.middle_object_keys
        );
        for (const previous of result.previousObjectKeys ?? []) {
            if (kept.has(previous)) continue;
            await deleteObjectWithCompensation(runtime, previous).catch((error) => {
                console.error(
                    'Failed to schedule replaced Fudaba middle page cleanup',
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
        if (status >= 500) console.error('Failed to upload Fudaba middle pages', error);
        return c.json({
            success: false,
            code: status >= 500 ? 'FUDABA_UPLOAD_FAILED' : 'FUDABA_UPLOAD_INVALID',
            message: status >= 500 ? '图片上传失败' : messageFromError(error)
        }, status as 400 | 413 | 500);
    }
}
