import { useState } from "react"

import {
  ArrowDownNarrowWideIcon,
  ArrowDownWideNarrowIcon,
  ListFilterIcon,
  SearchIcon,
  ShuffleIcon,
} from "lucide-react"

import type { NamecardCharacterCatalog } from "@imsweb/contracts/fudaba/characters"
import type { NamecardCollectionDirection } from "@imsweb/contracts/namecards"

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
import { TagFilterSelect } from "./tag-filter-select"

/**
 * 名片册 / 名片墙共用的筛选状态：纯值，不含排序（各页自己的口径）与
 * 两个「显示」开关（PRD §4）。
 */
export interface NamecardFilterValue {
  /** 制作人名称；团体名片按团体名称检索。 */
  q: string
  characterIds: number[]
  /** 【同时包含】：名片必须包含全部已选角色。 */
  matchAll: boolean
  /** 【不含其他】：名片的担当角色必须全部落在已选里。 */
  excludeOther: boolean
  seriesCodes: string[]
  group: string
  /** 标签筛选：多选，词之间 OR；只有名片墙用。 */
  tags: string[]
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
  characterIds: [],
  matchAll: false,
  excludeOther: false,
  seriesCodes: [],
  group: "",
  tags: [],
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

/**
 * 名片册的筛选控件区（PRD §2 / §4）。
 *
 * 受控：筛选取值来自 `value`、改动回传 `onChange`；排序键、方向与可选项
 * 由各页传入，控件只负责显示与回传。排序与制作人搜索始终可见；其余筛选
 * 收在同一个「筛选」面板里（默认折叠，桌面与移动端一致），展开状态是本组件
 * 的界面状态，不进查询。
 */
export function NamecardFilterBar<TSort extends string>({
  id = "namecard-filters",
  value,
  onChange,
  sort,
  dir,
  sortOptions,
  onSortChange,
  onDirectionChange,
  onReshuffle,
  series,
  catalog,
  catalogLoading = false,
  disabled = false,
  showOwner = true,
  showTags = false,
}: {
  id?: string
  value: NamecardFilterValue
  onChange: (next: NamecardFilterValue) => void
  /** 当前排序键：名片墙与名片册各有自己的取值集合。 */
  sort: TSort
  dir: NamecardCollectionDirection
  /** 当前页面支持的排序项；文案与顺序由调用方决定。 */
  sortOptions: readonly { value: TSort; label: string }[]
  onSortChange: (sort: TSort) => void
  onDirectionChange: (dir: NamecardCollectionDirection) => void
  /** 只有随机排序提供：换成另一轮随机顺序。 */
  onReshuffle?: () => void
  series: readonly SeriesOption[]
  catalog: NamecardCharacterCatalog | null
  catalogLoading?: boolean
  disabled?: boolean
  /**
   * 【所属用户】只在需要它的页面出现：名片册开启，公开名片墙关闭。
   * 其余筛选两边共用。
   */
  showOwner?: boolean
  /** 标签筛选只在名片墙出现（名片册没有这个查询参数）。 */
  showTags?: boolean
}) {
  const [filtersOpen, setFiltersOpen] = useState(false)
  // 清空筛选时换 key 重挂角色选择器，把它的搜索框、企划与分类也一起复位。
  const [resetToken, setResetToken] = useState(0)
  // 任一筛选项生效就把触发按钮标成「已应用」，与旧名片墙文案一致。
  const filtersApplied =
    value.q.trim() !== "" ||
    value.characterIds.length > 0 ||
    value.seriesCodes.length > 0 ||
    value.tags.length > 0 ||
    value.group.trim() !== "" ||
    value.owner !== null ||
    value.matchAll ||
    value.excludeOther ||
    value.excludeCross ||
    value.invert ||
    value.declaration !== null

  /** 只清筛选；排序键与方向归调用方持有，不在这里动。 */
  function resetFilters() {
    setResetToken((current) => current + 1)
    onChange({ ...DEFAULT_NAMECARD_FILTERS })
  }

  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-end gap-2">
          <Field className="min-w-28 flex-1">
            <FieldLabel htmlFor={`${id}-sort`}>排序方式</FieldLabel>
            <Select
              items={sortOptions}
              value={sort}
              disabled={disabled}
              onValueChange={(next) => {
                if (next && next !== sort) onSortChange(next)
              }}
            >
              <SelectTrigger id={`${id}-sort`} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="start">
                <SelectGroup>
                  {sortOptions.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          {sort === "random" && onReshuffle ? (
            <Button
              type="button"
              variant="outline"
              disabled={disabled}
              onClick={onReshuffle}
            >
              <ShuffleIcon data-icon="inline-start" aria-hidden="true" />
              换个顺序
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-8 shrink-0"
              disabled={disabled}
              aria-label={
                dir === "desc" ? "当前降序，切换为升序" : "当前升序，切换为降序"
              }
              title={dir === "desc" ? "降序" : "升序"}
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

        <Button
          type="button"
          variant="outline"
          aria-expanded={filtersOpen}
          aria-controls={`${id}-panel`}
          onClick={() => setFiltersOpen((current) => !current)}
        >
          <ListFilterIcon data-icon="inline-start" aria-hidden="true" />
          {filtersApplied ? "筛选（已应用）" : "筛选"}
        </Button>
      </div>

      <div
        id={`${id}-panel`}
        className={cn(
          "mt-3 flex-col gap-3 rounded-lg border p-3",
          filtersOpen ? "flex" : "hidden"
        )}
      >
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

            {showTags ? (
              <div className="min-w-0 md:w-80 lg:w-96">
                <TagFilterSelect
                  id={`${id}-tags`}
                  value={value.tags}
                  disabled={disabled}
                  onChange={(tags) => onChange({ ...value, tags })}
                />
              </div>
            ) : null}

            {showOwner ? (
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
            ) : null}

            <Button
              type="button"
              variant="ghost"
              className="max-md:hidden md:ml-auto"
              onClick={resetFilters}
            >
              清空筛选
            </Button>
          </div>

        <div className="flex flex-col gap-3 md:flex-row md:items-start">
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

        {/* 移动端把清空放在展开面板底部，拇指够得着；桌面在筛选行里。 */}
        <Button
          type="button"
          variant="ghost"
          className="w-full md:hidden"
          onClick={resetFilters}
        >
          清空筛选
        </Button>
      </div>
    </div>
  )
}
