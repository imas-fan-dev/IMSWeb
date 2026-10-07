import { useEffect, useRef, useState } from "react"

import {
  isApiError,
  searchFudabaPlaces,
  type FudabaPlaceSearchResult,
} from "~/lib/api"

export function useExchangePlaceSearch() {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<FudabaPlaceSearchResult[]>([])
  const [attribution, setAttribution] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searched, setSearched] = useState(false)
  const [revision, setRevision] = useState(0)
  const request = useRef(0)
  const searching = useRef(false)

  useEffect(
    () => () => {
      request.current += 1
    },
    []
  )

  async function submit(value = query, disabled = false) {
    const nextQuery = value.slice(0, 120)
    const search = nextQuery.trim()
    if (search.length < 2 || disabled || searching.current) return false
    const generation = ++request.current
    searching.current = true
    setQuery(nextQuery)
    setBusy(true)
    setError(null)
    try {
      const response = await searchFudabaPlaces(search).send()
      if (request.current !== generation) return false
      setResults(response.items)
      setAttribution(response.attribution)
      setSearched(true)
      setRevision((current) => current + 1)
    } catch (nextError) {
      if (request.current !== generation) return false
      setError(
        isApiError(nextError) && nextError.status === 429
          ? "地点搜索正忙，请稍后再试。"
          : isApiError(nextError) && nextError.status === 503
            ? "地点搜索服务尚未配置，请联系管理员。"
            : "地点暂时无法搜索，请稍后再试。"
      )
    } finally {
      if (request.current === generation) {
        searching.current = false
        setBusy(false)
      }
    }
    return true
  }

  function edit(value: string) {
    setQuery(value.slice(0, 120))
    setError(null)
  }

  function resetResults(keepAttribution = false) {
    setResults([])
    setSearched(false)
    setError(null)
    setRevision((current) => current + 1)
    if (!keepAttribution) setAttribution("")
  }

  return {
    query,
    edit,
    results,
    attribution,
    busy,
    error,
    searched,
    revision,
    submit,
    resetResults,
  }
}

export type ExchangePlaceSearchModel = ReturnType<typeof useExchangePlaceSearch>
