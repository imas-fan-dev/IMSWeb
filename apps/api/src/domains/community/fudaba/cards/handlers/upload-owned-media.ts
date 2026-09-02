import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import { fudabaOwnerCardView, parseFudabaRevision, validFudabaCardId } from '@/domains/community/fudaba/contracts/card';
import {
    fudabaRepository,
    services
} from '@/middleware/hono-context';
import type { UploadedFile } from '@/ports/http';
import type {
    FudabaCardMutationResult,
    FudabaCardRecord
} from '@/ports/repositories';
import { randomHex } from '@/utils/crypto/random';
import { messageFromError, statusFromError } from '@/utils/http/error-response';
import { convertUserImageToWebp } from '@/utils/media/user-image';
import { fudabaCardSideVersionObjectKey } from '@/utils/storage/business-object-keys';
import {
    deleteObjectWithCompensation,
    deleteOwnedObjectWithCompensation
} from '@/utils/storage/delete-object';

// Account avatars used to share this route. They now belong to the Platform
// identity domain, at PUT `/api/platform/me/avatar`.
type UploadSide = 'front' | 'back';

const MAX_CARD_IMAGE_BYTES = 8 * 1024 * 1024;

function oneFile(value: UploadedFile | UploadedFile[] | undefined): UploadedFile | null {
    return value && !Array.isArray(value) ? value : null;
}

function uploadSide(value: string): UploadSide | null {
    return ['front', 'back'].includes(value) ? value as UploadSide : null;
}

function exactFields(fields: Record<string, string>, allowed: readonly string[]): void {
    const expected = new Set(allowed);
    if (Object.keys(fields).some((key) => !expected.has(key))) {
        throw Object.assign(new Error('上传包含未知字段'), { status: 400 });
    }
}

async function cleanupOldObject(
    c: Context<AppEnvironment>,
    previousObjectKey: string | null,
    nextObjectKey: string
): Promise<void> {
    if (!previousObjectKey || previousObjectKey === nextObjectKey) return;
    await deleteObjectWithCompensation(services(c), previousObjectKey).catch((error) => {
        console.error('Failed to schedule replaced Fudaba media cleanup', error);
    });
}

export async function handleUploadFudabaOwnedMedia(
    c: Context<AppEnvironment>
): Promise<Response> {
    const side = uploadSide(c.req.param('side') || '');
    if (!side) return c.text('Not Found', 404);
    const runtime = services(c);
    if (!runtime.uploads || !runtime.images || !runtime.storage) {
        throw new Error('Upload services unavailable');
    }
    const accountId = c.get('platformUser')!.id;
    let key = '';
    let ownerToken = '';
    let committed = false;
    let cleanupNewObject = true;
    try {
        const upload = await runtime.uploads.parse(c.req.raw, {
            maxBytes: MAX_CARD_IMAGE_BYTES + (64 * 1024),
            fileFields: ['image'],
            maxFiles: 1,
            maxFields: 2,
            maxParts: 3
        });
        exactFields(upload.fields, ['cardId', 'expectedRevision']);
        const cardId = upload.fields.cardId || '';
        const expectedRevision = parseFudabaRevision(upload.fields.expectedRevision);
        if (!validFudabaCardId(cardId)) {
            return c.json({ success: false, code: 'FUDABA_CARD_NOT_FOUND' }, 404);
        }
        const current = await fudabaRepository(c).findCardForOwner(cardId, accountId);
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
        const previousObjectKey = side === 'front'
            ? current.front_object_key
            : current.back_object_key;
        const file = oneFile(upload.files.image);
        if (!file) {
            throw Object.assign(new Error('必须上传一张图片'), { status: 400 });
        }
        const converted = await convertUserImageToWebp(
            file,
            runtime.images,
            MAX_CARD_IMAGE_BYTES
        );
        key = fudabaCardSideVersionObjectKey(cardId, side, crypto.randomUUID());
        ownerToken = randomHex(32);
        await runtime.storage.put(key, converted.body, {
            contentType: 'image/webp',
            protectedAccess: true,
            ownerToken,
            metadata: {
                kind: 'fudaba-card-image',
                side,
                account: accountId
            }
        });
        const repository = fudabaRepository(c);
        cleanupNewObject = false;
        let result: FudabaCardMutationResult;
        try {
            result = await repository.updateCardMediaForOwner({
                cardId,
                ownerAccountId: accountId,
                side,
                objectKey: key,
                expectedRevision: expectedRevision!,
                updatedAt: new Date().toISOString()
            });
        } catch (error) {
            let recovered: FudabaCardRecord | null | undefined;
            try {
                recovered = await repository.findCardForOwner(cardId, accountId);
            } catch (recoveryError) {
                console.error(
                    'Unable to reconcile an uncertain Fudaba media update',
                    recoveryError
                );
            }
            const recoveredObjectKey = side === 'front'
                ? recovered?.front_object_key
                : recovered?.back_object_key;
            if (recovered && recoveredObjectKey === key) {
                committed = true;
                await cleanupOldObject(c, previousObjectKey, key);
                return c.json({
                    success: true,
                    card: fudabaOwnerCardView(recovered)
                });
            }
            throw error;
        }
        if (result.status !== 'saved') {
            cleanupNewObject = true;
            await deleteOwnedObjectWithCompensation(runtime, key, ownerToken);
            key = '';
            return result.status === 'conflict'
                ? c.json({
                    success: false,
                    code: 'FUDABA_CARD_CONFLICT',
                    revision: result.revision
                }, 409)
                : c.json({ success: false, code: 'FUDABA_CARD_NOT_FOUND' }, 404);
        }
        committed = true;
        cleanupNewObject = false;
        await cleanupOldObject(c, result.previousObjectKey, key);
        return c.json({ success: true, card: fudabaOwnerCardView(result.card) });
    } catch (error) {
        if (key && !committed && cleanupNewObject) {
            await deleteOwnedObjectWithCompensation(runtime, key, ownerToken)
                .catch(() => undefined);
        }
        const status = statusFromError(error);
        if (status >= 500) console.error('Failed to upload Fudaba media', error);
        return c.json({
            success: false,
            code: status >= 500 ? 'FUDABA_UPLOAD_FAILED' : 'FUDABA_UPLOAD_INVALID',
            message: status >= 500 ? '图片上传失败' : messageFromError(error)
        }, status as 400 | 413 | 500);
    }
}
