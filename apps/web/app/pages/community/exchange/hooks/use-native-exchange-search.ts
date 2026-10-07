import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { shouldUseNativeGlassControls } from "~/lib/native-glass-panel"
import {
  NATIVE_GLASS_SEARCH_EVENT,
  nativeGlassSearchEvent,
  removeNativeGlassSearch,
  syncNativeGlassSearch,
  type NativeGlassSearchEvent,
  type NativeGlassSearchSnapshot,
} from "~/lib/native-glass-search"

let nextGeneration = Date.now()

/** Serialized updates keep teardown behind pending installs. */
export function useNativeExchangeSearch(
  snapshot: Omit<NativeGlassSearchSnapshot, "generation"> | null,
  onEvent: (event: NativeGlassSearchEvent) => void
) {
  const [native, setNative] = useState(false)
  const [generation, setGeneration] = useState(() => ++nextGeneration)
  const [wasPresent, setWasPresent] = useState(Boolean(snapshot))
  if (wasPresent !== Boolean(snapshot)) {
    setWasPresent(Boolean(snapshot))
    if (snapshot) setGeneration(++nextGeneration)
  }
  const handler = useRef(onEvent)
  const current = useRef(snapshot)
  useLayoutEffect(() => {
    handler.current = onEvent
    current.current = snapshot
  }, [onEvent, snapshot])
  const queue = useRef<Promise<unknown>>(Promise.resolve())
  const failed = useRef(false)
  const lastAttempt = useRef(generation)
  const admitted = useRef(shouldUseNativeGlassControls())

  useEffect(() => {
    if (!admitted.current) return
    const receive = (raw: Event) => {
      const event = nativeGlassSearchEvent(raw)
      const active = current.current
      if (
        !active ||
        (failed.current &&
          event?.action !== "cancel" &&
          event?.action !== "tool") ||
        !event ||
        event.id !== active.id ||
        event.generation !== generation
      )
        return
      if (
        event.action === "select" &&
        (event.revision !== active.revision ||
          !active.results.some((place) => place.id === event.value))
      )
        return
      handler.current(event)
    }
    window.addEventListener(NATIVE_GLASS_SEARCH_EVENT, receive)
    return () => window.removeEventListener(NATIVE_GLASS_SEARCH_EVENT, receive)
  }, [generation])

  useEffect(() => {
    if (!admitted.current) return
    let active = true
    queue.current = queue.current
      .catch(() => undefined)
      .then(async () => {
        if (!active && snapshot) return
        if (!snapshot || failed.current) {
          try {
            await removeNativeGlassSearch(
              "exchange-search",
              lastAttempt.current
            )
          } catch {
            await removeNativeGlassSearch(
              "exchange-search",
              lastAttempt.current
            )
          }
          if (active) setNative(false)
          return
        }
        try {
          lastAttempt.current = generation
          const status = await syncNativeGlassSearch({
            ...snapshot,
            generation,
          })
          if (!status.supported) throw new Error(status.reason ?? "unsupported")
          if (active) setNative(true)
        } catch {
          failed.current = true
          await removeNativeGlassSearch("exchange-search", generation).catch(
            () => removeNativeGlassSearch("exchange-search", generation)
          )
          if (active) setNative(false)
        }
      })
      .catch(() => {
        failed.current = true
      })
    return () => {
      active = false
    }
  }, [snapshot, generation])

  useEffect(
    () => () => {
      current.current = null
      if (admitted.current) {
        queue.current = queue.current
          .catch(() => undefined)
          .then(() =>
            removeNativeGlassSearch("exchange-search", lastAttempt.current)
          )
          .catch(() => undefined)
      }
    },
    [generation]
  )
  return native
}
