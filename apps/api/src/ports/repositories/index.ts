import type {
    AdminAccountRepository,
    AuditRepository,
    BackofficeAuthRepository,
} from "@/ports/repositories/admin";
import type { PlatformAccountRepository } from "@/ports/repositories/platform";
import type { FudabaRepository } from "@/ports/repositories/fudaba";
import type {
    NamecardRepository,
    ReactionRepository,
} from "@/ports/repositories/namecards";
import type {
    EventRepository,
    HomepageLinkRepository,
    NewsRepository,
} from "@/ports/repositories/content";
import type { SitePackageRepository } from "@/ports/repositories/site-packages";
import type { StoryRepository } from "@/ports/repositories/wiki";

export interface RepositoryServices {
    backofficeAuth: BackofficeAuthRepository;
    adminAccounts: AdminAccountRepository;
    platformAccounts: PlatformAccountRepository;
    fudaba: FudabaRepository;
    audit: AuditRepository;
    news: NewsRepository;
    events: EventRepository;
    namecards: NamecardRepository;
    reactions: ReactionRepository;
    homepageLinks: HomepageLinkRepository;
    sitePackages: SitePackageRepository;
    story: StoryRepository;
}

export * from "@/ports/repositories/admin";
export * from "@/ports/repositories/platform";
export * from "@/ports/repositories/fudaba";
export * from "@/ports/repositories/namecards";
export * from "@/ports/repositories/content";
export * from "@/ports/repositories/site-packages";
export * from "@/ports/repositories/wiki";
