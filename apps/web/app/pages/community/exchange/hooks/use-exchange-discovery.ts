import { useCallback, useEffect, useRef, useState } from "react"

import {
  getFudabaCardPage,
  getFudabaOfficePage,
  getFudabaSeries,
  isApiError,
  type FudabaCard,
  type FudabaCardPage,
  type FudabaOffice,
  type FudabaOfficePage,
  type FudabaSeries,
} from "~/lib/api"

type DiscoveryPhase = "loading" | "ready" | "closed" | "error"
export type DiscoveryState = {
  phase: DiscoveryPhase
  series: FudabaSeries[]
  offices: FudabaOffice[]
  officePageInfo: FudabaOfficePage["pageInfo"]
  cards: FudabaCard[]
  cardPageInfo: FudabaCardPage["pageInfo"]
  error: string | null
}

const emptyPageInfo = { hasNextPage: false, nextCursor: null }
const initialState: DiscoveryState = {
  phase: "loading",
  series: [],
  offices: [],
  officePageInfo: emptyPageInfo,
  cards: [],
  cardPageInfo: emptyPageInfo,
  error: null,
}

function deduplicateById<T extends { id: string }>(
  current: T[],
  incoming: T[]
) {
  const known = new Set(current.map((item) => item.id))
  return [...current, ...incoming.filter((item) => !known.has(item.id))]
}

function discoveryErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "社区交换数据暂时无法加载"
}

export function useExchangeDiscovery({
  city,
  seriesCodes,
  openOnly,
  dataRevision,
}: {
  city: string
  seriesCodes: readonly string[]
  openOnly: boolean
  dataRevision: number
}) {
  const [state, setState] = useState<DiscoveryState>(initialState)
  const [refreshing, setRefreshing] = useState(true)
  const [loadingMoreOffices, setLoadingMoreOffices] = useState(false)
  const [loadingMoreCards, setLoadingMoreCards] = useState(false)
  const requestGeneration = useRef(0)
  const officeRequestInFlight = useRef<symbol | null>(null)
  const cardRequestInFlight = useRef<symbol | null>(null)

  const loadFirstPage = useCallback(async () => {
    const generation = ++requestGeneration.current
    officeRequestInFlight.current = null
    cardRequestInFlight.current = null
    setState((current) =>
      current.phase === "ready"
        ? { ...current, error: null }
        : { ...current, phase: "loading", error: null }
    )
    setRefreshing(true)
    setLoadingMoreOffices(false)
    setLoadingMoreCards(false)

    try {
      const [seriesResult, officeResult, cardResult] = await Promise.all([
        getFudabaSeries().send(),
        getFudabaOfficePage({
          city: city || undefined,
          series: seriesCodes.length ? seriesCodes : undefined,
          open: openOnly ? true : undefined,
          limit: 12,
        }).send(),
        getFudabaCardPage({
          series: seriesCodes.length ? seriesCodes : undefined,
          available: true,
          limit: 8,
        }).send(),
      ])
      if (requestGeneration.current !== generation) return
      setState({
        phase: "ready",
        series: seriesResult.items,
        offices: officeResult.items,
        officePageInfo: officeResult.pageInfo,
        cards: cardResult.items,
        cardPageInfo: cardResult.pageInfo,
        error: null,
      })
    } catch (error) {
      if (requestGeneration.current !== generation) return
      const closed =
        isApiError(error) &&
        error.status === 404 &&
        error.payload === "Not Found"
      setState((current) =>
        current.phase === "ready" && !closed
          ? { ...current, error: discoveryErrorMessage(error) }
          : {
              ...current,
              phase: closed ? "closed" : "error",
              error: discoveryErrorMessage(error),
            }
      )
    } finally {
      if (requestGeneration.current === generation) setRefreshing(false)
    }
  }, [city, openOnly, seriesCodes])

  useEffect(() => {
    void loadFirstPage()
    return () => {
      requestGeneration.current += 1
    }
  }, [loadFirstPage, dataRevision])

  const loadMoreOffices = useCallback(async () => {
    if (
      officeRequestInFlight.current ||
      !state.officePageInfo.hasNextPage ||
      !state.officePageInfo.nextCursor
    ) {
      return
    }
    const generation = requestGeneration.current
    const requestToken = Symbol("fudaba-office-page")
    officeRequestInFlight.current = requestToken
    setLoadingMoreOffices(true)
    setState((current) => ({ ...current, error: null }))
    try {
      const result = await getFudabaOfficePage({
        city: city || undefined,
        series: seriesCodes.length ? seriesCodes : undefined,
        open: openOnly ? true : undefined,
        cursor: state.officePageInfo.nextCursor,
        limit: 12,
      }).send()
      if (requestGeneration.current !== generation) return
      setState((current) => ({
        ...current,
        offices: deduplicateById(current.offices, result.items),
        officePageInfo: result.pageInfo,
      }))
    } catch (error) {
      if (requestGeneration.current !== generation) return
      setState((current) => ({
        ...current,
        error: `更多事务所加载失败：${discoveryErrorMessage(error)}`,
      }))
    } finally {
      if (officeRequestInFlight.current === requestToken) {
        officeRequestInFlight.current = null
        setLoadingMoreOffices(false)
      }
    }
  }, [city, openOnly, seriesCodes, state.officePageInfo])

  const loadMoreCards = useCallback(async () => {
    if (
      cardRequestInFlight.current ||
      !state.cardPageInfo.hasNextPage ||
      !state.cardPageInfo.nextCursor
    ) {
      return
    }
    const generation = requestGeneration.current
    const requestToken = Symbol("fudaba-card-page")
    cardRequestInFlight.current = requestToken
    setLoadingMoreCards(true)
    setState((current) => ({ ...current, error: null }))
    try {
      const result = await getFudabaCardPage({
        series: seriesCodes.length ? seriesCodes : undefined,
        available: true,
        cursor: state.cardPageInfo.nextCursor,
        limit: 8,
      }).send()
      if (requestGeneration.current !== generation) return
      setState((current) => ({
        ...current,
        cards: deduplicateById(current.cards, result.items),
        cardPageInfo: result.pageInfo,
      }))
    } catch (error) {
      if (requestGeneration.current !== generation) return
      setState((current) => ({
        ...current,
        error: `更多名片加载失败：${discoveryErrorMessage(error)}`,
      }))
    } finally {
      if (cardRequestInFlight.current === requestToken) {
        cardRequestInFlight.current = null
        setLoadingMoreCards(false)
      }
    }
  }, [seriesCodes, state.cardPageInfo])

  return {
    state,
    refreshing,
    loadingMoreOffices,
    loadingMoreCards,
    refresh: loadFirstPage,
    loadMoreOffices,
    loadMoreCards,
  }
}
