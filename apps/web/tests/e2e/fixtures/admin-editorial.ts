import {
  adminEditorialSpotlightSchema,
  editorialArticleListSchema,
  editorialMutationResponseSchema,
  editorialSpotlightSelectionRequestSchema,
  editorialStatusQuerySchema,
  type AdminEditorialSpotlight,
  type EditorialArticleList,
  type EditorialMutation,
  type EditorialSpotlightCategory,
} from "@imsweb/contracts/editorial"
import { adminApiPath } from "@imsweb/contracts/paths"

import type { ApiDispatcher, ApiTimes } from "./api-dispatcher"

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
  postsTimes?: ApiTimes
  spotlightTimes?: ApiTimes
  replaceTimes?: ApiTimes
}

export async function installAdminEditorialMock(
  api: ApiDispatcher,
  options: AdminEditorialMockOptions
) {
  const replacements: Array<{
    items: AdminSpotlightSelection[]
    csrfToken: string | undefined
  }> = []

  api.expect({
    method: "GET",
    path: adminApiPath("/community-posts"),
    query: editorialStatusQuerySchema,
    responses: { 200: editorialArticleListSchema },
    times: options.postsTimes,
    handle: () => {
      const response = { items: options.posts } satisfies EditorialArticleList
      return { status: 200, json: response }
    },
  })
  api.expect({
    method: "GET",
    path: adminApiPath("/community-posts/spotlight"),
    responses: { 200: adminEditorialSpotlightSchema },
    times: options.spotlightTimes,
    handle: () => {
      const response = {
        items: options.getSpotlight?.() ?? options.spotlight ?? [],
      } satisfies AdminEditorialSpotlight
      return { status: 200, json: response }
    },
  })
  api.expect({
    method: "PUT",
    path: adminApiPath("/community-posts/spotlight"),
    body: {
      schema: editorialSpotlightSelectionRequestSchema,
      projection: {
        name: "legacy spotlight request projection",
        reason:
          "the production request contract intentionally strips unknown keys",
      },
    },
    responses: { 200: editorialMutationResponseSchema },
    times: options.replaceTimes ?? (options.onReplaceSpotlight ? 1 : 0),
    handle: async ({ body, request }) => {
      replacements.push({
        items: body.items,
        csrfToken: request.headers()["x-csrftoken"],
      })
      await options.onReplaceSpotlight?.(body.items)
      const response = { success: true } satisfies EditorialMutation
      return { status: 200, json: response }
    },
  })

  return { replacements }
}
