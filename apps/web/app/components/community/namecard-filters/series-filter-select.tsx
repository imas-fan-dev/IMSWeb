import { XIcon } from "lucide-react"
import { useMemo, useState } from "react"

import { NAMECARD_SERIES_LIMIT } from "@imsweb/contracts/fudaba/runtime"

import type { SeriesOption } from "~/components/community/series-multi-select"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { Checkbox } from "~/components/ui/checkbox"
import { Field, FieldLabel } from "~/components/ui/field"
import { Input } from "~/components/ui/input"

import { ClearInputButton } from "./clear-input-button"
import { useFilterPopover } from "./use-filter-popover"

/**
 * 名片册 / 名片墙筛选栏的紧凑版企划选择器。
 *
 * 与担当角色同一形态：输入框里排已选企划 badge，候选列表收在输入框下面；
 * 候选来自调用方给的企划目录，不发任何请求。说明文字换成了 placeholder。
 */
export function SeriesFilterSelect({
  id,
  series,
  selectedCodes,
  disabled,
  onChange,
}: {
  id: string
  series: readonly SeriesOption[]
  selectedCodes: readonly string[]
  disabled: boolean
  onChange: (codes: string[]) => void
}) {
  const [query, setQuery] = useState("")
  const { open, setOpen, rootRef, rootProps } = useFilterPopover()

  const normalizedQuery = query.trim().toLocaleLowerCase("zh-CN")
  const atLimit = selectedCodes.length >= NAMECARD_SERIES_LIMIT
  const selected = useMemo(() => new Set(selectedCodes), [selectedCodes])
  const matched = normalizedQuery
    ? series.filter(
        (item) =>
          item.displayName
            .toLocaleLowerCase("zh-CN")
            .includes(normalizedQuery) ||
          item.code.toLocaleLowerCase("zh-CN").includes(normalizedQuery)
      )
    : series

  function changeSeries(code: string, checked: boolean) {
    onChange(
      checked
        ? [...selectedCodes, code]
        : selectedCodes.filter((current) => current !== code)
    )
  }

  return (
    <Field id={id} data-disabled={disabled || undefined}>
      <FieldLabel id={`${id}-label`}>
        企划
        <span className="ml-1 text-xs font-normal text-muted-foreground">
          ({selectedCodes.length}/{NAMECARD_SERIES_LIMIT})
        </span>
      </FieldLabel>

      <div ref={rootRef} className="relative" {...rootProps}>
        <div
          className="flex flex-wrap items-center gap-1.5 rounded-lg border bg-background p-0.5 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50"
          aria-labelledby={`${id}-label`}
        >
          {selectedCodes.map((code) => {
            const item = series.find((entry) => entry.code === code)
            return (
              <Badge
                key={code}
                variant="outline"
                className="max-w-full gap-0.5 pr-0.5"
                style={
                  item
                    ? {
                        borderColor: item.color,
                        backgroundColor: `color-mix(in srgb, ${item.color} 12%, transparent)`,
                      }
                    : undefined
                }
              >
                <span className="truncate">{item?.displayName ?? code}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="size-4"
                  disabled={disabled}
                  aria-label={`移除企划 ${item?.displayName ?? code}`}
                  title="移除"
                  onClick={() => changeSeries(code, false)}
                >
                  <XIcon aria-hidden="true" />
                </Button>
              </Badge>
            )
          })}

          <div className="relative min-w-24 flex-1">
            <Input
              id={`${id}-search`}
              type="text"
              value={query}
              placeholder="搜索企划"
              disabled={disabled}
              aria-label="搜索企划"
              aria-expanded={open}
              aria-controls={open ? `${id}-candidates` : undefined}
              className="h-7 border-0 bg-transparent pr-7 focus-visible:border-0 focus-visible:ring-0 dark:bg-transparent"
              onFocus={() => setOpen(true)}
              onChange={(event) => {
                setQuery(event.currentTarget.value)
                setOpen(true)
              }}
            />
            {query ? (
              <ClearInputButton
                label="清空企划搜索"
                className="right-0"
                onClick={() => {
                  setQuery("")
                  setOpen(true)
                }}
              />
            ) : null}
          </div>

          {selectedCodes.length > 0 || query ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="shrink-0 text-muted-foreground"
              disabled={disabled}
              aria-label="清空企划"
              title="清空"
              onClick={() => {
                setQuery("")
                onChange([])
              }}
            >
              <XIcon aria-hidden="true" />
            </Button>
          ) : null}
        </div>

        {open ? (
          <div
            id={`${id}-candidates`}
            className="absolute inset-x-0 top-full z-20 mt-1 overflow-hidden rounded-lg border bg-background shadow-lg"
          >
            <div
              className="max-h-56 overflow-y-auto overscroll-contain p-2"
              role="group"
              aria-label="企划候选"
            >
              {matched.length === 0 ? (
                <p className="px-2 py-4 text-center text-sm text-muted-foreground">
                  没有匹配的企划。
                </p>
              ) : (
                matched.map((item) => {
                  const checked = selected.has(item.code)
                  return (
                    <label
                      key={item.code}
                      className="flex min-h-9 cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-muted/60 has-disabled:cursor-not-allowed has-disabled:opacity-60"
                    >
                      <Checkbox
                        checked={checked}
                        disabled={disabled || (!checked && atLimit)}
                        onCheckedChange={(next) =>
                          changeSeries(item.code, next === true)
                        }
                      />
                      <span className="min-w-0 flex-1 truncate">
                        {item.displayName}
                      </span>
                      <span
                        aria-hidden="true"
                        className="size-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: item.color }}
                      />
                    </label>
                  )
                })
              )}
            </div>
          </div>
        ) : null}
      </div>
    </Field>
  )
}
