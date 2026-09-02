import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import { parsePlatformAvatarRemoval } from '@/domains/identity/platform-profile/profile-input';
import { platformProfileView } from '@/domains/identity/platform-profile/profile-view';
import { platformAccountRepository, services } from '@/middleware/hono-context';
import { messageFromError, statusFromError } from '@/utils/http/error-response';
import { deleteObjectWithCompensation } from '@/utils/storage/delete-object';

export async function handleDeletePlatformAvatar(
    c: Context<AppEnvironment>
): Promise<Response> {
    try {
        const accountId = c.get('platformUser')!.id;
        const body = await c.req.json().catch(() => {
            throw Object.assign(new Error('请求体必须是有效 JSON'), { status: 400 });
        });
        const expectedUpdatedAt = parsePlatformAvatarRemoval(body);
        // Passing a null key clears `avatar_object_key` and `avatar_external_url`
        // together, so an OAuth-provided picture is removed alongside an upload.
        const result = await platformAccountRepository(c).updateProfileAvatarForOwner({
            accountId,
            avatarObjectKey: null,
            expectedUpdatedAt,
            updatedAt: Math.max(Date.now(), expectedUpdatedAt + 1)
        });
        if (result.status === 'unavailable') {
            return c.json({ success: false, code: 'PLATFORM_PROFILE_UNAVAILABLE' }, 409);
        }
        if (result.status === 'conflict') {
            return c.json({
                success: false,
                code: 'PLATFORM_PROFILE_CONFLICT',
                updatedAt: result.updatedAt
            }, 409);
        }
        // The row no longer references the object, so a failed cleanup leaks an
        // unreachable object rather than breaking the profile. Compensation
        // retries it; the request itself has already succeeded.
        if (result.previousAvatarObjectKey) {
            await deleteObjectWithCompensation(
                services(c),
                result.previousAvatarObjectKey
            ).catch((error) => {
                console.error('Failed to schedule removed Platform avatar cleanup', error);
            });
        }
        return c.json({ success: true, profile: platformProfileView(result.profile) });
    } catch (error) {
        const status = statusFromError(error);
        if (status >= 500) console.error('Failed to remove Platform avatar', error);
        return c.json({
            success: false,
            code: status >= 500
                ? 'PLATFORM_AVATAR_REMOVE_FAILED'
                : 'PLATFORM_AVATAR_REMOVE_INVALID',
            message: status >= 500 ? '头像移除失败' : messageFromError(error)
        }, status as 400 | 500);
    }
}
