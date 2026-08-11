import type { RouteConfig, RouteConfigEntry } from "@react-router/dev/routes"

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
  {
    path: "community/cards",
    file: "pages/community/community-cards-page.tsx",
  },
  {
    path: "producer-map",
    file: "pages/producer-map/index.tsx",
  },
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
  { path: "admin/login", file: "pages/admin/login/index.tsx" },
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
  { path: "*", file: "pages/admin/not-found/index.tsx" },
] satisfies RouteConfigEntry[]

export default [
  { file: "layouts/public-layout.tsx", children: publicRoutes },
  ...standaloneRoutes,
  {
    path: "admin",
    file: "layouts/admin-layout.tsx",
    children: adminRoutes,
  },
] satisfies RouteConfig
