import { WORK_SLUGS } from "./pages/works/work-slugs.ts"

export type FrontendTarget = "web" | "app"
export type RouteLayout = "public" | "standalone" | "admin"
export type RouteDelivery = "prerender" | "spa" | "none"

export interface RouteDescriptor {
  readonly file: string
  readonly layout: RouteLayout
  readonly targets: readonly FrontendTarget[]
  readonly delivery: RouteDelivery
  readonly id?: string
  readonly index?: true
  readonly path?: string
  readonly prerender?: readonly string[]
}

export interface SpaFallbackPattern {
  readonly id: string
  readonly match: "exact" | "prefix"
  readonly path: string
  readonly segments: readonly string[]
  readonly segmentCount?: number
}

const SHARED_TARGETS = Object.freeze(["web", "app"] as const)
const WEB_TARGET = Object.freeze(["web"] as const)
const APP_TARGET = Object.freeze(["app"] as const)

function route(
  path: string | undefined,
  file: string,
  layout: RouteLayout,
  targets: readonly FrontendTarget[],
  delivery: RouteDelivery,
  options: { id?: string; prerender?: readonly string[] } = {}
): RouteDescriptor {
  return Object.freeze({
    ...(path === undefined ? { index: true as const } : { path }),
    file,
    layout,
    targets,
    delivery,
    ...options,
    ...(options.prerender
      ? { prerender: Object.freeze([...options.prerender]) }
      : {}),
  })
}

export const routeDescriptors: readonly RouteDescriptor[] = Object.freeze([
  route(
    undefined,
    "pages/home/index.tsx",
    "public",
    SHARED_TARGETS,
    "prerender",
    {
      prerender: ["/"],
    }
  ),
  route(
    "about",
    "pages/about/index.tsx",
    "public",
    SHARED_TARGETS,
    "prerender",
    {
      prerender: ["/about"],
    }
  ),
  route(
    "events",
    "pages/events/index.tsx",
    "public",
    SHARED_TARGETS,
    "prerender",
    {
      prerender: ["/events"],
    }
  ),
  route(
    "events/:eventId",
    "pages/events/event-detail-page.tsx",
    "public",
    SHARED_TARGETS,
    "spa"
  ),
  route(
    "recommendations",
    "pages/recommendations/index.tsx",
    "public",
    SHARED_TARGETS,
    "prerender",
    {
      prerender: ["/recommendations"],
    }
  ),
  route("live", "pages/live/index.tsx", "public", SHARED_TARGETS, "prerender", {
    prerender: ["/live"],
  }),
  route(
    "community",
    "pages/community/index.tsx",
    "public",
    SHARED_TARGETS,
    "prerender",
    {
      prerender: ["/community"],
    }
  ),
  route(
    "account/login",
    "pages/account/login/account-login-page.tsx",
    "public",
    SHARED_TARGETS,
    "prerender",
    {
      prerender: ["/account/login"],
    }
  ),
  route(
    "account/register",
    "pages/account/register/account-register-page.tsx",
    "public",
    SHARED_TARGETS,
    "prerender",
    {
      prerender: ["/account/register"],
    }
  ),
  route(
    "account/password-reset",
    "pages/account/reset/account-password-reset-page.tsx",
    "public",
    SHARED_TARGETS,
    "prerender",
    {
      prerender: ["/account/password-reset"],
    }
  ),
  route(
    "account/security",
    "pages/account/security/account-security-page.tsx",
    "public",
    SHARED_TARGETS,
    "prerender",
    {
      prerender: ["/account/security"],
    }
  ),
  route(
    "community/exchange",
    "pages/community/exchange/community-exchange-page.tsx",
    "public",
    SHARED_TARGETS,
    "prerender",
    {
      prerender: ["/community/exchange"],
    }
  ),
  route(
    "community/exchange/me",
    "pages/community/exchange/me/community-exchange-me-page.tsx",
    "public",
    SHARED_TARGETS,
    "spa"
  ),
  route(
    "community/exchange/offices/:officeSlug",
    "pages/community/exchange/community-office-page.tsx",
    "public",
    SHARED_TARGETS,
    "spa"
  ),
  route(
    "community/cards",
    "pages/community/community-cards-page.tsx",
    "public",
    SHARED_TARGETS,
    "prerender",
    {
      prerender: ["/community/cards"],
    }
  ),
  route(
    "community/cards/submissions/:id",
    "pages/community/namecard-submission-page.tsx",
    "public",
    SHARED_TARGETS,
    "none"
  ),
  route(
    "producer-map",
    "pages/producer-map/index.tsx",
    "public",
    SHARED_TARGETS,
    "prerender",
    {
      prerender: ["/producer-map"],
    }
  ),
  route(
    "tier-list",
    "pages/tier-list/index.tsx",
    "public",
    SHARED_TARGETS,
    "prerender",
    {
      prerender: ["/tier-list"],
    }
  ),
  route(
    "works",
    "pages/works/index.tsx",
    "public",
    SHARED_TARGETS,
    "prerender",
    {
      prerender: ["/works"],
    }
  ),
  route(
    "works/:workSlug",
    "pages/works/work-detail-page.tsx",
    "public",
    SHARED_TARGETS,
    "prerender",
    {
      prerender: WORK_SLUGS.map((slug) => `/works/${slug}`),
    }
  ),
  route(
    "wiki",
    "pages/wiki/modern/index.tsx",
    "public",
    SHARED_TARGETS,
    "prerender",
    {
      id: "pages/wiki/modern/wiki-index-default",
      prerender: ["/wiki"],
    }
  ),
  route(
    "wiki/modern",
    "pages/wiki/modern/index.tsx",
    "public",
    SHARED_TARGETS,
    "prerender",
    {
      prerender: ["/wiki/modern"],
    }
  ),
  route(
    "story",
    "pages/wiki/modern/story-page.tsx",
    "public",
    SHARED_TARGETS,
    "prerender",
    {
      id: "pages/wiki/modern/story-default",
      prerender: ["/story"],
    }
  ),
  route(
    "story/modern",
    "pages/wiki/modern/story-page.tsx",
    "public",
    SHARED_TARGETS,
    "prerender",
    {
      prerender: ["/story/modern"],
    }
  ),
  route(
    "information/:contentId",
    "pages/information/information-content-page.tsx",
    "public",
    SHARED_TARGETS,
    "spa"
  ),
  route(
    "chronicle",
    "pages/chronicle/index.tsx",
    "public",
    SHARED_TARGETS,
    "prerender",
    {
      prerender: ["/chronicle"],
    }
  ),
  route(
    "chronicle/:activityId",
    "pages/chronicle/activity-page.tsx",
    "public",
    SHARED_TARGETS,
    "spa"
  ),
  route(
    "packages/:siteSlug",
    "pages/sites/site-detail-page.tsx",
    "public",
    SHARED_TARGETS,
    "none"
  ),
  route("apps", "pages/apps/index.tsx", "public", APP_TARGET, "none"),
  route(
    "account/me",
    "pages/account/me/account-me-page.tsx",
    "public",
    APP_TARGET,
    "none"
  ),
  route(
    "account/me/:section",
    "pages/account/me/account-me-section-page.tsx",
    "public",
    APP_TARGET,
    "none"
  ),
  route(
    "wiki/classic",
    "pages/wiki/classic/index.tsx",
    "standalone",
    WEB_TARGET,
    "prerender",
    {
      prerender: ["/wiki/classic"],
    }
  ),
  route(
    "story/classic",
    "pages/wiki/classic/classic-story-page.tsx",
    "standalone",
    WEB_TARGET,
    "prerender",
    {
      prerender: ["/story/classic"],
    }
  ),
  route(
    "admin/login",
    "pages/admin/login/index.tsx",
    "standalone",
    WEB_TARGET,
    "spa"
  ),
  route(undefined, "pages/admin/index.tsx", "admin", WEB_TARGET, "spa"),
  route("events", "pages/admin/events/index.tsx", "admin", WEB_TARGET, "spa"),
  route(
    "events/:eventId",
    "pages/admin/events/editor-page.tsx",
    "admin",
    WEB_TARGET,
    "spa"
  ),
  route("about", "pages/admin/about/index.tsx", "admin", WEB_TARGET, "spa"),
  route(
    "homepage",
    "pages/admin/homepage/index.tsx",
    "admin",
    WEB_TARGET,
    "spa"
  ),
  route(
    "producer-map",
    "pages/admin/producer-map/index.tsx",
    "admin",
    WEB_TARGET,
    "spa"
  ),
  route(
    "community/exchange",
    "pages/admin/community/exchange/admin-community-exchange-page.tsx",
    "admin",
    WEB_TARGET,
    "spa"
  ),
  route(
    "information",
    "pages/admin/information/redirect-page.tsx",
    "admin",
    WEB_TARGET,
    "spa"
  ),
  route(
    "recommendations",
    "pages/admin/recommendations/index.tsx",
    "admin",
    WEB_TARGET,
    "spa"
  ),
  route("cards", "pages/admin/cards/index.tsx", "admin", WEB_TARGET, "spa"),
  route(
    "site-packages",
    "pages/admin/site-packages/index.tsx",
    "admin",
    WEB_TARGET,
    "spa"
  ),
  route(
    "stories/assets",
    "pages/admin/stories/story-cover-assets-page.tsx",
    "admin",
    WEB_TARGET,
    "spa"
  ),
  route("stories", "pages/admin/stories/index.tsx", "admin", WEB_TARGET, "spa"),
  route(
    "chronicle",
    "pages/admin/chronicle/index.tsx",
    "admin",
    WEB_TARGET,
    "spa"
  ),
  route(
    "chronicle/:entryId",
    "pages/admin/chronicle/editor-page.tsx",
    "admin",
    WEB_TARGET,
    "spa"
  ),
  route(
    "accounts",
    "pages/admin/accounts/index.tsx",
    "admin",
    WEB_TARGET,
    "spa"
  ),
  route(
    "platform/oauth",
    "pages/admin/platform-oauth/index.tsx",
    "admin",
    WEB_TARGET,
    "spa"
  ),
  route("system", "pages/admin/system/index.tsx", "admin", WEB_TARGET, "spa"),
  route("*", "pages/admin/not-found/index.tsx", "admin", WEB_TARGET, "spa"),
])

export function routeDescriptorsForTarget(target: FrontendTarget) {
  return routeDescriptors.filter((descriptor) =>
    descriptor.targets.some((candidate) => candidate === target)
  )
}

export function prerenderRoutesForTarget(target: FrontendTarget) {
  return routeDescriptorsForTarget(target).flatMap(
    (descriptor) => descriptor.prerender ?? []
  )
}

export function spaFallbackPatternsForTarget(
  target: FrontendTarget
): readonly SpaFallbackPattern[] {
  const descriptors = routeDescriptorsForTarget(target)
  const hasAdminRoutes = descriptors.some(
    (descriptor) =>
      descriptor.layout === "admin" && descriptor.delivery === "spa"
  )
  const patterns: SpaFallbackPattern[] = hasAdminRoutes
    ? [
        Object.freeze({
          id: "admin",
          match: "prefix",
          path: "/admin",
          segments: Object.freeze(["admin"]),
        }),
      ]
    : []

  for (const descriptor of descriptors) {
    if (
      descriptor.delivery !== "spa" ||
      descriptor.layout === "admin" ||
      !descriptor.path
    ) {
      continue
    }

    const routeSegments = descriptor.path.split("/")
    if (hasAdminRoutes && routeSegments[0] === "admin") continue

    const parameterIndex = routeSegments.findIndex((segment) =>
      segment.startsWith(":")
    )
    if (
      parameterIndex !== -1 &&
      routeSegments
        .slice(parameterIndex)
        .some((segment) => !segment.startsWith(":"))
    ) {
      throw new Error(
        `SPA route ${descriptor.path} has static segments after a parameter`
      )
    }

    const segments = Object.freeze(
      parameterIndex === -1
        ? routeSegments
        : routeSegments.slice(0, parameterIndex)
    )
    patterns.push(
      Object.freeze({
        id: descriptor.path,
        match: parameterIndex === -1 ? "exact" : "prefix",
        path: `/${segments.join("/")}`,
        segments,
        ...(parameterIndex === -1
          ? {}
          : { segmentCount: routeSegments.length }),
      })
    )
  }

  return Object.freeze(patterns)
}
