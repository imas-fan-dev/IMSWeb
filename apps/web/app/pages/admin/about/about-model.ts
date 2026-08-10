import type { AboutPageContent } from "~/lib/api"

export function createAboutPageDraft(): AboutPageContent {
  return {
    version: 1,
    siteName: "",
    siteNameEn: "",
    tagline: "",
    heroImageUrl: null,
    heroImageAlt: "",
    heroImageScale: 100,
    heroImageOffsetX: 0,
    heroImageOffsetY: 0,
    accentColorStart: "#000000",
    accentColorEnd: "#000000",
    welcome: "",
    manifesto: [],
    sinceYear: new Date().getFullYear(),
    overviewTitle: "",
    overview: [],
    groups: [],
    updatedAt: null,
  }
}
