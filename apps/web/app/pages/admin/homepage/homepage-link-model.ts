import { isApiError } from "~/lib/api"
import type { HomepageLinkSection, HomepageLinkSubmission } from "~/lib/api"

export const homepageSectionOrder: HomepageLinkSection[] = [
  "navigation",
  "friend",
  "support",
]

export const homepageSectionLabels: Record<HomepageLinkSection, string> = {
  navigation: "站点导航",
  friend: "友情链接",
  support: "网站支持",
}

export function emptyHomepageLinkSubmission(
  section: HomepageLinkSection
): HomepageLinkSubmission {
  return {
    section,
    title: "",
    description: "",
    href: "",
    icon: section === "navigation" ? "calendar" : "external-link",
    accent: section === "support" ? "info" : "franchise-765",
  }
}

export function homepageLinkErrorMessage(error: unknown) {
  return isApiError(error) ? error.message : "请求失败，请稍后重试"
}
