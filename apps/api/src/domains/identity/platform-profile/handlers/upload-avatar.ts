import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import { parseExpectedProfileTimestamp } from '@/domains/identity/platform-profile/profile-input';
import { platformProfileView } from '@/domains/identity/platform-profile/profile-view';
import { platformAccountRepository, services } from '@/middleware/hono-context';
import type { UploadedFile } from '@/ports/http';
import type {
    PlatformAccountWithProfile,
    PlatformProfileSaveResult
} from '@/ports/repositories';
import { randomHex } from '@/utils/crypto/random';
import { messageFromError, statusFromError } from '@/utils/http/error-response';
import { convertUserImageToWebp } from '@/utils/media/user-image';
import { platformAccountAvatarVersionObjectKey } from '@/utils/storage/business-object-keys';
import {
    deleteObjectWithCompensation,
    deleteOwnedObjectWithCompensation
} from '@/utils/storage/delete-object';

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

function oneFile(value: UploadedFile | UploadedFile[] | undefined): UploadedFile | null {
    return value && !Array.isArray(value) ? value : null;
}

function exactFields(fields: Record<string, string>, allowed: readonly string[]): void {
    const expected = new Set(allowed);
    if (Object.keys(fields).some((key) => !expected.has(key))) {
        throw Object.assign(new Error('上传包含未知字段'), { status: 400 });
    }
}

async function cleanupReplacedAvatar(
    c: Context<AppEnvironment>,
    previousObjectKey: string | null,
    nextObjectKey: string
): Promise<void> {
    if (!previousObjectKey || previousObjectKey === nextObjectKey) return;
    await deleteObjectWithCompensation(services(c), previousObjectKey).catch((error) => {
        console.error('Failed to schedule replaced Platform avatar cleanup', error);
    });
}

export async function handleUploadPlatformAvatar(
    c: Context<AppEnvironment>
): Promise<Response> {
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
            maxBytes: MAX_AVATAR_BYTES + (64 * 1024),
            fileFields: ['image'],
            maxFiles: 1,
            maxFields: 1,
            maxParts: 2
        });
        exactFields(upload.fields, ['expectedUpdatedAt']);
        const expectedUpdatedAt = parseExpectedProfileTimestamp(
            upload.fields.expectedUpdatedAt
        );
        const identity = c.get('platformAccount')!;
        const previousObjectKey = identity.profile.avatar_object_key;
        if (identity.profile.updated_at !== expectedUpdatedAt) {
            return c.json({
                success: false,
                code: 'PLATFORM_PROFILE_CONFLICT',
                updatedAt: identity.profile.updated_at
            }, 409);
        }
        const file = oneFile(upload.files.image);
        if (!file) {
            throw Object.assign(new Error('必须上传一张图片'), { status: 400 });
        }
        const converted = await convertUserImageToWebp(
            file,
            runtime.images,
            MAX_AVATAR_BYTES
        );
        key = platformAccountAvatarVersionObjectKey(accountId, crypto.randomUUID());
        ownerToken = randomHex(32);
        await runtime.storage.put(key, converted.body, {
            contentType: 'image/webp',
            protectedAccess: true,
            ownerToken,
            metadata: {
                kind: 'platform-avatar',
                side: 'avatar',
                account: accountId
            }
        });
        const repository = platformAccountRepository(c);
        cleanupNewObject = false;
        let result: PlatformProfileSaveResult;
        try {
            result = await repository.updateProfileAvatarForOwner({
                accountId,
                avatarObjectKey: key,
                expectedUpdatedAt,
                updatedAt: Math.max(Date.now(), expectedUpdatedAt + 1)
            });
        } catch (error) {
            // The write may or may not have landed. Re-read the account: when it
            // already points at this key the upload succeeded and the error was
            // only on the way back, so the object must not be compensated away.
            let recovered: PlatformAccountWithProfile | null | undefined;
            try {
                recovered = await repository.findAccountWithProfileById(accountId);
            } catch (recoveryError) {
                console.error(
                    'Unable to reconcile an uncertain Platform avatar update',
                    recoveryError
                );
            }
            if (recovered?.profile.avatar_object_key === key) {
                committed = true;
                await cleanupReplacedAvatar(c, previousObjectKey, key);
                return c.json({
                    success: true,
                    profile: platformProfileView(recovered.profile)
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
                    code: 'PLATFORM_PROFILE_CONFLICT',
                    updatedAt: result.updatedAt
                }, 409)
                : c.json({
                    success: false,
                    code: 'PLATFORM_PROFILE_UNAVAILABLE'
                }, 409);
        }
        committed = true;
        cleanupNewObject = false;
        await cleanupReplacedAvatar(c, result.previousAvatarObjectKey, key);
        return c.json({ success: true, profile: platformProfileView(result.profile) });
    } catch (error) {
        if (key && !committed && cleanupNewObject) {
            await deleteOwnedObjectWithCompensation(runtime, key, ownerToken)
                .catch(() => undefined);
        }
        const status = statusFromError(error);
        if (status >= 500) console.error('Failed to upload Platform avatar', error);
        return c.json({
            success: false,
            code: status >= 500
                ? 'PLATFORM_AVATAR_UPLOAD_FAILED'
                : 'PLATFORM_AVATAR_UPLOAD_INVALID',
            message: status >= 500 ? '头像上传失败' : messageFromError(error)
        }, status as 400 | 413 | 500);
    }
}
