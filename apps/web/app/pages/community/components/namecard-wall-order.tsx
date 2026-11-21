import type {
  NamecardCollectionDirection,
  NamecardWallSort,
} from "@imsweb/contracts/namecards"
import {
  ArrowDownNarrowWideIcon,
  ArrowDownWideNarrowIcon,
  ShuffleIcon,
} from "lucide-react"
import { useId } from "react"

import { Button } from "~/components/ui/button"
import { Field, FieldLabel } from "~/components/ui/field"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select"

const ORDER_ITEMS = [
  { value: "random", label: "随机发现" },
  { value: "created", label: "最新发布" },
  { value: "name", label: "制作人名" },
  { value: "series", label: "企划" },
  { value: "date", label: "制作日期" },
] satisfies { value: NamecardWallSort; label: string }[]

export function NamecardWallOrder({
  sort,
  dir,
  onSortChange,
  onDirectionChange,
  onReshuffle,
}: {
  sort: NamecardWallSort
  dir: NamecardCollectionDirection
  onSortChange: (sort: NamecardWallSort) => void
  onDirectionChange: (dir: NamecardCollectionDirection) => void
  onReshuffle: () => void
}) {
  const id = useId()
  return (
    <div className="flex min-w-0 flex-wrap items-end gap-2">
      <Field className="min-w-28 flex-1">
        <FieldLabel htmlFor={id}>排序方式</FieldLabel>
        <Select
          items={ORDER_ITEMS}
          value={sort}
          onValueChange={(value) => {
            if (value && value !== sort) onSortChange(value)
          }}
        >
          <SelectTrigger id={id} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="start">
            <SelectGroup>
              {ORDER_ITEMS.map(({ value, label }) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>
      {sort === "random" ? (
        <Button type="button" variant="outline" onClick={onReshuffle}>
          <ShuffleIcon data-icon="inline-start" aria-hidden="true" />
          换个顺序
        </Button>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-8 shrink-0"
          aria-label={
            dir === "desc" ? "当前降序，切换为升序" : "当前升序，切换为降序"
          }
          onClick={() => onDirectionChange(dir === "desc" ? "asc" : "desc")}
        >
          {dir === "desc" ? (
            <ArrowDownWideNarrowIcon aria-hidden="true" />
          ) : (
            <ArrowDownNarrowWideIcon aria-hidden="true" />
          )}
        </Button>
      )}
    </div>
  )
}
