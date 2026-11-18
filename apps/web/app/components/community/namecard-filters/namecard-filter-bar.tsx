import { useState } from "react"

import {
  ArrowDownIcon,
  ArrowUpIcon,
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
import { Checkbox } from "~/components/ui/checkbox"
import { Field, FieldDescription, FieldLabel } from "~/components/ui/field"
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
import { CharacterMultiSelect } from "~/components/community/character-multi-select"
import {
  SeriesMultiSelect,
  type SeriesOption,
} from "~/components/community/series-multi-select"

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
  /** 【不含越境】：排除企划数为复数的名片。 */
  excludeCross: boolean
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
  excludeCross: false,
}

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

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 md:flex-row md:items-end">
        <Field id={`${id}-search-field`} className="min-w-0 flex-1">
          <FieldLabel htmlFor={`${id}-search`}>搜索制作人</FieldLabel>
          <div className="relative">
            <SearchIcon
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              id={`${id}-search`}
              type="search"
              value={value.q}
              placeholder="制作人名称；团体名片按团体名称"
              disabled={disabled}
              className="pl-9"
              onChange={(event) =>
                onChange({ ...value, q: event.currentTarget.value })
              }
            />
          </div>
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
              <ArrowDownIcon aria-hidden="true" />
            ) : (
              <ArrowUpIcon aria-hidden="true" />
            )}
          </Button>
        </div>
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
          "flex-col gap-4 rounded-lg border p-3 md:flex",
          advancedOpen ? "flex" : "hidden"
        )}
      >
        <CharacterMultiSelect
          id={`${id}-character`}
          catalog={catalog}
          loading={catalogLoading}
          selectedIds={value.characterIds}
          disabled={disabled}
          description="可跨企划选择；搜索支持角色名、别名与组合名。"
          onChange={(characterIds) => onChange({ ...value, characterIds })}
          matchControls={{
            all: value.matchAll,
            excludeOther: value.excludeOther,
            disabled,
            onChange: ({ all, excludeOther }) =>
              onChange({ ...value, matchAll: all, excludeOther }),
          }}
        />

        <SeriesMultiSelect
          id={`${id}-series`}
          series={series}
          required={false}
          selectedCodes={value.seriesCodes}
          disabled={disabled}
          description="按名片上的企划字段筛选，可多选。"
          onChange={(seriesCodes) => onChange({ ...value, seriesCodes })}
        />

        <Field id={`${id}-group-field`}>
          <FieldLabel htmlFor={`${id}-group`}>所属团体</FieldLabel>
          <FieldDescription>
            按编辑窗里的「团体名称」筛选；留空表示不限。
          </FieldDescription>
          <Input
            id={`${id}-group`}
            value={value.group}
            placeholder="例如 765PRO ALLSTARS"
            disabled={disabled}
            onChange={(event) =>
              onChange({ ...value, group: event.currentTarget.value })
            }
          />
        </Field>

        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <label className="flex min-h-9 items-center gap-2 text-sm">
            <Checkbox
              checked={value.excludeCross}
              disabled={disabled}
              aria-label="不含越境"
              onCheckedChange={(next) =>
                onChange({ ...value, excludeCross: next === true })
              }
            />
            不含越境
          </label>
          <span className="text-xs text-muted-foreground">
            隐藏企划字段为复数（越境）的名片
          </span>
        </div>
      </div>
    </div>
  )
}
