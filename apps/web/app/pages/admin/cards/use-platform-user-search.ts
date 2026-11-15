import { useCallback, useEffect, useState } from "react"

import { getAdminPlatformUsers, type AdminPlatformUser } from "~/lib/api"
import { useDebouncedValue } from "~/lib/use-debounced-value"

const SEARCH_DELAY = 300
const SEARCH_PAGE_SIZE = 6

export interface PlatformUserSearch {
  /** 输入框的原始值；防抖由 hook 内部负责。 */
  query: string
  setQuery: (value: string) => void
  /** 最近一次检索的结果，即使输入框已清空也保留。 */
  results: AdminPlatformUser[]
  /** 输入框为空时故意隐藏旧结果，避免清空后还挂着上一轮的下拉。 */
  visibleResults: AdminPlatformUser[]
  /** 清空输入与结果，选中或取消归属账号后调用。 */
  reset: () => void
}

/**
 * 归属账号检索：按昵称防抖查询平台账号，暴露输入值与可直接渲染的结果列表。
 */
export function usePlatformUserSearch(): PlatformUserSearch {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<AdminPlatformUser[]>([])
  const debouncedQuery = useDebouncedValue(query, SEARCH_DELAY)

  useEffect(() => {
    const trimmed = debouncedQuery.trim()
    if (!trimmed) return
    let active = true
    void getAdminPlatformUsers({
      query: trimmed,
      field: "display_name",
      pageSize: SEARCH_PAGE_SIZE,
    })
      .send()
      .then((page) => {
        if (active) setResults(page.users)
      })
      .catch(() => {
        if (active) setResults([])
      })
    return () => {
      active = false
    }
  }, [debouncedQuery])

  // 输入一旦清空就隐藏上一轮结果，不在 effect 里回写状态。
  const visibleResults = query.trim() ? results : []

  const reset = useCallback(() => {
    setQuery("")
    setResults([])
  }, [])

  return { query, setQuery, results, visibleResults, reset }
}
