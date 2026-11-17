import { useCallback, useEffect, useRef, useState } from "react"

import {
  getFudabaMapOffices,
  sendWithAbort,
  type FudabaMapBounds,
  type FudabaMapOffice,
} from "~/lib/api"
import {
  mergeMapOfficeResponses,
  reconcileMapOffices,
} from "~/pages/community/exchange/maps/exchange-map-model"

interface MapDataState {
  hasResult: boolean
  phase: "idle" | "loading" | "ready" | "error"
  items: FudabaMapOffice[]
  truncated: boolean
  error: string | null
}

const initialDataState: MapDataState = {
  hasResult: false,
  phase: "idle",
  items: [],
  truncated: false,
  error: null,
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

export function useExchangeMapOffices({
  city,
  series,
  open,
  dataRevision,
}: {
  city?: string
  series?: readonly string[]
  open?: boolean
  dataRevision: number
}) {
  const [data, setData] = useState<MapDataState>(initialDataState)
  const dataGeneration = useRef(0)
  const boundsRequest = useRef<{
    key: string
    controller: AbortController
  } | null>(null)
  const viewportTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined
  )
  const lastBoundsRef = useRef<FudabaMapBounds[] | null>(null)

  const loadBounds = useCallback(
    async (bounds: FudabaMapBounds[], force = false) => {
      if (!bounds.length) return
      const key = JSON.stringify([
        bounds,
        city ?? null,
        [...(series ?? [])].sort((a, b) => a.localeCompare(b)),
        open ?? null,
      ])
      if (!force && boundsRequest.current?.key === key) return
      boundsRequest.current?.controller.abort()
      const controller = new AbortController()
      boundsRequest.current = { key, controller }
      const generation = ++dataGeneration.current
      lastBoundsRef.current = bounds
      setData((current) => ({
        ...current,
        phase: "loading",
        error: null,
      }))
      try {
        const responses = await Promise.all(
          bounds.map((bbox) =>
            sendWithAbort(
              getFudabaMapOffices({
                bbox,
                city,
                series,
                open,
                limit: 200,
              }),
              controller.signal
            )
          )
        )
        if (controller.signal.aborted || dataGeneration.current !== generation)
          return
        const merged = mergeMapOfficeResponses(responses)
        setData((current) => ({
          phase: "ready",
          hasResult: true,
          items: reconcileMapOffices(current.items, merged.items),
          truncated: merged.truncated,
          error: null,
        }))
      } catch (error) {
        if (controller.signal.aborted || dataGeneration.current !== generation)
          return
        setData((current) => ({
          ...current,
          phase: "error",
          error: errorMessage(error, "地图范围内的事务所无法加载"),
        }))
      }
    },
    [city, open, series]
  )

  const queueBounds = useCallback(
    (bounds: FudabaMapBounds[]) => {
      lastBoundsRef.current = bounds
      clearTimeout(viewportTimer.current)
      viewportTimer.current = setTimeout(() => {
        void loadBounds(bounds)
      }, 180)
    },
    [loadBounds]
  )

  useEffect(() => {
    const bounds = lastBoundsRef.current
    if (bounds) void loadBounds(bounds, true)
    return () => {
      clearTimeout(viewportTimer.current)
      boundsRequest.current?.controller.abort()
      boundsRequest.current = null
      dataGeneration.current += 1
    }
  }, [loadBounds, dataRevision])

  const refresh = useCallback(() => {
    const bounds = lastBoundsRef.current
    if (bounds) void loadBounds(bounds, true)
  }, [loadBounds])

  return { data, onViewportChange: queueBounds, refresh }
}
