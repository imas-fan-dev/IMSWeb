import type {
  AboutGroup,
  AboutPageContent,
  AboutPerson,
} from "@imsweb/contracts/about"

export function makeAboutPerson(
  overrides: Partial<AboutPerson> = {}
): AboutPerson {
  return {
    id: "p1",
    name: "甲",
    role: "维护",
    description: "",
    since: "2020",
    profileUrl: "https://github.com/example",
    avatarUrl: "/uploads/about/member-avatars/abc123.jpg_128w",
    ...overrides,
  }
}

export function makeAboutGroup(
  overrides: Partial<AboutGroup> = {}
): AboutGroup {
  return {
    id: "core",
    title: "核心",
    subtitle: "",
    people: [makeAboutPerson()],
    ...overrides,
  }
}

export function makeAboutPageContent(
  overrides: Partial<AboutPageContent> = {}
): AboutPageContent {
  return {
    version: 1,
    siteName: "IMS",
    siteNameEn: "IMS",
    tagline: "",
    // The live API mixes ownership here: /brand ships inside the web bundle
    // while /uploads is API-owned. Both arrive root-relative.
    heroImageUrl: "/brand/about/gakuen-arisa.png",
    heroImageAlt: "",
    heroImageScale: 100,
    heroImageOffsetX: 0,
    heroImageOffsetY: 0,
    accentColorStart: "#f54798",
    accentColorEnd: "#2196f3",
    welcome: "",
    manifesto: [],
    sinceYear: 2020,
    overviewTitle: "",
    overview: [],
    groups: [makeAboutGroup()],
    updatedAt: null,
    ...overrides,
  }
}
