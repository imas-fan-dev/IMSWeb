import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import { publicHomepageLink } from '@/domains/homepage-links/data';
import { services } from '@/middleware/hono-context';
import type { HomepageLinkRepository, HomepageLinkSection } from '@/ports/repositories';

export function homepageLinkRepository(c: Context<AppEnvironment>): HomepageLinkRepository {
    const repository = services(c).homepageLinks;
    if (!repository) throw new Error('Homepage link repository unavailable');
    return repository;
}

export async function homepageLinkPayload(repository: HomepageLinkRepository) {
    const records = await repository.listHomepageLinks();
    const sections: Record<HomepageLinkSection, ReturnType<typeof publicHomepageLink>[]> = {
        navigation: [],
        friend: [],
        support: []
    };
    for (const record of records) sections[record.section].push(publicHomepageLink(record));
    return { sections };
}
