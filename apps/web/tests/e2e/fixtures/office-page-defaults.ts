import { resolveApiContract } from "./api-contract-catalog"
import type { ApiDispatcher } from "./api-dispatcher"

/** The office fields a spec needs to name; the rest of the schema is filled in. */
export type DefaultOffice = {
  id: string
  slug: string
  name: string
  city: string
  address: string
  accent: string
  intro?: string
  coverUrl?: string | null
  isOpen?: boolean
  visitorCount?: number
  seriesCodes?: string[]
}

const emptyPageInfo = { hasNextPage: false, nextCursor: null }
const emptyWall = {
  layoutVersion: 1,
  left: -800,
  top: -450,
  right: 800,
  bottom: 450,
  maxZIndex: 0,
  total: 0,
}

/**
 * Neutral answers for the requests every office page makes on open: an empty
 * message list, and an empty wall in both the scene and the layout shape.
 *
 * They are fallbacks, so a spec that mocks one of these endpoints itself (for
 * example through mockWallScene) replaces the default instead of colliding.
 * Office ids are part of the path, so each office a spec opens is installed.
 */
export function installOfficePageDefaults(
  api: ApiDispatcher,
  routeId: string,
  source: DefaultOffice
) {
  const office = {
    id: source.id,
    slug: source.slug,
    name: source.name,
    intro: source.intro ?? "",
    city: source.city,
    address: source.address,
    accent: source.accent,
    coverUrl: source.coverUrl ?? null,
    isOpen: source.isOpen ?? true,
    visitorCount: source.visitorCount ?? 0,
    seriesCodes: source.seriesCodes ?? [],
  }
  const base = `/api/community/exchange/offices/${routeId}`
  const defaults = [
    {
      path: `${base}/messages`,
      json: { messages: [], pageInfo: emptyPageInfo },
    },
    {
      path: `${base}/wall-scene`,
      json: {
        version: 1,
        office,
        wall: emptyWall,
        items: [],
        layouts: [],
        pageInfo: emptyPageInfo,
        capabilities: {
          canCreateMessage: false,
          canArrangeWall: false,
          canManageMessages: false,
        },
      },
    },
    {
      path: `${base}/wall-layout`,
      json: {
        version: 1,
        office,
        wall: emptyWall,
        items: [],
        pageInfo: emptyPageInfo,
      },
    },
  ]
  for (const { path, json } of defaults) {
    api.expect({
      ...resolveApiContract("GET", path),
      method: "GET",
      path,
      times: { min: 0, max: 1_000 },
      fallback: true,
      handle: () => ({ status: 200, json }),
    })
  }
}
