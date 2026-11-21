import { useEffect, useRef, useState, type FormEvent } from "react"
import { useSearchParams } from "react-router"

import { parsePageParam, type TagLibraryPageInfo } from "./tag-library-model"

/**
 * Per-tab search and paging state, persisted under `prefix + Query` and
 * `prefix + Page` so switching tabs never clears another tab's filters.
 *
 * The applied keyword drives the request; it only reaches the URL on submit so
 * typing pauses do not run a router transition.
 */
export interface TagListState {
  page: number
  appliedQuery: string
  draftQuery: string
  setDraftQuery: (value: string) => void
  scheduleQuery: (value: string) => void
  submitSearch: (event: FormEvent<HTMLFormElement>) => void
  clearKeyword: () => void
  /** Resets the keyword state only; the caller writes the URL it wants. */
  resetKeywordState: () => void
  changePage: (page: number) => void
}

export function useTagListState(
  prefix: "free" | "preset" | "blocklist",
  pageInfo: TagLibraryPageInfo
): TagListState {
  const [searchParams, setSearchParams] = useSearchParams()
  const queryKey = `${prefix}Query`
  const pageKey = `${prefix}Page`
  const queryParam = searchParams.get(queryKey) ?? ""
  const page = parsePageParam(searchParams.get(pageKey))

  const [draftQuery, setDraftQuery] = useState(queryParam)
  const [appliedQuery, setAppliedQuery] = useState(queryParam)
  const queryTimer = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(queryTimer.current), [])

  // A narrower query can leave the list past its last page, which renders as an
  // empty table even though the search has hits. Pull the paging back inside the
  // result set: a search restarts at the first page, a shrunken unfiltered list
  // lands on its last page.
  useEffect(() => {
    const lastPage = Math.max(1, pageInfo.totalPages)
    if (pageInfo.page <= lastPage) return
    const target = appliedQuery ? 1 : lastPage
    if (Math.max(1, page) === target) return
    const next = new URLSearchParams(searchParams)
    if (target <= 1) next.delete(pageKey)
    else next.set(pageKey, String(target))
    setSearchParams(next, { replace: true })
  }, [appliedQuery, page, pageInfo, pageKey, searchParams, setSearchParams])

  /** Records a committed keyword in the URL (share/refresh), without a re-query. */
  function writeQueryParam(next: string) {
    const params = new URLSearchParams(searchParams)
    if (next) params.set(queryKey, next)
    else params.delete(queryKey)
    params.delete(pageKey)
    setSearchParams(params, { replace: true })
  }

  /** Debounces typing into the applied keyword; never touches the URL. */
  function scheduleQuery(next: string) {
    window.clearTimeout(queryTimer.current)
    queryTimer.current = window.setTimeout(
      () => setAppliedQuery(next.trim()),
      300
    )
  }

  /** Enter flushes the keyword immediately and records it in the URL. */
  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    window.clearTimeout(queryTimer.current)
    const trimmed = draftQuery.trim()
    setAppliedQuery(trimmed)
    writeQueryParam(trimmed)
  }

  function clearKeyword() {
    resetKeywordState()
    writeQueryParam("")
  }

  function resetKeywordState() {
    window.clearTimeout(queryTimer.current)
    setDraftQuery("")
    setAppliedQuery("")
  }

  function changePage(nextPage: number) {
    const next = new URLSearchParams(searchParams)
    if (nextPage <= 1) next.delete(pageKey)
    else next.set(pageKey, String(nextPage))
    setSearchParams(next)
  }

  return {
    page,
    appliedQuery,
    draftQuery,
    setDraftQuery,
    scheduleQuery,
    submitSearch,
    clearKeyword,
    resetKeywordState,
    changePage,
  }
}
