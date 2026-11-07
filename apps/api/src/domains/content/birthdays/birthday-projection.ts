import type { CatalogBirthdays } from '@imsweb/contracts/catalog';
import type { BirthdayProfileRecord } from '@/ports/repositories/catalog';

export function birthdayProjection(
    profiles: BirthdayProfileRecord[],
): CatalogBirthdays {
    const selected = new Map<number, BirthdayProfileRecord>();
    for (const profile of profiles) {
        const month = profile.birthMonth;
        const day = profile.birthDay;
        const days =
            month === 2 ? 29 : [4, 6, 9, 11].includes(month ?? 0) ? 30 : 31;
        if (
            profile.category !== 'idol' ||
            profile.isFallback ||
            month === null ||
            day === null ||
            month < 1 ||
            month > 12 ||
            day < 1 ||
            day > days
        )
            continue;
        const current = selected.get(profile.characterId);
        if (!current || profile.profileId === profile.defaultProfileId)
            selected.set(profile.characterId, profile);
    }
    return {
        success: true,
        items: profiles
            .filter((p) => selected.get(p.characterId) === p)
            .map((p) => ({
                characterId: p.characterId,
                profileId: p.profileId,
                projectId: p.projectId,
                name: p.name,
                agency: p.agency,
                color:
                    p.color && /^#[0-9a-f]{6}$/i.test(p.color)
                        ? p.color
                        : '#e684a8',
                month: p.birthMonth!,
                day: p.birthDay!,
            })),
    };
}
