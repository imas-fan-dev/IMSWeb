import { LoaderCircleIcon, MapPinIcon, SearchIcon } from "lucide-react"
import { useState } from "react"

import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert"
import { Button } from "~/components/ui/button"
import { Field, FieldDescription, FieldLabel } from "~/components/ui/field"
import { Input } from "~/components/ui/input"
import {
  isApiError,
  searchFudabaPlaces,
  type FudabaPlaceSearchResult,
} from "~/lib/api"
import type { OfficeDraft } from "./office-location-model"

function searchError(error: unknown) {
  if (isApiError(error) && error.status === 429) {
    return "地点搜索正忙，请稍后再试。"
  }
  if (isApiError(error) && error.status === 503) {
    return "地点搜索尚未开放。"
  }
  return "地点暂时无法搜索，请稍后再试。"
}

export function OfficePlaceSearch({
  draft,
  disabled,
  onChange,
}: {
  draft: OfficeDraft
  disabled: boolean
  onChange: (draft: OfficeDraft) => void
}) {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<FudabaPlaceSearchResult[]>([])
  const [attribution, setAttribution] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    const search = query.trim()
    if (search.length < 2 || busy) return
    setBusy(true)
    setError(null)
    try {
      const response = await searchFudabaPlaces(search).send()
      setResults(response.items)
      setAttribution(response.attribution)
    } catch (nextError) {
      setResults([])
      setAttribution("")
      setError(searchError(nextError))
    } finally {
      setBusy(false)
    }
  }

  function select(place: FudabaPlaceSearchResult) {
    onChange({
      ...draft,
      city: place.city,
      address: place.address,
      latitude: String(place.location.latitude),
      longitude: String(place.location.longitude),
    })
    setQuery(place.label)
    setResults([])
  }

  const hasLocation = Boolean(
    draft.address && draft.latitude && draft.longitude
  )

  return (
    <div className="space-y-4">
      <div>
        <Field data-disabled={disabled || undefined}>
          <FieldLabel htmlFor="fudaba-office-place-search">搜索地点</FieldLabel>
          <div className="flex gap-2">
            <Input
              id="fudaba-office-place-search"
              value={query}
              minLength={2}
              maxLength={120}
              disabled={disabled || busy}
              placeholder="场馆、商圈或完整地址"
              onChange={(event) => setQuery(event.currentTarget.value)}
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

      {error ? (
        <Alert variant="destructive">
          <SearchIcon aria-hidden="true" />
          <AlertTitle>搜索失败</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {results.length ? (
        <div className="divide-y border-y" aria-label="地点搜索结果">
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

      {hasLocation ? (
        <Alert>
          <MapPinIcon aria-hidden="true" />
          <AlertTitle>已选择地点</AlertTitle>
          <AlertDescription>{draft.address}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  )
}
