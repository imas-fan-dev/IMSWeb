import { useEffect, useRef, useState } from "react"
import { hasAsciiControl } from "@imsweb/contracts/fudaba"
import { isApiError } from "~/lib/api"
import { MapSearchError } from "~/lib/maps/map-search"
import type { MapPosition } from "~/lib/maps/map-engine"
import type { MapSearchContext } from "~/lib/maps/map-search"

export interface PlaceSearchDisplay {
  id: string
  label: string
  address: string
  attribution?: string
  position?: MapPosition
  distanceMeters?: number
  distanceLabel?: string
  disabled?: boolean
}
export type PlaceSearcher<Place> = (
  query: string,
  signal: AbortSignal,
  context?: MapSearchContext,
  cursor?: string
) => Promise<{
  items: Place[]
  attribution: string
  notice?: string
  nextCursor?: string | null
}>

function emptyResults<Place>() {
  return {
    results: [] as Place[],
    attribution: "",
    busy: false,
    error: null as string | null,
    searched: false,
    notice: null as string | null,
    revision: 0,
    nextCursor: null as string | null,
  }
}

export function usePlaceSearch<Place>(
  searcher: PlaceSearcher<Place> | null,
  subject = "地点"
) {
  const [query, setQuery] = useState("")
  const [state, setState] = useState(() => ({
    owner: searcher,
    ...emptyResults<Place>(),
  }))
  if (state.owner !== searcher)
    setState({ owner: searcher, ...emptyResults<Place>() })
  const {
    results,
    attribution,
    busy,
    error,
    searched,
    notice,
    revision,
    nextCursor,
  } = state.owner === searcher ? state : emptyResults<Place>()
  const request = useRef<AbortController | null>(null)

  function update(
    patch: Partial<ReturnType<typeof emptyResults<Place>>>,
    advance = false
  ) {
    setState((current) => {
      const previous =
        current.owner === searcher ? current : emptyResults<Place>()
      return {
        ...previous,
        ...patch,
        owner: searcher,
        revision: previous.revision + (advance ? 1 : 0),
      }
    })
  }

  useEffect(
    () => () => {
      request.current?.abort()
      request.current = null
    },
    [searcher]
  )

  async function submit(
    value = query,
    disabled = false,
    context?: MapSearchContext,
    cursor?: string
  ) {
    const nextQuery = value.slice(0, 120),
      search = nextQuery.trim()
    const requestContext = context
      ? {
          viewportCenter: context.viewportCenter
            ? ([...context.viewportCenter] as MapPosition)
            : undefined,
          devicePosition: context.devicePosition
            ? ([...context.devicePosition] as MapPosition)
            : undefined,
        }
      : undefined
    if (
      search.length < 2 ||
      hasAsciiControl(search) ||
      disabled ||
      request.current ||
      !searcher
    )
      return false
    const controller = new AbortController()
    request.current = controller
    setQuery(nextQuery)
    update({ busy: true, error: null, notice: null })
    try {
      const response = cursor
        ? await searcher(search, controller.signal, requestContext, cursor)
        : requestContext
          ? await searcher(search, controller.signal, requestContext)
          : await searcher(search, controller.signal)
      if (controller.signal.aborted) return false
      update(
        {
          results: cursor ? [...results, ...response.items] : response.items,
          nextCursor: response.nextCursor ?? null,
          attribution: response.attribution,
          error: null,
          notice: response.notice ?? null,
          searched: true,
        },
        true
      )
    } catch (nextError) {
      if (controller.signal.aborted) return false
      update({
        notice: null,
        error:
          (isApiError(nextError) && nextError.status === 429) ||
          (nextError instanceof MapSearchError && nextError.kind === "busy")
            ? `${subject}搜索正忙，请稍后再试。`
            : isApiError(nextError) && nextError.status === 503
              ? `${subject}搜索服务尚未配置，请联系管理员。`
              : nextError instanceof MapSearchError &&
                  nextError.kind === "unavailable"
                ? "当前地图的地点搜索未获授权，请联系管理员检查地图源配置。"
                : `${subject}暂时无法搜索，请稍后再试。`,
      })
    } finally {
      if (request.current === controller) {
        request.current = null
        update({ busy: false })
      }
    }
    return true
  }
  function edit(value: string) {
    setQuery(value.slice(0, 120))
    update({
      error: null,
      notice: null,
      ...(value !== query ? { nextCursor: null } : {}),
    })
  }
  function cancelPending() {
    if (!request.current) return
    request.current.abort()
    request.current = null
    update({ busy: false })
  }
  function resetResults(keepAttribution = false) {
    request.current?.abort()
    request.current = null
    update(
      {
        busy: false,
        results: [],
        searched: false,
        error: null,
        notice: null,
        nextCursor: null,
        ...(!keepAttribution ? { attribution: "" } : {}),
      },
      true
    )
  }
  return {
    query,
    edit,
    results,
    attribution,
    busy,
    error,
    notice,
    searched,
    revision,
    nextCursor,
    loadMore: () =>
      nextCursor
        ? submit(query, false, undefined, nextCursor)
        : Promise.resolve(false),
    submit,
    cancelPending,
    resetResults,
  }
}

export type PlaceSearchModel<Place> = ReturnType<typeof usePlaceSearch<Place>>
