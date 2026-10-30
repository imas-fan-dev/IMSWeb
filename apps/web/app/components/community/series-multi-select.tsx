import { useMemo } from "react"

import { Lock } from "lucide-react"

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
  required = true,
  selectedCodes,
  lockedCodes = [],
  disabled,
  onChange,
}: {
  id: string
  series: readonly FudabaSeries[]
  selectedCodes: readonly string[]
  /** Series of the selected characters; those cannot be unchecked. */
  lockedCodes?: readonly string[]
  /** 后台允许留空，此时不标必填。 */
  required?: boolean
  disabled: boolean
  onChange: (codes: string[]) => void
}) {
  const selected = useMemo(() => new Set(selectedCodes), [selectedCodes])
  const locked = useMemo(() => new Set(lockedCodes), [lockedCodes])
  const atLimit = selectedCodes.length >= NAMECARD_SERIES_LIMIT

  function toggle(code: string, checked: boolean) {
    const next = checked
      ? [...selectedCodes, code]
      : selectedCodes.filter((item) => item !== code)
    onChange(next)
  }

  return (
    <Field data-disabled={disabled || undefined}>
      <FieldLabel htmlFor={id}>
        企划{" "}
        {required ? (
          <span aria-hidden="true" className="text-destructive">*</span>
        ) : null}
      </FieldLabel>
      <FieldDescription>
        担当角色所属的企划会被自动勾选，且不可取消。
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
        aria-label="企划"
        className="series-choice grid max-h-64 grid-cols-2 gap-1 overflow-y-auto rounded-lg border p-2 lg:grid-cols-3"
      >
        {series.map((item) => {
          const isLocked = locked.has(item.code)
          const checked = isLocked || selected.has(item.code)
          return (
            <label
              key={item.code}
              data-locked={isLocked || undefined}
              title={
                isLocked ? "由担当角色决定，不可取消" : undefined
              }
              className={`flex items-center gap-2 rounded-md px-1.5 py-1 text-sm ${
                isLocked
                  ? "bg-muted/60 text-muted-foreground"
                  : "cursor-pointer hover:bg-muted/60"
              }`}
            >
              <Checkbox
                checked={checked}
                disabled={disabled || isLocked || (!checked && atLimit)}
                aria-label={
                  isLocked
                    ? `${item.displayName}（由担当角色决定，不可取消）`
                    : item.displayName
                }
                onCheckedChange={(next) => toggle(item.code, next === true)}
              />
              <span className="min-w-0 flex-1 truncate">
                {item.displayName}
              </span>
              {isLocked ? (
                <Lock
                  aria-hidden="true"
                  className="size-3 shrink-0 text-muted-foreground"
                />
              ) : null}
              <span
                aria-hidden="true"
                className="size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: item.color }}
              />
            </label>
          )
        })}
      </div>
    </Field>
  )
}
