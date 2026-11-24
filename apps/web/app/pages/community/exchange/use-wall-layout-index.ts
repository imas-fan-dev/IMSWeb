import { useCallback, useEffect, useRef, useState } from "react"
import { getFudabaWallLayout } from "~/lib/api"
import type { FudabaWallLayoutItem } from "@imsweb/contracts/fudaba/messages"
import { mergeWallLayouts } from "./wall-scene-layout"

export function useWallLayoutIndex(
  slug: string | undefined,
  actor: string | undefined
) {
  const scope = `${slug ?? ""}:${actor ?? "public"}`
  const generation = useRef(0)
  const active = useRef<ReturnType<typeof getFudabaWallLayout> | null>(null)
  const [state, setState] = useState<{
    scope: string
    phase: "loading" | "ready" | "error"
    items: FudabaWallLayoutItem[]
    error: string | null
  }>({ scope: "", phase: "loading", items: [], error: null })
  const reload = useCallback(async () => {
    const current = ++generation.current
    active.current?.abort()
    if (!slug) return
    setState({ scope, phase: "loading", items: [], error: null })
    const merged = new Map<string, FudabaWallLayoutItem>()
    const seen = new Set<string>()
    let cursor: string | undefined
    try {
      do {
        const method = getFudabaWallLayout(slug, cursor)
        active.current = method
        const result = await method.send()
        if (generation.current !== current) return
        for (const item of result.items)
          merged.set(`${item.kind}:${item.id}`, item)
        cursor = result.pageInfo.hasNextPage
          ? (result.pageInfo.nextCursor ?? undefined)
          : undefined
        if (result.pageInfo.hasNextPage && (!cursor || seen.has(cursor)))
          throw new Error("墙面占位暂时无法完整准备，请重试。")
        if (cursor) seen.add(cursor)
        setState((previous) => ({
          scope,
          phase: cursor ? "loading" : "ready",
          items: mergeWallLayouts(
            [...merged.values()],
            previous.scope === scope ? previous.items : []
          ),
          error: null,
        }))
      } while (cursor)
    } catch (failure) {
      if (generation.current === current)
        setState((previous) => ({
          ...previous,
          scope,
          phase: "error",
          error:
            failure instanceof Error ? failure.message : "墙面占位准备失败",
        }))
    }
  }, [slug, scope])
  const cancel = useCallback(() => { generation.current += 1; active.current?.abort() }, [])
  useEffect(() => { void reload(); return cancel }, [reload, cancel])

  const upsert = useCallback(
    (items: FudabaWallLayoutItem[]) =>
      setState((previous) => ({
        ...previous,
        items: mergeWallLayouts(previous.items, items),
      })),
    []
  )
  const remove = useCallback(
    (keys: ReadonlySet<string>) =>
      setState((previous) => ({
        ...previous,
        items: previous.items.filter(
          (item) => !keys.has(`${item.kind}:${item.id}`)
        ),
      })),
    []
  )
  return {
    ...state,
    items: state.scope === scope ? state.items : [],
    ready: state.scope === scope && state.phase === "ready",
    reload,
    upsert,
    remove,
  }
}
