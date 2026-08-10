import type {
    HomepageLinkAccent,
    HomepageLinkIcon
} from '@/domains/homepage-links/data';
import type {
    HomepageLinkRecord,
    HomepageLinkSection
} from '@/ports/repositories';

export interface HomepageLinkResponse {
    id: string;
    section: HomepageLinkSection;
    title: string;
    description: string;
    href: string;
    icon: HomepageLinkIcon;
    accent: HomepageLinkAccent;
    displayOrder: number;
}

export interface HomepageLinksResponse {
    sections: {
        navigation: HomepageLinkResponse[];
        friend: HomepageLinkResponse[];
        support: HomepageLinkResponse[];
    };
}

export interface HomepageLinkUpsertResponse {
    success: true;
    link: HomepageLinkResponse;
}

export interface HomepageLinkMutationResponse {
    success: true;
}

export interface HomepageLinkErrorResponse {
    error: string;
}

export function toHomepageLinkResponse(record: HomepageLinkRecord): HomepageLinkResponse {
    return {
        id: record.id,
        section: record.section,
        title: record.title,
        description: record.description,
        href: record.href,
        icon: record.icon as HomepageLinkIcon,
        accent: record.accent as HomepageLinkAccent,
        displayOrder: record.display_order
    };
}
