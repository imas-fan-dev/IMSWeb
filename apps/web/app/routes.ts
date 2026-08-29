import type { RouteConfig, RouteConfigEntry } from "@react-router/dev/routes"

// Build-time target switch. `app` produces the Tauri-packaged manifest with
// admin routes excluded; unset or any other value produces the web manifest,
// byte-for-byte identical to before this switch existed. See `env.d.ts` and
// `.env.example` for `VITE_IMS_APP_TARGET`. Excluding entries here (rather
// than filtering after the fact) keeps admin page modules out of the app
// build's module graph entirely, not just tree-shaken from it.
const isAppTarget = import.meta.env.VITE_IMS_APP_TARGET === "app"

const publicRoutes = [
  { index: true, file: "pages/home/index.tsx" },
  { path: "about", file: "pages/about/index.tsx" },
  { path: "events", file: "pages/events/index.tsx" },
  {
    path: "recommendations",
    file: "pages/recommendations/index.tsx",
  },
  { path: "live", file: "pages/live/index.tsx" },
  { path: "community", file: "pages/community/index.tsx" },
  { path: "account/login", file: "pages/account/login/account-login-page.tsx" },
  {
    path: "account/register",
    file: "pages/account/register/account-register-page.tsx",
  },
  {
    path: "account/password-reset",
    file: "pages/account/reset/account-password-reset-page.tsx",
  },
  {
    path: "community/exchange",
    file: "pages/community/exchange/community-exchange-page.tsx",
  },
  {
    path: "community/exchange/me",
    file: "pages/community/exchange/me/community-exchange-me-page.tsx",
  },
  {
    path: "community/exchange/offices/:officeSlug",
    file: "pages/community/exchange/community-office-page.tsx",
  },
  {
    path: "community/cards",
    file: "pages/community/community-cards-page.tsx",
  },
  {
    path: "community/cards/submissions/:id",
    file: "pages/community/namecard-submission-page.tsx",
  },
  {
    path: "producer-map",
    file: "pages/producer-map/index.tsx",
  },
  { path: "tier-list", file: "pages/tier-list/index.tsx" },
  { path: "works", file: "pages/works/index.tsx" },
  {
    path: "works/:workSlug",
    file: "pages/works/work-detail-page.tsx",
  },
  {
    id: "pages/wiki/modern/wiki-index-default",
    path: "wiki",
    file: "pages/wiki/modern/index.tsx",
  },
  { path: "wiki/modern", file: "pages/wiki/modern/index.tsx" },
  {
    id: "pages/wiki/modern/story-default",
    path: "story",
    file: "pages/wiki/modern/story-page.tsx",
  },
  { path: "story/modern", file: "pages/wiki/modern/story-page.tsx" },
  {
    path: "information/:contentId",
    file: "pages/information/information-content-page.tsx",
  },
  {
    path: "chronicle",
    file: "pages/chronicle/index.tsx",
  },
  {
    path: "chronicle/:activityId",
    file: "pages/chronicle/activity-page.tsx",
  },
  {
    path: "packages/:siteSlug",
    file: "pages/sites/site-detail-page.tsx",
  },
] satisfies RouteConfigEntry[]

const standaloneRoutes = [
  {
    path: "wiki/classic",
    file: "pages/wiki/classic/index.tsx",
  },
  {
    path: "story/classic",
    file: "pages/wiki/classic/classic-story-page.tsx",
  },
  ...(isAppTarget
    ? []
    : [{ path: "admin/login", file: "pages/admin/login/index.tsx" }]),
] satisfies RouteConfigEntry[]

const adminRoutes = [
  { index: true, file: "pages/admin/index.tsx" },
  { path: "events", file: "pages/admin/events/index.tsx" },
  { path: "about", file: "pages/admin/about/index.tsx" },
  {
    path: "homepage",
    file: "pages/admin/homepage/index.tsx",
  },
  {
    path: "producer-map",
    file: "pages/admin/producer-map/index.tsx",
  },
  {
    path: "community/exchange",
    file: "pages/admin/community/exchange/admin-community-exchange-page.tsx",
  },
  {
    path: "information",
    file: "pages/admin/information/index.tsx",
  },
  {
    path: "recommendations",
    file: "pages/admin/recommendations/index.tsx",
  },
  { path: "cards", file: "pages/admin/cards/index.tsx" },
  {
    path: "site-packages",
    file: "pages/admin/site-packages/index.tsx",
  },
  {
    path: "stories/assets",
    file: "pages/admin/stories/story-cover-assets-page.tsx",
  },
  {
    path: "stories",
    file: "pages/admin/stories/index.tsx",
  },
  {
    path: "chronicle",
    file: "pages/admin/chronicle/index.tsx",
  },
  {
    path: "accounts",
    file: "pages/admin/accounts/index.tsx",
  },
  {
    path: "platform/oauth",
    file: "pages/admin/platform-oauth/index.tsx",
  },
  { path: "*", file: "pages/admin/not-found/index.tsx" },
] satisfies RouteConfigEntry[]

export default [
  {
    // Two chrome shells over the same pages. The app shell is a separate module
    // rather than a branch inside the web one so the web build never imports
    // the tab bar, cold-start mask, or account tab at all.
    file: isAppTarget ? "layouts/app-layout.tsx" : "layouts/public-layout.tsx",
    children: isAppTarget
      ? [
          ...publicRoutes,
          {
            path: "account/me",
            file: "pages/account/me/account-me-page.tsx",
          },
        ]
      : publicRoutes,
  },
  ...standaloneRoutes,
  ...(isAppTarget
    ? []
    : [
        {
          path: "admin",
          file: "layouts/admin-layout.tsx",
          children: adminRoutes,
        },
      ]),
] satisfies RouteConfig
