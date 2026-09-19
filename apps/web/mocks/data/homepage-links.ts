import type {
  HomepageLink,
  HomepageLinks,
} from "@imsweb/contracts/homepage-links"

/**
 * Factories for the home page link directory. `app/lib/api/endpoints/
 * homepage-links.ts` parses `GET /api/homepage-links` with
 * `homepageLinksSchema`, whose three sections are always present.
 */
export function makeHomepageLink(
  overrides: Partial<HomepageLink> = {}
): HomepageLink {
  return {
    id: "navigation-events",
    section: "navigation",
    title: "活动中心",
    description: "浏览活动",
    href: "/events",
    icon: "calendar",
    accent: "franchise-765",
    displayOrder: 0,
    ...overrides,
  }
}

export function makeHomepageLinks(
  overrides: Partial<HomepageLinks> = {}
): HomepageLinks {
  return {
    sections: {
      navigation: [makeHomepageLink()],
      friend: [],
      support: [],
    },
    ...overrides,
  }
}
