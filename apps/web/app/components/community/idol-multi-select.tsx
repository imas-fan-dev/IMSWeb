import { SearchIcon, XIcon } from "lucide-react"
import { useMemo, useState } from "react"

import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { Checkbox } from "~/components/ui/checkbox"
import { Field, FieldDescription, FieldLabel } from "~/components/ui/field"
import { Input } from "~/components/ui/input"
import { Tabs, TabsList, TabsTrigger } from "~/components/ui/tabs"
import type { WikiPublicSearchEntry } from "~/lib/api"

const MAX_SELECTED_IDOLS = 20

export type IdolSeriesOption = {
  code: string
  displayName: string
  color: string
}

export function IdolMultiSelect({
  id,
  series,
  idols,
  selectedIds,
  disabled,
  onChange,
}: {
  id: string
  series: IdolSeriesOption[]
  idols: WikiPublicSearchEntry[]
  selectedIds: number[]
  disabled: boolean
  onChange: (idolIds: number[]) => void
}) {
  const [activeSeries, setActiveSeries] = useState(series[0]?.code ?? "")
  const [query, setQuery] = useState("")

  const activeSeriesCode = series.some((item) => item.code === activeSeries)
    ? activeSeries
    : (series[0]?.code ?? "")
  const idolById = useMemo(
    () => new Map(idols.map((idol) => [idol.id, idol])),
    [idols]
  )
  const selected = selectedIds
    .map((idolId) => idolById.get(idolId))
    .filter((idol): idol is WikiPublicSearchEntry => Boolean(idol))
  const normalizedQuery = query.trim().toLocaleLowerCase("zh-CN")
  const candidates = idols.filter(
    (idol) =>
      idol.agencyCode === activeSeriesCode &&
      (!normalizedQuery ||
        idol.name.toLocaleLowerCase("zh-CN").includes(normalizedQuery))
  )
  const reachedLimit = selectedIds.length >= MAX_SELECTED_IDOLS

  function toggleIdol(idolId: number, checked: boolean) {
    if (checked) {
      if (selectedIds.includes(idolId) || reachedLimit) return
      onChange([...selectedIds, idolId])
      return
    }
    onChange(selectedIds.filter((id) => id !== idolId))
  }

  return (
    <Field data-disabled={disabled || undefined}>
      <FieldLabel id={`${id}-label`}>担当偶像</FieldLabel>
      <FieldDescription>
        可跨企划选择，最多 {MAX_SELECTED_IDOLS} 人。
      </FieldDescription>

      <div
        className="mt-2 overflow-hidden rounded-lg border bg-background"
        aria-labelledby={`${id}-label`}
      >
        <Tabs
          value={activeSeriesCode}
          onValueChange={(value) => setActiveSeries(String(value ?? ""))}
        >
          <div className="overflow-x-auto border-b p-2">
            <TabsList className="h-9 w-max min-w-full justify-start">
              {series.map((item) => (
                <TabsTrigger
                  key={item.code}
                  value={item.code}
                  disabled={disabled}
                  className="shrink-0"
                >
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: item.color }}
                    aria-hidden="true"
                  />
                  {item.displayName}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
        </Tabs>

        <div className="border-b p-3">
          <div className="relative">
            <SearchIcon
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              id={`${id}-search`}
              type="search"
              value={query}
              placeholder="搜索担当偶像"
              disabled={disabled}
              className="pl-9"
              onChange={(event) => setQuery(event.currentTarget.value)}
            />
          </div>
        </div>

        <div
          className="h-56 overflow-y-auto p-2"
          role="group"
          aria-label="担当偶像候选"
        >
          {candidates.length ? (
            candidates.map((idol) => {
              const checked = selectedIds.includes(idol.id)
              return (
                <label
                  key={idol.id}
                  className="flex min-h-10 cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 hover:bg-muted/60 has-disabled:cursor-not-allowed has-disabled:opacity-60"
                >
                  <Checkbox
                    checked={checked}
                    disabled={disabled || (!checked && reachedLimit)}
                    onCheckedChange={(value) =>
                      toggleIdol(idol.id, value === true)
                    }
                  />
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {idol.name}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {idol.agencyName}
                  </span>
                </label>
              )
            })
          ) : (
            <p className="flex h-full items-center justify-center px-4 text-center text-sm text-muted-foreground">
              当前企划没有匹配的偶像。
            </p>
          )}
        </div>
      </div>

      <div className="mt-3 min-h-8">
        {selected.length ? (
          <div className="flex flex-wrap gap-2" aria-label="已选担当偶像">
            {selected.map((idol) => (
              <Badge key={idol.id} variant="secondary" className="gap-1 pr-1">
                {idol.name}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-5"
                  disabled={disabled}
                  aria-label={`移除担当 ${idol.name}`}
                  title="移除"
                  onClick={() => toggleIdol(idol.id, false)}
                >
                  <XIcon className="size-3" aria-hidden="true" />
                </Button>
              </Badge>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">尚未选择担当偶像。</p>
        )}
      </div>
    </Field>
  )
}
