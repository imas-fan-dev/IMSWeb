import { platformApiPath } from '@imsweb/contracts/paths';
import type { PlatformProfile } from '@imsweb/contracts/platform';
import type { PlatformProfileRecord } from '@/ports/repositories';

export function platformProfileView(profile: PlatformProfileRecord): PlatformProfile {
    return {
        displayName: profile.display_name,
        avatarUrl: profile.avatar_external_url || (profile.avatar_object_key
            ? platformApiPath(`/me/avatar?v=${profile.updated_at}`)
            : null),
        homeCity: profile.home_city,
        bio: profile.bio,
        updatedAt: profile.updated_at
    };
}
