import type {
    // pi-lens-ignore: ts:2724
    PlatformProfileError,
    PlatformProfileMutationResponse
} from '@imsweb/contracts/platform';
import type { AppEnvironment } from '@/app';
import type { ValidatedRequestContext } from '@/middleware/request-validation';
import { platformProfileView } from '@/domains/identity/platform-profile/profile-view';
import { platformAccountRepository } from '@/middleware/hono-context';
import { messageFromError, statusFromError } from '@/utils/http/error-response';

export async function handleUpdatePlatformProfile(
    c: ValidatedRequestContext<AppEnvironment, 'json', {
        bio: string;
        displayName: string;
        expectedUpdatedAt: number;
        homeCity: string | null;
    }>
): Promise<Response> {
    try {
        const accountId = c.get('platformUser')!.id;
        const submission = c.req.valid('json');
        const result = await platformAccountRepository(c).updateProfileTextForOwner({
            accountId,
            ...submission,
            updatedAt: Math.max(Date.now(), submission.expectedUpdatedAt + 1)
        });
        if (result.status === 'unavailable') {
            return c.json({ success: false, code: 'PLATFORM_PROFILE_UNAVAILABLE' }, 409);
        }
        if (result.status === 'conflict') {
            return c.json({
                success: false,
                code: 'PLATFORM_PROFILE_CONFLICT',
                updatedAt: result.updatedAt
            } satisfies PlatformProfileError, 409);
        }
        return c.json({
            success: true,
            profile: platformProfileView(result.profile)
        } satisfies PlatformProfileMutationResponse);
    } catch (error) {
        const status = statusFromError(error);
        if (status >= 500) console.error('Failed to update Platform profile', error);
        return c.json({
            success: false,
            code: status >= 500 ? 'PLATFORM_PROFILE_SAVE_FAILED' : 'PLATFORM_PROFILE_INVALID',
            message: status >= 500 ? '平台资料保存失败' : messageFromError(error)
        }, status as 400 | 500);
    }
}
