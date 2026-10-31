import { WORK_SLUGS } from "./pages/works/work-slugs.ts"

export type FrontendTarget = "web" | "app"
export type RouteLayout = "public" | "standalone" | "admin"
export type RouteDelivery = "prerender" | "spa" | "none"

export interface AppRouteNavigation {
  readonly tab: "home" | "community" | "map" | "resources" | "account"
  readonly parent?: string
  readonly canonical?: string
  readonly identityQuery?: readonly string[]
  readonly parentQuery?: readonly string[]
  readonly sections?: readonly string[]
  readonly presentation?: "auth" | "error"
  /** Content detail keeps the initiating tab as its owner when opened as a link. */
  readonly derived?: boolean
  readonly private?: boolean
}

export interface RouteDescriptor {
  readonly file: string
  readonly layout: RouteLayout
  readonly targets: readonly FrontendTarget[]
  readonly delivery: RouteDelivery
  readonly id?: string
  readonly index?: true
  readonly path?: string
  readonly prerender?: readonly string[]
  readonly appNavigation?: AppRouteNavigation
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
  options: {
    id?: string
    prerender?: readonly string[]
    appNavigation?: AppRouteNavigation
  } = {}
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
      appNavigation: { tab: "home" },
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
      appNavigation: { tab: "account", parent: "/account/me" },
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
      appNavigation: { tab: "community", parent: "/community" },
    }
  ),
  route(
    "events/:eventId",
    "pages/events/event-detail-page.tsx",
    "public",
    SHARED_TARGETS,
    "spa",
    { appNavigation: { tab: "community", parent: "/events", derived: true } }
  ),
  route(
    "recommendations",
    "pages/recommendations/index.tsx",
    "public",
    SHARED_TARGETS,
    "prerender",
    {
      prerender: ["/recommendations"],
      appNavigation: { tab: "resources", parent: "/apps" },
    }
  ),
  route("live", "pages/live/index.tsx", "public", SHARED_TARGETS, "prerender", {
    prerender: ["/live"],
    appNavigation: { tab: "resources", parent: "/apps" },
  }),
  route(
    "community",
    "pages/community/index.tsx",
    "public",
    SHARED_TARGETS,
    "prerender",
    {
      prerender: ["/community"],
      appNavigation: { tab: "community" },
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
      appNavigation: {
        tab: "account",
        parent: "/account/me",
        presentation: "auth",
      },
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
      appNavigation: {
        tab: "account",
        parent: "/account/me",
        presentation: "auth",
      },
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
      appNavigation: {
        tab: "account",
        parent: "/account/me",
        presentation: "auth",
      },
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
      appNavigation: { tab: "account", parent: "/account/me", private: true },
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
      appNavigation: { tab: "map" },
    }
  ),
  route(
    "community/exchange/offices/:officeSlug",
    "pages/community/exchange/community-office-page.tsx",
    "public",
    SHARED_TARGETS,
    "spa",
    {
      appNavigation: {
        tab: "map",
        parent: "/community/exchange",
        parentQuery: ["city", "series", "open"],
        derived: true,
      },
    }
  ),
  route(
    "community/cards",
    "pages/community/community-cards-page.tsx",
    "public",
    SHARED_TARGETS,
    "prerender",
    {
      prerender: ["/community/cards"],
      appNavigation: { tab: "community", parent: "/community" },
    }
  ),
  route(
    "community/cards/submissions/:id",
    "pages/community/namecard-submission-page.tsx",
    "public",
    SHARED_TARGETS,
    "none",
    {
      appNavigation: {
        tab: "community",
        parent: "/community/cards",
        derived: true,
      },
    }
  ),
  route(
    "producer-map",
    "pages/producer-map/index.tsx",
    "public",
    SHARED_TARGETS,
    "prerender",
    {
      prerender: ["/producer-map"],
      appNavigation: { tab: "community", parent: "/community" },
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
      appNavigation: { tab: "resources", parent: "/apps" },
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
      appNavigation: { tab: "resources", parent: "/apps" },
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
      appNavigation: { tab: "resources", parent: "/works", derived: true },
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
      appNavigation: { tab: "resources", parent: "/apps" },
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
      appNavigation: { tab: "resources", parent: "/apps", canonical: "/wiki" },
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
      appNavigation: {
        tab: "resources",
        parent: "/wiki",
        parentQuery: ["agency"],
        identityQuery: ["agency", "idol"],
        derived: true,
      },
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
      appNavigation: {
        tab: "resources",
        parent: "/wiki",
        canonical: "/story",
        parentQuery: ["agency"],
        identityQuery: ["agency", "idol"],
        derived: true,
      },
    }
  ),
  route(
    "information/:contentId",
    "pages/information/information-content-page.tsx",
    "public",
    SHARED_TARGETS,
    "spa",
    { appNavigation: { tab: "home", parent: "/", derived: true } }
  ),
  route(
    "chronicle",
    "pages/chronicle/index.tsx",
    "public",
    SHARED_TARGETS,
    "prerender",
    {
      prerender: ["/chronicle"],
      appNavigation: { tab: "resources", parent: "/apps" },
    }
  ),
  route(
    "chronicle/:activityId",
    "pages/chronicle/activity-page.tsx",
    "public",
    SHARED_TARGETS,
    "spa",
    { appNavigation: { tab: "resources", parent: "/chronicle", derived: true } }
  ),
  route(
    "packages/:siteSlug",
    "pages/sites/site-detail-page.tsx",
    "public",
    SHARED_TARGETS,
    "none",
    { appNavigation: { tab: "resources", parent: "/works", derived: true } }
  ),
  route("apps", "pages/apps/index.tsx", "public", APP_TARGET, "none", {
    appNavigation: { tab: "resources" },
  }),
  route(
    "account/me",
    "pages/account/me/account-me-page.tsx",
    "public",
    SHARED_TARGETS,
    "spa",
    { appNavigation: { tab: "account", private: true } }
  ),
  route(
    "account/me/:section",
    "pages/account/me/account-me-section-page.tsx",
    "public",
    SHARED_TARGETS,
    "spa",
    {
      appNavigation: {
        tab: "account",
        parent: "/account/me",
        private: true,
        sections: ["profile", "namecards", "favorites", "offices", "claims"],
      },
    }
  ),
  route("*", "pages/app-not-found-page.tsx", "public", APP_TARGET, "none", {
    appNavigation: { tab: "home", parent: "/", presentation: "error" },
  }),
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
  route(
    "admin/events/:eventId/preview",
    "pages/admin/events/preview-page.tsx",
    "public",
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
    "community",
    "pages/admin/community/index.tsx",
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
    "cards/characters",
    "pages/admin/cards/characters.tsx",
    "admin",
    WEB_TARGET,
    "spa"
  ),
  route(
    "cards/units",
    "pages/admin/cards/units.tsx",
    "admin",
    WEB_TARGET,
    "spa"
  ),
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
  route("idols", "pages/admin/idols/index.tsx", "admin", WEB_TARGET, "spa"),
  route(
    "idols/agencies",
    "pages/admin/idols/agencies.tsx",
    "admin",
    WEB_TARGET,
    "spa"
  ),
  route(
    "idols/groups",
    "pages/admin/idols/groups.tsx",
    "admin",
    WEB_TARGET,
    "spa"
  ),
  route(
    "idols/entries",
    "pages/admin/idols/entries.tsx",
    "admin",
    WEB_TARGET,
    "spa"
  ),
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
  route(
    "platform/email",
    "pages/admin/platform-email/index.tsx",
    "admin",
    WEB_TARGET,
    "spa"
  ),
  route(
    "platform/messages",
    "pages/admin/platform-messages/index.tsx",
    "admin",
    WEB_TARGET,
    "spa"
  ),
  route(
    "platform/messages/history",
    "pages/admin/platform-messages/history.tsx",
    "admin",
    WEB_TARGET,
    "spa"
  ),
  route(
    "platform/users",
    "pages/admin/platform-users/index.tsx",
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
