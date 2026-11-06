import type { Page } from "@playwright/test"

import {
  homeSeededApis,
  installSeededPublicApis,
  type SeededPublicApiRegistration,
} from "./public-content"
import type { ApiDispatcher } from "./test"

const catalog: SeededPublicApiRegistration = {
  path: "/api/wiki/catalog",
  times: 1,
}
const recipes: Record<
  string,
  { path: string; title: RegExp; apis: SeededPublicApiRegistration[] }
> = {
  home: { path: "/", title: /IMSWeb/i, apis: homeSeededApis },
  about: {
    path: "/about",
    title: /关于我们.*IMSWeb/i,
    apis: [catalog, { path: "/api/about", times: 1 }],
  },
  events: {
    path: "/events",
    title: /社区动态.*IMSWeb/i,
    apis: [catalog, { path: "/api/events", times: 1 }],
  },
  recommendations: {
    path: "/recommendations",
    title: /向您推荐.*IMSWeb/i,
    apis: [catalog, { path: "/api/news", times: 1 }],
  },
  live: {
    path: "/live",
    title: /Live.*IMSWeb/i,
    apis: [catalog, { path: "/api/live-schedule", times: 1 }],
  },
  community: {
    path: "/community",
    title: /制作人社区.*IMSWeb/i,
    apis: [
      catalog,
      { path: "/api/community/content", times: 1 },
      { path: "/api/community/exchange/series", times: 1 },
    ],
  },
  works: { path: "/works", title: /系列作品.*IMSWeb/i, apis: [catalog] },
  wiki: {
    path: "/wiki",
    title: /剧情档案.*IMSWeb/i,
    apis: [catalog, { path: "/api/wiki/random_bg", times: 1 }],
  },
}

export function captureRecipe(id: string) {
  const recipe = recipes[id]
  if (!recipe) throw new Error(`Unknown Web capture recipe: ${id}`)
  return recipe
}

export function installCaptureApis(api: ApiDispatcher, id: string) {
  const recipe = captureRecipe(id)
  installSeededPublicApis(api, recipe.apis)
  return recipe
}

export async function visibleImageFailures(page: Page) {
  return page.locator("main img").evaluateAll((images) =>
    images
      .filter((node) => {
        const box = node.getBoundingClientRect()
        return (
          box.width > 0 &&
          box.height > 0 &&
          box.top < innerHeight &&
          box.bottom > 0
        )
      })
      .filter(
        (node) =>
          !(node as HTMLImageElement).complete ||
          !(node as HTMLImageElement).naturalWidth
      )
      .map((node) => node.getAttribute("src"))
  )
}
