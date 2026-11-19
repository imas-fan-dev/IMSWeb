import { useState } from "react"

import {
  ArrowDownNarrowWideIcon,
  ArrowDownWideNarrowIcon,
  ChevronDownIcon,
  SearchIcon,
  SlidersHorizontalIcon,
} from "lucide-react"

import type { NamecardCharacterCatalog } from "@imsweb/contracts/fudaba/characters"
import type {
  NamecardCollectionDirection,
  NamecardCollectionSort,
} from "@imsweb/contracts/namecards"

import { Button } from "~/components/ui/button"
import { Field, FieldLabel } from "~/components/ui/field"
import { Input } from "~/components/ui/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select"
import { NAMECARD_COLLECTION_DEFAULT_DIRECTION } from "~/lib/namecards/collection-query"
import { cn } from "~/lib/utils"
import type { SeriesOption } from "~/components/community/series-multi-select"

import { CharacterFilterSelect } from "./character-filter-select"
import { ClearInputButton } from "./clear-input-button"
import { FilterCheckbox } from "./filter-checkbox"
import {
  OwnerFilterSelect,
  type NamecardOwnerSelection,
} from "./owner-filter-select"
import { SeriesFilterSelect } from "./series-filter-select"

/** 名片册 / 名片墙共用的筛选状态：纯值，不含两个「显示」开关（PRD §4）。 */
export interface NamecardFilterValue {
  /** 制作人名称；团体名片按团体名称检索。 */
  q: string
  sort: NamecardCollectionSort
  dir: NamecardCollectionDirection
  characterIds: number[]
  /** 【同时包含】：名片必须包含全部已选角色。 */
  matchAll: boolean
  /** 【不含其他】：名片的担当角色必须全部落在已选里。 */
  excludeOther: boolean
  seriesCodes: string[]
  group: string
  /** 所属用户：只看该卡主名下的名片；`null` 表示不限。 */
  owner: NamecardOwnerSelection | null
  /** 【不含越境】：排除企划数为复数的名片。 */
  excludeCross: boolean
  /** 【反向排除】：把上方全部内容条件整体取反。 */
  invert: boolean
  /** 创作声明：`original` / `ai`，`null` 表示不限。 */
  declaration: "original" | "ai" | null
}

export const DEFAULT_NAMECARD_FILTERS: NamecardFilterValue = {
  q: "",
  sort: "exchange",
  dir: NAMECARD_COLLECTION_DEFAULT_DIRECTION.exchange,
  characterIds: [],
  matchAll: false,
  excludeOther: false,
  seriesCodes: [],
  group: "",
  owner: null,
  excludeCross: false,
  invert: false,
  declaration: null,
}

const DECLARATION_ITEMS = [
  { value: "any", label: "不限" },
  { value: "original", label: "原创" },
  { value: "ai", label: "AI" },
]

function sortItems(timeLabel: string) {
  return [
    { value: "exchange", label: timeLabel },
    { value: "name", label: "制作人名" },
    { value: "series", label: "企划" },
    { value: "date", label: "制作日期" },
  ]
}

/**
 * 名片册的筛选控件区（PRD §2 / §4）。
 *
 * 受控：所有取值来自 `value`，改动一律回传 `onChange`，控件自己不记状态
 * （高级筛选面板的展开与收拢是本组件的界面状态，不进查询）。名片墙复用同一份
 * 组件时用 `timeLabel` 把「交换时间」换成「创建时间」。
 */
export function NamecardFilterBar({
  id = "namecard-filters",
  value,
  onChange,
  timeLabel = "交换时间",
  series,
  catalog,
  catalogLoading = false,
  disabled = false,
}: {
  id?: string
  value: NamecardFilterValue
  onChange: (next: NamecardFilterValue) => void
  /** 排序里「交换时间」那一条的文案；名片墙传「创建时间」。 */
  timeLabel?: string
  series: readonly SeriesOption[]
  catalog: NamecardCharacterCatalog | null
  catalogLoading?: boolean
  disabled?: boolean
}) {
  const [advancedOpen, setAdvancedOpen] = useState(false)
  // 清空筛选时换 key 重挂角色选择器，把它的搜索框、企划与分类也一起复位。
  const [resetToken, setResetToken] = useState(0)
  const advancedCount =
    value.characterIds.length +
    value.seriesCodes.length +
    (value.group.trim() ? 1 : 0) +
    (value.excludeCross ? 1 : 0)

  function changeSort(sort: string) {
    const next = sort as NamecardCollectionSort
    if (next === value.sort) return
    // 换排序键就回到该键的默认方向，避免「按名称 + 倒序」这种意外组合。
    onChange({
      ...value,
      sort: next,
      dir: NAMECARD_COLLECTION_DEFAULT_DIRECTION[next],
    })
  }

  /** 只清筛选，保留排序键与方向。 */
  function resetFilters() {
    setResetToken((current) => current + 1)
    onChange({
      ...DEFAULT_NAMECARD_FILTERS,
      sort: value.sort,
      dir: value.dir,
    })
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 md:flex-row md:items-end">
        <Field id={`${id}-search-field`} className="min-w-0 flex-1">
          <FieldLabel htmlFor={`${id}-search`}>制作人名称</FieldLabel>
          <div className="relative">
            <SearchIcon
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              id={`${id}-search`}
              type="text"
              value={value.q}
              placeholder="搜索制作人名称"
              disabled={disabled}
              className="pr-8 pl-9"
              onChange={(event) =>
                onChange({ ...value, q: event.currentTarget.value })
              }
            />
            {value.q ? (
              <ClearInputButton
                label="清空制作人名称"
                onClick={() => onChange({ ...value, q: "" })}
              />
            ) : null}
          </div>
        </Field>

        <Field id={`${id}-owner-field`} className="min-w-0 md:w-56">
          <FieldLabel htmlFor={`${id}-owner`}>所属用户</FieldLabel>
          <OwnerFilterSelect
            key={resetToken}
            id={`${id}-owner`}
            value={value.owner}
            disabled={disabled}
            onChange={(owner) => onChange({ ...value, owner })}
          />
        </Field>

        <div className="flex items-end gap-2">
          <Field className="min-w-0">
            <FieldLabel htmlFor={`${id}-sort`}>排序方式</FieldLabel>
            <Select
              items={sortItems(timeLabel)}
              value={value.sort}
              disabled={disabled}
              onValueChange={(next) => changeSort(String(next))}
            >
              <SelectTrigger id={`${id}-sort`} className="w-full min-w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="start">
                <SelectGroup>
                  {sortItems(timeLabel).map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-8 shrink-0"
            disabled={disabled}
            aria-label={
              value.dir === "desc"
                ? "当前降序，切换为升序"
                : "当前升序，切换为降序"
            }
            title={value.dir === "desc" ? "降序" : "升序"}
            onClick={() =>
              onChange({
                ...value,
                dir: value.dir === "desc" ? "asc" : "desc",
              })
            }
          >
            {value.dir === "desc" ? (
              <ArrowDownWideNarrowIcon aria-hidden="true" />
            ) : (
              <ArrowDownNarrowWideIcon aria-hidden="true" />
            )}
          </Button>
        </div>

        <Button
          type="button"
          variant="ghost"
          className="md:ml-auto"
          onClick={resetFilters}
        >
          清空筛选
        </Button>
      </div>

      <Button
        type="button"
        variant="outline"
        className="justify-center gap-2 md:hidden"
        aria-expanded={advancedOpen}
        aria-controls={`${id}-advanced`}
        onClick={() => setAdvancedOpen((current) => !current)}
      >
        <SlidersHorizontalIcon aria-hidden="true" />
        高级筛选
        {advancedCount ? `（${advancedCount}）` : ""}
        <ChevronDownIcon
          aria-hidden="true"
          className={cn("transition-transform", advancedOpen && "rotate-180")}
        />
      </Button>

      <div
        id={`${id}-advanced`}
        className={cn(
          "flex-col gap-3 rounded-lg border p-3 md:flex md:flex-row md:items-start",
          advancedOpen ? "flex" : "hidden"
        )}
      >
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="flex flex-col gap-3 md:flex-row md:items-end">
            <div className="min-w-0 md:flex-1">
              <CharacterFilterSelect
                key={resetToken}
                id={`${id}-character`}
                catalog={catalog}
                loading={catalogLoading}
                selectedIds={value.characterIds}
                disabled={disabled}
                onChange={(characterIds) =>
                  onChange({ ...value, characterIds })
                }
              />
            </div>
          </div>

          <div className="flex flex-col gap-3 md:flex-row md:items-end">
            <div className="min-w-0 md:flex-1">
              <SeriesFilterSelect
                id={`${id}-series`}
                series={series}
                selectedCodes={value.seriesCodes}
                disabled={disabled}
                onChange={(seriesCodes) => onChange({ ...value, seriesCodes })}
              />
            </div>
            <div className="min-w-0 md:w-48">
              <Field id={`${id}-group-field`}>
                <FieldLabel htmlFor={`${id}-group`}>所属团体</FieldLabel>
                <div className="relative">
                  <Input
                    id={`${id}-group`}
                    value={value.group}
                    placeholder="搜索团体名称"
                    disabled={disabled}
                    className="pr-8"
                    onChange={(event) =>
                      onChange({ ...value, group: event.currentTarget.value })
                    }
                  />
                  {value.group ? (
                    <ClearInputButton
                      label="清空所属团体"
                      onClick={() => onChange({ ...value, group: "" })}
                    />
                  ) : null}
                </div>
              </Field>
            </div>
            <div className="min-w-0 md:w-32">
              <Field id={`${id}-declaration-field`}>
                <FieldLabel htmlFor={`${id}-declaration`}>创作声明</FieldLabel>
                <Select
                  items={DECLARATION_ITEMS}
                  value={value.declaration ?? "any"}
                  disabled={disabled}
                  onValueChange={(next) =>
                    onChange({
                      ...value,
                      declaration:
                        next === "original" || next === "ai" ? next : null,
                    })
                  }
                >
                  <SelectTrigger id={`${id}-declaration`} className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent align="start">
                    <SelectGroup>
                      {DECLARATION_ITEMS.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
            </div>
          </div>
        </div>

        <div className="flex flex-row flex-wrap items-center justify-between gap-y-1 md:w-40 md:flex-col md:items-center md:justify-around md:self-stretch">
          <FilterCheckbox
            checked={value.matchAll}
            disabled={disabled}
            label="同时包含"
            hint="名片必须包含全部已选角色"
            onCheckedChange={(matchAll) => onChange({ ...value, matchAll })}
          />
          <FilterCheckbox
            checked={value.excludeOther}
            disabled={disabled}
            label="不含其他"
            hint="名片最多只包含已选角色"
            onCheckedChange={(excludeOther) =>
              onChange({ ...value, excludeOther })
            }
          />
          <FilterCheckbox
            checked={value.excludeCross}
            disabled={disabled}
            label="不含越境"
            hint="隐藏企划字段为复数（越境）的名片"
            onCheckedChange={(excludeCross) =>
              onChange({ ...value, excludeCross })
            }
          />
          <FilterCheckbox
            checked={value.invert}
            disabled={disabled}
            label="反向排除"
            hint="排除符合上方筛选条件的名片"
            onCheckedChange={(invert) => onChange({ ...value, invert })}
          />
        </div>
      </div>
    </div>
  )
}
