import { CheckIcon } from "lucide-react"

import { NAMECARD_SERIES_LIMIT } from "@imsweb/contracts/fudaba/runtime"

import { Badge } from "~/components/ui/badge"
import { Checkbox } from "~/components/ui/checkbox"
import { Field, FieldDescription, FieldLabel } from "~/components/ui/field"
import type { FudabaSeries } from "~/lib/api"

/**
 * A card may sit in several series at once (a crossover print, a set spanning
 * two branches), so this is a checked list rather than the single select the
 * editor used before. The first code stays the primary label on the wall.
 */
export function SeriesMultiSelect({
  id,
  series,
  selectedCodes,
  disabled,
  onChange,
}: {
  id: string
  series: readonly FudabaSeries[]
  selectedCodes: readonly string[]
  disabled: boolean
  onChange: (codes: string[]) => void
}) {
  const selected = new Set(selectedCodes)
  const atLimit = selectedCodes.length >= NAMECARD_SERIES_LIMIT

  function toggle(code: string, checked: boolean) {
    const next = checked
      ? [...selectedCodes, code]
      : selectedCodes.filter((item) => item !== code)
    onChange(next)
  }

  return (
    <Field data-disabled={disabled || undefined}>
      <FieldLabel htmlFor={id}>所属企划</FieldLabel>
      <FieldDescription>
        至少选择一个企划；第一个会作为名片墙上的默认标签（最多{" "}
        {NAMECARD_SERIES_LIMIT} 个）。
      </FieldDescription>
      {selectedCodes.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {selectedCodes.map((code) => {
            const item = series.find((entry) => entry.code === code)
            return (
              <Badge
                key={code}
                variant="outline"
                style={
                  item
                    ? {
                        borderColor: item.color,
                        backgroundColor: `color-mix(in srgb, ${item.color} 12%, transparent)`,
                      }
                    : undefined
                }
              >
                {item?.displayName ?? code}
              </Badge>
            )
          })}
        </div>
      ) : null}
      <div
        id={id}
        role="group"
        aria-label="所属企划"
        className="grid max-h-64 gap-1 overflow-y-auto rounded-lg border p-2 sm:grid-cols-2"
      >
        {series.map((item) => {
          const checked = selected.has(item.code)
          return (
            <label
              key={item.code}
              className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-sm hover:bg-muted/60"
            >
              <Checkbox
                checked={checked}
                disabled={disabled || (!checked && atLimit)}
                onCheckedChange={(next) => toggle(item.code, next === true)}
              />
              <span className="min-w-0 flex-1 truncate">
                {item.displayName}
              </span>
              <span
                aria-hidden="true"
                className="size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: item.color }}
              />
              {checked ? (
                <CheckIcon
                  aria-hidden="true"
                  className="size-3.5 text-muted-foreground"
                />
              ) : null}
            </label>
          )
        })}
      </div>
    </Field>
  )
}
