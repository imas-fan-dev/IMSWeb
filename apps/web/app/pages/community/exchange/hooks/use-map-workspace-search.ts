import { useCallback, useId, useState } from "react"
import {
  getFudabaOfficePage,
  sendWithAbort,
  type FudabaOffice,
} from "~/lib/api"
import type { MapPlaceSearcher, MapSearchPlace } from "~/lib/maps/map-search"
import { usePlaceSearch, type PlaceSearchDisplay } from "./use-place-search"

export type MapSearchTab = "offices" | "places"
export interface OfficeSearchResult extends PlaceSearchDisplay {
  office: FudabaOffice
}
export type WorkspaceSearchResult = MapSearchPlace | OfficeSearchResult
export interface WorkspaceSearchTabs {
  active: MapSearchTab
  onChange: (tab: MapSearchTab) => void
  hasMore: boolean
  onLoadMore: () => void
  panelId?: string
}

const searchOffices = async (
  query: string,
  signal: AbortSignal,
  _context?: unknown,
  cursor?: string
) => {
  const page = await sendWithAbort(
    getFudabaOfficePage({ q: query, limit: 20, cursor }),
    signal
  )
  return {
    items: page.items.map(
      (office): WorkspaceSearchResult => ({
        id: `office:${office.id}`,
        label: office.name,
        address: [office.city, office.address].filter(Boolean).join(" · "),
        disabled: !office.location,
        ...(!office.location
          ? { address: `${office.city} · 暂未公开地图位置` }
          : {}),
        office,
      })
    ),
    attribution: "",
    nextCursor: page.pageInfo.nextCursor,
  }
}

/** Both owners stay mounted; switching cancels obsolete work and keeps the query. */
export function useMapWorkspaceSearch(placeSearcher: MapPlaceSearcher | null) {
  const panelId = useId()
  const [tab, setTab] = useState<MapSearchTab>("offices")
  const offices = usePlaceSearch<WorkspaceSearchResult>(searchOffices, "事务所")
  const places = usePlaceSearch<WorkspaceSearchResult>(placeSearcher)
  const active = tab === "offices" ? offices : places
  // Native event revisions must never alias between independent result owners.
  const [clock, setClock] = useState({
    tab,
    revision: active.revision,
    sequence: 0,
  })
  if (clock.tab !== tab || clock.revision !== active.revision) {
    setClock({
      tab,
      revision: active.revision,
      sequence: clock.sequence + 1,
    })
  }
  const change = useCallback(
    (next: MapSearchTab) => {
      if (next === tab) return
      active.cancelPending()
      const destination = next === "offices" ? offices : places
      destination.cancelPending()
      destination.resetResults()
      destination.edit(active.query)
      setTab(next)
      if (active.query.trim().length >= 2) void destination.submit(active.query)
    },
    [tab, active, offices, places]
  )
  return {
    model: { ...active, revision: clock.sequence },
    owner: tab === "offices" ? searchOffices : placeSearcher,
    available: tab === "offices" || Boolean(placeSearcher),
    tabs: {
      active: tab,
      onChange: change,
      panelId,
      hasMore: Boolean(active.nextCursor),
      onLoadMore: () => {
        void active.loadMore()
      },
    } satisfies WorkspaceSearchTabs,
  }
}
