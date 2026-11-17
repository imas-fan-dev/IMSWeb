import { useCallback, useEffect, useRef, useState } from "react"
import type { RefObject } from "react"
import { useSearchParams } from "react-router"

import {
  getAdminNamecards,
  isApiError,
  type AdminNamecard,
  type AdminNamecardList,
  type AdminNamecardListFilters,
} from "~/lib/api"

export type NamecardQueue = {
  /** URL 里请求的页码（已夹成合法正整数）：分页与「删光当前页就退一页」都用它。 */
  page: number
  cards: AdminNamecard[]
  pageInfo: AdminNamecardList["pageInfo"]
  loading: boolean
  error: boolean
  /** 队列容器的焦点落点：裁决后没有邻居行时回退到这里。 */
  listFocusRef: RefObject<HTMLDivElement | null>
  /** 每次刷新递增：同页的反馈、认领页签据此重读自己的队列。 */
  reloadToken: number
  refresh: () => Promise<void>
  changePage: (nextPage: number) => void
  getFallbackFocus: (card: AdminNamecard) => HTMLElement | null
  /** 版本过期（409/410）时先重取队列，再把原错误抛出交给确认弹窗。 */
  refreshOnStaleError: (cause: unknown) => Promise<never>
}

function loadCards(page: number, filters: AdminNamecardListFilters) {
  return getAdminNamecards(page, filters).send()
}

function isStaleSubmission(error: unknown) {
  return isApiError(error) && (error.status === 409 || error.status === 410)
}

/**
 * 后台两个名片页（投稿审核 / 信息修改）共用的队列状态：从 URL 读页码、取数、
 * 刷新、翻页，以及裁决之后把焦点交还给列表。
 *
 * 筛选值由页面自己从 URL 解析后传进来：两页的筛选条虽然一样，但草稿、
 * 防抖写回与「改筛选就重置页码」都属于筛选条自己的状态。
 */
export function useNamecardQueue(
  filters: AdminNamecardListFilters
): NamecardQueue {
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedPage = Number(searchParams.get("page") ?? "1")
  const page =
    Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1
  const [cards, setCards] = useState<AdminNamecard[]>([])
  const [pageInfo, setPageInfo] = useState<AdminNamecardList["pageInfo"]>({
    page: 1,
    pageSize: 10,
    total: 0,
    totalPages: 0,
    hasNextPage: false,
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const listFocusRef = useRef<HTMLDivElement>(null)
  // 两个页签各自取数：刷新既重载投稿列表，也让同页的其他队列重读一次。
  const [reloadToken, setReloadToken] = useState(0)

  const applyPage = useCallback((next: AdminNamecardList) => {
    setCards(next.data)
    setPageInfo(next.pageInfo)
  }, [])

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(false)
    setReloadToken((token) => token + 1)
    try {
      applyPage(await loadCards(page, filters))
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [applyPage, filters, page])

  useEffect(() => {
    let active = true
    void loadCards(page, filters)
      .then((next) => {
        if (active) applyPage(next)
      })
      .catch(() => {
        if (active) setError(true)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [applyPage, filters, page])

  const changePage = useCallback(
    (nextPage: number) => {
      setLoading(true)
      setError(false)
      const next = new URLSearchParams(searchParams)
      next.set("page", String(Math.max(1, nextPage)))
      setSearchParams(next)
    },
    [searchParams, setSearchParams]
  )

  const getFallbackFocus = useCallback(
    (card: AdminNamecard) => {
      const index = cards.findIndex((item) => item.id === card.id)
      const neighbour = cards[index + 1] ?? cards[index - 1]
      if (neighbour) {
        return document.querySelector<HTMLElement>(
          `[data-namecard-id="${neighbour.id}"] button`
        )
      }
      return listFocusRef.current
    },
    [cards]
  )

  const refreshOnStaleError = useCallback(
    async (cause: unknown): Promise<never> => {
      if (isStaleSubmission(cause)) await refresh()
      throw cause
    },
    [refresh]
  )

  return {
    page,
    cards,
    pageInfo,
    loading,
    error,
    listFocusRef,
    reloadToken,
    refresh,
    changePage,
    getFallbackFocus,
    refreshOnStaleError,
  }
}
