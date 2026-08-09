import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import {
    toHomepageLinkResponse,
    type HomepageLinksResponse
} from '@/domains/homepage-links/response';
import { services } from '@/middleware/hono-context';
import type { HomepageLinkRepository, HomepageLinkSection } from '@/ports/repositories';

export function homepageLinkRepository(c: Context<AppEnvironment>): HomepageLinkRepository {
    const repository = services(c).homepageLinks;
    if (!repository) throw new Error('Homepage link repository unavailable');
    return repository;
}

export async function homepageLinkPayload(
    repository: HomepageLinkRepository
): Promise<HomepageLinksResponse> {
    const records = await repository.listHomepageLinks();
    const sections: Record<HomepageLinkSection, ReturnType<typeof toHomepageLinkResponse>[]> = {
        navigation: [],
        friend: [],
        support: []
    };
    for (const record of records) sections[record.section].push(toHomepageLinkResponse(record));
    return { sections };
}
