import { LoaderCircleIcon, MapPinIcon, SearchIcon } from "lucide-react"
import { useId, useRef } from "react"

import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert"
import { Button } from "~/components/ui/button"
import { Field, FieldDescription, FieldLabel } from "~/components/ui/field"
import { Input } from "~/components/ui/input"
import { type FudabaPlaceSearchResult } from "~/lib/api"
import {
  useExchangePlaceSearch,
  type ExchangePlaceSearchModel,
} from "./hooks/use-exchange-place-search"

export function ExchangePlaceSearch({
  disabled = false,
  onSelect,
  model,
}: {
  disabled?: boolean
  onSelect: (place: FudabaPlaceSearchResult) => void
  model?: ExchangePlaceSearchModel
}) {
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const localModel = useExchangePlaceSearch()
  const {
    query,
    edit,
    results,
    attribution,
    busy,
    error,
    searched,
    submit,
    resetResults,
  } = model ?? localModel

  function select(place: FudabaPlaceSearchResult) {
    edit(place.label)
    if (!model) resetResults(true)
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
                edit(event.currentTarget.value)
                if (!model) resetResults()
              }}
              onKeyDown={(event) => {
                if (event.key !== "Enter" || event.nativeEvent.isComposing)
                  return
                event.preventDefault()
                event.stopPropagation()
                void submit(query, disabled)
              }}
            />
            <Button
              type="button"
              variant="outline"
              disabled={disabled || busy || query.trim().length < 2}
              onClick={() => void submit(query, disabled)}
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
