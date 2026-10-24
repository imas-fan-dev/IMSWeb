import {
  fudabaWallLayoutResponseSchema,
  fudabaWallSceneResponseSchema,
  type FudabaWallLayoutItem,
} from "@imsweb/contracts/fudaba/messages"
import {
  fudabaMixedWallResponseSchema,
  fudabaMessageCreateRequestSchema,
  fudabaMessageEditRequestSchema,
  fudabaMessagePlacementRequestSchema,
  fudabaMessageModerationRequestSchema,
  fudabaMessageResponseSchema,
  fudabaMessageListResponseSchema,
  fudabaMessageDestroyResponseSchema,
  fudabaMessageErrorResponseSchema,
  type FudabaMessage,
  type FudabaPublicMessage,
  type FudabaMessageCreateInput,
  type FudabaMessageEditInput,
  type FudabaMessagePlacementInput,
  type FudabaMessageModerationInput,
} from "@imsweb/contracts/fudaba/messages"
import type { FudabaWallResponse } from "@imsweb/contracts/fudaba/wall"
import { exchangePath, adminExchangePath } from "@imsweb/contracts/paths"
import { platformApiClient } from "../../platform-client"
import { adminApiClient } from "../../admin-client"
import { parsed } from "../../parsed"
import { normalizeFudabaMixedWallResponse } from "../../media-urls"
import {
  withPlatformAuth,
  withPlatformCsrf,
  withBackofficeAuth,
  withBackofficeCsrf,
} from "../../types"

export type { FudabaMessage, FudabaPublicMessage }
export interface FudabaV2WallResponse extends FudabaWallResponse {
  messages: FudabaPublicMessage[]
  manageableCardIds: string[]
  capabilities: {
    canCreateMessage: boolean
    canArrangeWall: boolean
    canManageMessages: boolean
  }
}
const errors = {
  errorSchema: fudabaMessageErrorResponseSchema,
  businessErrorSchema: fudabaMessageErrorResponseSchema,
}
function query(path: string, values: Record<string, string | undefined>) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) params.set(key, value)
  }
  return params.size ? `${path}?${params}` : path
}
export function getFudabaMixedWall(
  slug: string,
  input: {
    bbox?: readonly [number, number, number, number]
    cursor?: string
    limit?: number
    item?: string
  } = {}
) {
  return platformApiClient.Get(
    query(exchangePath(`/offices/${encodeURIComponent(slug)}/mixed-wall`), {
      bbox: input.bbox?.join(","),
      cursor: input.cursor,
      limit: String(input.limit ?? 50),
      item: input.item,
    }),
    parsed(fudabaMixedWallResponseSchema, {
      ...errors,
      meta: withPlatformAuth(),
      cacheFor: 0,
      // Each wall read owns cancellation, including StrictMode remounts.
      shareRequest: false,
      select: (wire): FudabaV2WallResponse => {
        const result = normalizeFudabaMixedWallResponse(wire)
        const cards = result.items.flatMap((item) =>
          item.kind === "card" ? [item.card] : []
        )
        return {
          office: { ...result.office, cards },
          wall: result.wall,
          messages: result.items.flatMap((item) =>
            item.kind === "message" ? [item.message] : []
          ),
          manageableCardIds: result.items.flatMap((item) =>
            item.kind === "card" && item.canMove ? [item.card.id] : []
          ),
          pageInfo: result.pageInfo,
          capabilities: result.capabilities,
        }
      },
    })
  )
}
export function getFudabaPrivateMessage(id: string) {
  return platformApiClient.Get(
    exchangePath(`/messages/${encodeURIComponent(id)}`),
    parsed(fudabaMessageResponseSchema, {
      ...errors,
      meta: withPlatformAuth(),
      cacheFor: 0,
      // Readers own cancellation independently, including StrictMode remounts.
      shareRequest: false,
    })
  )
}
export function createFudabaMessage(
  officeId: string,
  input: FudabaMessageCreateInput,
  key: string
) {
  return platformApiClient.Post(
    exchangePath(`/offices/${encodeURIComponent(officeId)}/messages`),
    fudabaMessageCreateRequestSchema.parse(input),
    parsed(fudabaMessageResponseSchema, {
      ...errors,
      headers: { "Idempotency-Key": key },
      meta: withPlatformCsrf(),
    })
  )
}
export function editFudabaMessage(id: string, input: FudabaMessageEditInput) {
  return platformApiClient.Put(
    exchangePath(`/messages/${encodeURIComponent(id)}`),
    fudabaMessageEditRequestSchema.parse(input),
    parsed(fudabaMessageResponseSchema, { ...errors, meta: withPlatformCsrf() })
  )
}
export function placeFudabaMessage(
  id: string,
  input: FudabaMessagePlacementInput
) {
  return platformApiClient.Put(
    exchangePath(`/messages/${encodeURIComponent(id)}/placement`),
    fudabaMessagePlacementRequestSchema.parse(input),
    parsed(fudabaMessageResponseSchema, { ...errors, meta: withPlatformCsrf() })
  )
}
export function destroyFudabaMessage(id: string) {
  return platformApiClient.Delete(
    exchangePath(`/messages/${encodeURIComponent(id)}`),
    undefined,
    parsed(fudabaMessageDestroyResponseSchema, {
      ...errors,
      meta: withPlatformCsrf(),
    })
  )
}
export function moderateFudabaMessage(
  id: string,
  input: FudabaMessageModerationInput,
  admin = false
) {
  const path = `/messages/${encodeURIComponent(id)}/${admin ? "moderation" : "office-moderation"}`
  return admin
    ? adminApiClient.Put(
        adminExchangePath(path),
        fudabaMessageModerationRequestSchema.parse(input),
        parsed(fudabaMessageResponseSchema, {
          ...errors,
          meta: withBackofficeCsrf(),
        })
      )
    : platformApiClient.Put(
        exchangePath(path),
        fudabaMessageModerationRequestSchema.parse(input),
        parsed(fudabaMessageResponseSchema, {
          ...errors,
          meta: withPlatformCsrf(),
        })
      )
}
export function getFudabaMessages(
  mode: "mine" | "office" | "admin",
  input: {
    officeId?: string
    cursor?: string
    status?: "all" | "visible" | "office-hidden" | "admin-hidden"
  } = {}
) {
  const suffix =
    mode === "mine"
      ? "/me/messages"
      : mode === "office"
        ? `/offices/${encodeURIComponent(input.officeId ?? "")}/messages`
        : "/messages"
  const path = query(
    mode === "admin" ? adminExchangePath(suffix) : exchangePath(suffix),
    {
      cursor: input.cursor,
      status: input.status,
      limit: "50",
      office: mode === "office" ? undefined : input.officeId,
    }
  )
  return mode === "admin"
    ? adminApiClient.Get(
        path,
        parsed(fudabaMessageListResponseSchema, {
          ...errors,
          meta: withBackofficeAuth(),
          cacheFor: 0,
        })
      )
    : platformApiClient.Get(
        path,
        parsed(fudabaMessageListResponseSchema, {
          ...errors,
          meta: withPlatformAuth(),
          cacheFor: 0,
        })
      )
}

export interface FudabaSceneResponse extends FudabaV2WallResponse {
  layouts: FudabaWallLayoutItem[]
}

export function getFudabaWallLayout(slug: string, cursor?: string) {
  return platformApiClient.Get(
    query(exchangePath(`/offices/${encodeURIComponent(slug)}/wall-layout`), {
      cursor,
      limit: "100",
    }),
    parsed(fudabaWallLayoutResponseSchema, {
      ...errors,
      meta: withPlatformAuth(),
      cacheFor: 0,
      shareRequest: false,
    })
  )
}

export function getFudabaWallScene(
  slug: string,
  input: {
    bbox?: readonly [number, number, number, number]
    cursor?: string
    limit?: number
    item?: string
  } = {}
) {
  return platformApiClient.Get(
    query(exchangePath(`/offices/${encodeURIComponent(slug)}/wall-scene`), {
      bbox: input.bbox?.join(","),
      cursor: input.cursor,
      limit: String(input.limit ?? 50),
      item: input.item,
    }),
    parsed(fudabaWallSceneResponseSchema, {
      ...errors,
      meta: withPlatformAuth(),
      cacheFor: 0,
      // Each wall read owns cancellation, including StrictMode remounts.
      shareRequest: false,
      select: (wire): FudabaSceneResponse => {
        const result = normalizeFudabaMixedWallResponse({
          office: wire.office,
          wall: wire.wall,
          items: wire.items,
          pageInfo: wire.pageInfo,
          capabilities: wire.capabilities,
        })
        const cards = result.items.flatMap((item) =>
          item.kind === "card" ? [item.card] : []
        )
        return {
          office: { ...result.office, cards },
          layouts: wire.layouts,
          wall: result.wall,
          messages: result.items.flatMap((item) =>
            item.kind === "message" ? [item.message] : []
          ),
          manageableCardIds: result.items.flatMap((item) =>
            item.kind === "card" && item.canMove ? [item.card.id] : []
          ),
          pageInfo: result.pageInfo,
          capabilities: result.capabilities,
        }
      },
    })
  )
}
