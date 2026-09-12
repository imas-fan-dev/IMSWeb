import { useLayoutEffect, useRef, useState } from "react"

import type { NamecardSide } from "~/components/shared/namecard-preview"
import { getNamecardPage } from "~/lib/api"
import type { NamecardPage } from "~/lib/api"

type Direction = -1 | 1

type PreviewSession = {
  page: number
  pageSize: number
  result: NamecardPage
  index: number
  side: NamecardSide
  pending: boolean
  error: { direction: Direction; message: string } | null
}

type OpenPreview = Pick<
  PreviewSession,
  "page" | "pageSize" | "result" | "index" | "side"
>

export function useNamecardPreviewNavigation(listContext: string) {
  const [session, setSession] = useState<PreviewSession | null>(null)
  const current = useRef<PreviewSession | null>(null)
  const generation = useRef(0)
  const [context, setContext] = useState(listContext)
  if (context !== listContext) {
    setContext(listContext)
    setSession(null)
  }

  function commit(next: PreviewSession | null) {
    current.current = next
    setSession(next)
  }

  function close() {
    generation.current += 1
    commit(null)
  }

  // Invalidate before a pending promise can commit after a URL change/unmount.
  useLayoutEffect(() => {
    generation.current += 1
    current.current = null
    return () => {
      generation.current += 1
      current.current = null
    }
  }, [listContext])

  function open(input: OpenPreview) {
    generation.current += 1
    commit(
      input.result.list[input.index]
        ? { ...input, pending: false, error: null }
        : null
    )
  }

  function changeSide(side: NamecardSide) {
    if (current.current) commit({ ...current.current, side })
  }

  async function navigate(direction: Direction) {
    const previous = current.current
    if (!previous || previous.pending) return

    const index = previous.index + direction
    if (index >= 0 && index < previous.result.list.length) {
      commit({ ...previous, index, side: "front", error: null })
      return
    }

    const page = previous.page + direction
    if (page < 1 || page > previous.result.totalPage) return

    const requestGeneration = ++generation.current
    commit({ ...previous, pending: true, error: null })
    try {
      const result = await getNamecardPage(page, previous.pageSize).send()
      if (generation.current !== requestGeneration || !current.current) return
      if (result.list.length === 0 || page > result.totalPage) {
        commit({
          ...current.current,
          pending: false,
          error: { direction, message: "这一页已没有名片，请重试。" },
        })
        return
      }
      commit({
        ...previous,
        result,
        page,
        index: direction === 1 ? 0 : result.list.length - 1,
        side: "front",
        pending: false,
        error: null,
      })
    } catch {
      if (generation.current !== requestGeneration || !current.current) return
      commit({
        ...current.current,
        pending: false,
        error: { direction, message: "暂时无法读取名片，请重试。" },
      })
    }
  }

  const card = session?.result.list[session.index] ?? null
  return {
    card,
    side: session?.side ?? "front",
    open,
    close,
    changeSide,
    navigation: session
      ? {
          position: (session.page - 1) * session.pageSize + session.index + 1,
          total: session.result.total,
          canPrevious: session.index > 0 || session.page > 1,
          canNext:
            session.index < session.result.list.length - 1 ||
            session.page < session.result.totalPage,
          pending: session.pending,
          error: session.error?.message ?? null,
          onPrevious: () => void navigate(-1),
          onNext: () => void navigate(1),
          onRetry: () => {
            const direction = current.current?.error?.direction
            if (direction) void navigate(direction)
          },
        }
      : undefined,
  }
}
