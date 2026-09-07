import type {
  AdminEditorialSpotlight,
  EditorialArticleList,
  EditorialMutation,
  EditorialSpotlightCategory,
} from "@imsweb/contracts/editorial"
import type { Page } from "@playwright/test"

export type AdminSpotlightSelection = {
  postId: string | number
  category: EditorialSpotlightCategory
}

type AdminEditorialMockOptions = {
  posts: EditorialArticleList["items"]
  spotlight?: AdminEditorialSpotlight["items"]
  getSpotlight?: () => AdminEditorialSpotlight["items"]
  onReplaceSpotlight?: (
    items: AdminSpotlightSelection[]
  ) => Promise<void> | void
}

export async function installAdminEditorialMock(
  page: Page,
  options: AdminEditorialMockOptions
) {
  const replacements: Array<{
    items: AdminSpotlightSelection[]
    csrfToken: string | undefined
  }> = []

  await page.route(
    (url) => url.pathname === "/api/admin/community-posts",
    async (route) => {
      if (route.request().method() !== "GET") {
        await route.abort()
        return
      }
      const response = { items: options.posts } satisfies EditorialArticleList
      await route.fulfill({ status: 200, json: response })
    }
  )
  await page.route(
    (url) => url.pathname === "/api/admin/community-posts/spotlight",
    async (route) => {
      const request = route.request()
      if (request.method() === "GET") {
        const response = {
          items: options.getSpotlight?.() ?? options.spotlight ?? [],
        } satisfies AdminEditorialSpotlight
        await route.fulfill({ status: 200, json: response })
        return
      }
      if (request.method() === "PUT") {
        const body = request.postDataJSON() as {
          items: AdminSpotlightSelection[]
        }
        replacements.push({
          items: body.items,
          csrfToken: request.headers()["x-csrftoken"],
        })
        await options.onReplaceSpotlight?.(body.items)
        const response = { success: true } satisfies EditorialMutation
        await route.fulfill({ status: 200, json: response })
        return
      }
      await route.abort()
    }
  )

  return { replacements }
}
