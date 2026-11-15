import { SearchIcon } from "lucide-react"

import { Checkbox } from "~/components/ui/checkbox"
import { Input } from "~/components/ui/input"
import { cn } from "~/lib/utils"

/** 勾选式筛选组的候选项：`value` 进查询，`label` 只用于展示。 */
export interface FilterCheckboxItem {
  value: string
  label: string
}

/**
 * 筛选条里的搜索框：标签在上、输入框在下，放大镜图标绝对定位在输入框左侧。
 * 默认 `w-56`，与筛选条里其他控件同宽。
 */
export function SearchField({
  label,
  placeholder,
  value,
  onChange,
  className = "w-56",
}: {
  label: string
  placeholder: string
  value: string
  onChange: (value: string) => void
  className?: string
}) {
  return (
    <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
      {label}
      <div className="relative">
        <SearchIcon
          className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          value={value}
          placeholder={placeholder}
          className={cn(className, "pl-8")}
          onChange={(event) => onChange(event.currentTarget.value)}
        />
      </div>
    </label>
  )
}

/**
 * 筛选条里的勾选组：每个勾选互相独立，全选与全不选的语义由调用方决定。
 */
export function CheckboxFilterGroup({
  label,
  items,
  values,
  onToggle,
}: {
  label: string
  items: readonly FilterCheckboxItem[]
  values: readonly string[]
  onToggle: (value: string, checked: boolean) => void
}) {
  return (
    <div className="flex flex-col gap-1.5 text-xs text-muted-foreground">
      <span>{label}</span>
      <div className="flex h-9 items-center gap-4">
        {items.map((item) => (
          <label
            key={item.value}
            className="flex items-center gap-1.5 text-sm text-foreground"
          >
            <Checkbox
              checked={values.includes(item.value)}
              onCheckedChange={(checked) =>
                onToggle(item.value, checked === true)
              }
            />
            {item.label}
          </label>
        ))}
      </div>
    </div>
  )
}
