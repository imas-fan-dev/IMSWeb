import type { SuccessFlag } from "@imsweb/contracts/common";
import type { HomepageLinkErrorResponse as HomepageLinkContractErrorResponse, HomepageLinkMutation } from "@imsweb/contracts/homepage-links";
import type {
    HomepageLinkAccent,
    HomepageLinkIcon,
} from "@imsweb/contracts/homepage-links";
import type {
    HomepageLink,
    HomepageLinks,
} from "@imsweb/contracts/homepage-links";

export type HomepageLinkResponse = HomepageLink;
export type HomepageLinksResponse = HomepageLinks;

export type HomepageLinkUpsertResponse = HomepageLinkMutation;

export type HomepageLinkMutationResponse = SuccessFlag;

export type HomepageLinkErrorResponse = HomepageLinkContractErrorResponse;

import type { HomepageLinkRecord } from "@/ports/repositories";

export function toHomepageLinkResponse(
    record: HomepageLinkRecord,
): HomepageLinkResponse {
    return {
        id: record.id,
        section: record.section,
        title: record.title,
        description: record.description,
        href: record.href,
        icon: record.icon as HomepageLinkIcon,
        accent: record.accent as HomepageLinkAccent,
        displayOrder: record.display_order,
    };
}
