import type { PlatformProfile } from '@imsweb/contracts/platform';
import type { ObjectStorage } from '@/ports/object-storage';
import type { PlatformProfileRecord } from '@/ports/repositories';
import { requirePublicObjectUrl } from '@/utils/storage/public-object-url';

async function storedAvatarUrl(
    storage: ObjectStorage | undefined,
    key: string
): Promise<string> {
    if (!storage) {
        throw Object.assign(new Error('头像公开读取地址不可用'), { status: 503 });
    }
    // Avatar objects written before direct delivery were private. Promote them
    // on first read so existing profiles use the shared public URL flow.
    return requirePublicObjectUrl(storage, key, { publishIfUnavailable: true });
}

export async function platformProfileView(
    profile: PlatformProfileRecord,
    storage: ObjectStorage | undefined
): Promise<PlatformProfile> {
    return {
        displayName: profile.display_name,
        avatarUrl: profile.avatar_external_url || (profile.avatar_object_key
            ? await storedAvatarUrl(storage, profile.avatar_object_key)
            : null),
        homeCity: profile.home_city,
        bio: profile.bio,
        updatedAt: profile.updated_at
    };
}
