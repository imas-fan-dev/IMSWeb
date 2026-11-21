import { Checkbox } from "~/components/ui/checkbox"

import { FilterHint } from "./filter-hint"

/**
 * 筛选栏里的一条「复选框 + 说明 tooltip」。
 *
 * 三处匹配口径（同时包含、不含其他、不含越境）共用这一套间距、字号与对齐；
 * 说明不占版面，收在紧随其后的信息图标里。
 */
export function FilterCheckbox({
  checked,
  label,
  hint,
  disabled,
  onCheckedChange,
}: {
  checked: boolean
  label: string
  hint: string
  disabled?: boolean
  onCheckedChange: (checked: boolean) => void
}) {
  return (
    <span className="flex items-center gap-1">
      <label className="flex min-h-7 items-center gap-2 text-sm">
        <Checkbox
          checked={checked}
          disabled={disabled}
          onCheckedChange={(next) => onCheckedChange(next === true)}
        />
        {label}
      </label>
      <FilterHint label={label}>{hint}</FilterHint>
    </span>
  )
}
