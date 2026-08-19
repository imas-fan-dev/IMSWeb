import type {
    AdminAccountRepository,
    AuthRepository,
    AuditRepository,
    EventRepository,
    EditorialRepository,
    HomepageLinkRepository,
    NamecardRepository,
    NewsRepository,
    ReactionRepository,
    SitePackageRepository
} from '@/ports/repositories-core';
import type { StoryRepository } from '@/ports/repositories-wiki';

export interface RepositoryServices {
    auth: AuthRepository;
    adminAccounts: AdminAccountRepository;
    audit: AuditRepository;
    news: NewsRepository;
    events: EventRepository;
    editorial: EditorialRepository;
    namecards: NamecardRepository;
    reactions: ReactionRepository;
    homepageLinks: HomepageLinkRepository;
    sitePackages: SitePackageRepository;
    story: StoryRepository;
}

export * from '@/ports/repositories-core';
export * from '@/ports/repositories-wiki';
