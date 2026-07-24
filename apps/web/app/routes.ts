import {
  type RouteConfig,
  index,
  layout,
  route,
} from "@react-router/dev/routes"

export default [
  layout("routes/public-layout.tsx", [
    index("routes/home.tsx"),
    route("about", "routes/about.tsx"),
    route("events", "routes/events.tsx"),
    route("recommendations", "routes/recommendations.tsx"),
    route("live", "routes/live.tsx"),
    route("community", "routes/community.tsx"),
    route("works", "routes/works.tsx"),
    route("wiki", "routes/wiki.tsx"),
    route("story", "routes/story.tsx"),
    route("information/:contentId", "routes/information-content.tsx"),
    route("chronicle/:activityId", "routes/chronicle-activity.tsx"),
  ]),
  route("wiki/classic", "routes/wiki-classic.tsx"),
  route("story/classic", "routes/story-classic.tsx"),
  route("admin/login", "routes/admin-login.tsx"),
  route("admin", "routes/admin-layout.tsx", [
    index("routes/admin-index.tsx"),
    route("information", "routes/admin-information.tsx"),
    route("recommendations", "routes/admin-recommendations.tsx"),
    route("site-packages", "routes/admin-site-packages.tsx"),
    route("stories", "routes/admin-stories.tsx"),
    route("chronicle", "routes/admin-chronicle.tsx"),
    route("*", "routes/admin-not-found.tsx"),
  ]),
] satisfies RouteConfig
