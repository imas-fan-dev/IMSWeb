import { LoaderCircleIcon, MapPinIcon, SearchIcon } from "lucide-react"
import { useId, useRef, useState } from "react"

import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert"
import { Button } from "~/components/ui/button"
import { Field, FieldDescription, FieldLabel } from "~/components/ui/field"
import { Input } from "~/components/ui/input"
import {
  isApiError,
  searchFudabaPlaces,
  type FudabaPlaceSearchResult,
} from "~/lib/api"

function searchError(error: unknown) {
  if (isApiError(error) && error.status === 429) {
    return "地点搜索正忙，请稍后再试。"
  }
  if (isApiError(error) && error.status === 503) {
    return "地点搜索服务尚未配置，请联系管理员。"
  }
  return "地点暂时无法搜索，请稍后再试。"
}

export function ExchangePlaceSearch({
  disabled = false,
  onSelect,
}: {
  disabled?: boolean
  onSelect: (place: FudabaPlaceSearchResult) => void
}) {
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const searching = useRef(false)
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<FudabaPlaceSearchResult[]>([])
  const [attribution, setAttribution] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searched, setSearched] = useState(false)

  async function submit() {
    const search = query.trim()
    if (search.length < 2 || disabled || searching.current) return
    searching.current = true
    setBusy(true)
    setError(null)
    setSearched(false)
    setResults([])
    setAttribution("")
    try {
      const response = await searchFudabaPlaces(search).send()
      setResults(response.items)
      setAttribution(response.attribution)
      setSearched(true)
    } catch (nextError) {
      setResults([])
      setAttribution("")
      setError(searchError(nextError))
    } finally {
      searching.current = false
      setBusy(false)
    }
  }

  function select(place: FudabaPlaceSearchResult) {
    setQuery(place.label)
    setResults([])
    setSearched(false)
    inputRef.current?.focus()
    onSelect(place)
  }

  return (
    <div className="space-y-4">
      <div>
        <Field data-disabled={disabled || undefined}>
          <FieldLabel htmlFor={inputId}>搜索地点</FieldLabel>
          <div className="flex gap-2">
            <Input
              ref={inputRef}
              id={inputId}
              value={query}
              minLength={2}
              maxLength={120}
              disabled={disabled || busy}
              placeholder="场馆、商圈或完整地址"
              onChange={(event) => {
                setQuery(event.currentTarget.value)
                setResults([])
                setSearched(false)
                setError(null)
                setAttribution("")
              }}
              onKeyDown={(event) => {
                if (event.key !== "Enter" || event.nativeEvent.isComposing)
                  return
                event.preventDefault()
                event.stopPropagation()
                void submit()
              }}
            />
            <Button
              type="button"
              variant="outline"
              disabled={disabled || busy || query.trim().length < 2}
              onClick={() => void submit()}
            >
              {busy ? (
                <LoaderCircleIcon className="animate-spin" aria-hidden="true" />
              ) : (
                <SearchIcon aria-hidden="true" />
              )}
              搜索
            </Button>
          </div>
          {attribution ? (
            <FieldDescription>{attribution}</FieldDescription>
          ) : null}
        </Field>
      </div>

      {busy ? (
        <p role="status" className="text-sm text-muted-foreground">
          正在搜索地点
        </p>
      ) : null}
      {searched && !results.length ? (
        <p role="status" className="text-sm text-muted-foreground">
          没有找到地点，请尝试城市加场馆名或完整地址。
        </p>
      ) : null}

      {error ? (
        <Alert variant="destructive">
          <SearchIcon aria-hidden="true" />
          <AlertTitle>搜索失败</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {results.length ? (
        <div
          className="max-h-56 divide-y overflow-y-auto border-y"
          aria-label="地点搜索结果"
        >
          {results.map((place) => (
            <button
              key={place.id}
              type="button"
              className="flex w-full items-start gap-3 px-1 py-3 text-left outline-none hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50"
              disabled={disabled}
              onClick={() => select(place)}
            >
              <MapPinIcon
                className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
              <span className="min-w-0">
                <strong className="block text-sm font-medium">
                  {place.label}
                </strong>
                <span className="mt-1 block text-sm text-muted-foreground">
                  {place.address}
                </span>
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
