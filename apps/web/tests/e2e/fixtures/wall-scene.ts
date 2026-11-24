import type { Route } from "@playwright/test"
import { cardLabel } from "~/pages/community/exchange/components/card-label"
import type {
  FudabaMixedWallResponse,
  FudabaWallLayoutItem,
  FudabaWallSceneResponse,
} from "@imsweb/contracts/fudaba/messages"
import type { ApiDispatcher, ApiTimes } from "./api-dispatcher"

export function sceneFixture(
  wire: FudabaMixedWallResponse
): FudabaWallSceneResponse {
  const layouts: FudabaWallLayoutItem[] = wire.items.map((item) =>
    item.kind === "card"
      ? {
          kind: "card",
          id: item.card.id,
          placement: item.card.placement,
          width: 240,
          height: 160,
          layoutVersion: 1,
          displayName: cardLabel(item.card),
          viewerOwned: item.card.viewerOwned,
          preview: null,
          assetVersion: item.card.frontImageUrl,
        }
      : {
          kind: "message",
          id: item.message.id,
          placement: item.message.placement,
          width: 242,
          height: 277,
          layoutVersion: 1,
          color: item.message.color,
          contentRevision: 0,
        }
  )
  return { ...wire, version: 1, layouts }
}

// Existing behavior specs retain their data fixtures; scene-specific specs provide a complete index.
export async function mockWallScene(
  api: ApiDispatcher,
  matcher: string,
  handler: (route: Route) => unknown | Promise<unknown>,
  method: "GET",
  times?: ApiTimes
) {
  let latest: FudabaMixedWallResponse | undefined
  let resolveInitial!: (wire: FudabaMixedWallResponse) => void
  const initial = new Promise<FudabaMixedWallResponse>((resolve) => {
    resolveInitial = resolve
  })
  api.mockRoute(
    matcher.replace("mixed-wall", "wall-scene"),
    async (route) => {
      const proxy = new Proxy(route, {
        get(target, property) {
          if (property === "fulfill")
            return async (options: Parameters<Route["fulfill"]>[0]) => {
              const wire =
                options?.json ??
                (typeof options?.body === "string"
                  ? JSON.parse(options.body)
                  : undefined)
              if (
                wire &&
                Array.isArray(wire.items) &&
                wire.office &&
                wire.wall
              ) {
                latest = wire as FudabaMixedWallResponse
                resolveInitial(latest)
                return target.fulfill({
                  ...options,
                  body: undefined,
                  json: sceneFixture(latest),
                })
              }
              return target.fulfill(options)
            }
          const value = Reflect.get(target, property)
          return typeof value === "function" ? value.bind(target) : value
        },
      })
      return handler(proxy)
    },
    method,
    times
  )
  api.mockRoute(
    matcher.replace("mixed-wall", "wall-layout"),
    async (route) => {
      const wire = latest ?? (await initial)
      return route.fulfill({
        json: {
          version: 1,
          office: wire.office,
          wall: wire.wall,
          items: sceneFixture(wire).layouts,
          pageInfo: { hasNextPage: false, nextCursor: null },
        },
      })
    },
    "GET",
    { min: 1, max: 8 }
  )
}
