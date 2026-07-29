import { LayoutGridIcon } from "lucide-react"
import type { ReactNode } from "react"

import { WikiTransformedImage } from "~/components/shared/wiki-transformed-image"
import type { WikiPublicCatalog } from "~/shared/api"

import { safeWikiColor } from "../wiki-model"

type PublicGroup = NonNullable<WikiPublicCatalog["selection"]>["groups"][number]

export const UNGROUPED_FILTER = "ungrouped" as const

export type WikiGroupFilterValue = number | typeof UNGROUPED_FILTER | null

export function WikiGroupFilter({
  groups,
  ungroupedCount,
  totalCount,
  value,
  agencyColor,
  onValueChange,
}: {
  groups: PublicGroup[]
  ungroupedCount: number
  totalCount: number
  value: WikiGroupFilterValue
  agencyColor: string
  onValueChange: (value: WikiGroupFilterValue) => void
}) {
  return (
    <section className="mt-6 border-y bg-muted/20" aria-label="组合与分类筛选">
      <div className="flex items-center gap-3 py-3">
        <span className="hidden shrink-0 text-xs font-semibold text-muted-foreground sm:block">
          组合/分类
        </span>
        <div
          className="flex min-w-0 flex-1 gap-2 overflow-x-auto"
          role="tablist"
          aria-label="按组合或分类筛选"
        >
          <FilterButton
            active={value === null}
            color={agencyColor}
            count={totalCount}
            label="全部"
            onClick={() => onValueChange(null)}
          >
            <span className="flex size-7 shrink-0 items-center justify-center rounded-md border bg-muted/50">
              <LayoutGridIcon className="size-4" aria-hidden="true" />
            </span>
          </FilterButton>

          {groups.map((group) => (
            <FilterButton
              key={group.id}
              active={value === group.id}
              color={group.color}
              count={group.idols.length}
              label={group.name}
              onClick={() => onValueChange(group.id)}
            >
              <span className="relative flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-background">
                <span
                  className="size-2 rounded-full"
                  style={{ backgroundColor: safeWikiColor(group.color) }}
                  aria-hidden="true"
                />
                {group.iconUrl ? (
                  <WikiTransformedImage
                    src={group.iconUrl}
                    alt=""
                    transform={group.imageTransform}
                    className="absolute inset-0 bg-background p-1"
                    onError={(event) => {
                      event.currentTarget.hidden = true
                    }}
                  />
                ) : null}
              </span>
            </FilterButton>
          ))}

          {ungroupedCount ? (
            <FilterButton
              active={value === UNGROUPED_FILTER}
              color="#6b7280"
              count={ungroupedCount}
              label="未归档"
              onClick={() => onValueChange(UNGROUPED_FILTER)}
            >
              <span
                className="size-2 shrink-0 rounded-full bg-muted-foreground"
                aria-hidden="true"
              />
            </FilterButton>
          ) : null}
        </div>
      </div>
    </section>
  )
}

function FilterButton({
  active,
  color,
  count,
  label,
  children,
  onClick,
}: {
  active: boolean
  color: string
  count: number
  label: string
  children: ReactNode
  onClick: () => void
}) {
  const accent = safeWikiColor(color)

  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className="relative flex h-11 shrink-0 items-center gap-2 rounded-md border bg-background px-3 text-sm font-medium transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      style={
        active
          ? {
              borderColor: accent,
              boxShadow: `inset 0 -3px 0 ${accent}`,
            }
          : undefined
      }
    >
      {children}
      <span>{label}</span>
      <span className="text-xs text-muted-foreground">{count}</span>
    </button>
  )
}
