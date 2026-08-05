import {
  ChevronDownIcon,
  ChevronUpIcon,
} from "lucide-react"
import { useEffect, useRef, useState, type ReactNode } from "react"

import { WikiTransformedImage } from "~/components/shared/wiki-transformed-image"
import type { WikiPublicCatalog } from "~/lib/api"

import { safeWikiColor } from "~/pages/wiki/wiki-model"

type PublicGroup = NonNullable<WikiPublicCatalog["selection"]>["groups"][number]

export const UNGROUPED_FILTER = "ungrouped" as const

export type WikiGroupFilterValue = Set<number | typeof UNGROUPED_FILTER>

export function WikiGroupFilter({
  groups,
  ungroupedCount,
  value,
  onValueChange,
}: {
  groups: PublicGroup[]
  ungroupedCount: number
  value: WikiGroupFilterValue
  onValueChange: (value: WikiGroupFilterValue) => void
}) {
  const rowRef = useRef<HTMLDivElement>(null)
  const [expanded, setExpanded] = useState(false)
  const [rowHeight, setRowHeight] = useState(0)

  const groupsKey = groups.length + (ungroupedCount > 0 ? 1 : 0)

  // Reset expansion when groups change (render-phase to avoid effect lint)
  const [prevGroupsKey, setPrevGroupsKey] = useState(groupsKey)
  if (prevGroupsKey !== groupsKey) {
    setPrevGroupsKey(groupsKey)
    setExpanded(false)
  }

  // Measure one button height to derive single-row max-height
  useEffect(() => {
    const first = rowRef.current?.firstElementChild
    if (first instanceof HTMLElement) {
      setRowHeight(first.offsetHeight)
    }
  }, [groupsKey])

  const totalButtons = groups.length + (ungroupedCount > 0 ? 1 : 0)
  const showToggle = totalButtons >= 4

  function toggle(id: number | typeof UNGROUPED_FILTER) {
    const next = new Set(value)
    if (next.has(id)) {
      next.delete(id)
    } else {
      next.add(id)
    }
    onValueChange(next)
  }

  return (
    <section
      className="mt-4 border-y bg-muted/20 md:mt-6"
      aria-label="组合与分类筛选"
    >
      <div className="flex flex-col gap-2 py-2 md:gap-3 md:py-3">
        <div className="flex items-center gap-2 md:gap-3">
          <span className="hidden shrink-0 text-xs font-semibold text-muted-foreground sm:block">
            组合/分类
          </span>
          <div
            ref={rowRef}
            className="flex min-w-0 flex-1 flex-wrap gap-1.5 md:gap-2"
            style={
              !expanded && rowHeight > 0
                ? { maxHeight: rowHeight, overflow: "hidden" }
                : undefined
            }
            role="group"
            aria-label="按组合或分类筛选"
          >
            {groups.map((group) => (
              <FilterButton
                key={group.id}
                active={value.has(group.id)}
                color={group.color}
                count={group.idols.length}
                label={group.name}
                onClick={() => toggle(group.id)}
              >
                <span className="relative flex shrink-0 items-center justify-center overflow-hidden rounded-md border bg-background size-8 sm:size-6 md:size-7">
                  <span
                    className="size-2 sm:size-1.5 md:size-2 rounded-full"
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
                active={value.has(UNGROUPED_FILTER)}
                color="#6b7280"
                count={ungroupedCount}
                label="未归档"
                onClick={() => toggle(UNGROUPED_FILTER)}
              >
                <span
                  className="size-2 sm:size-1.5 md:size-2 shrink-0 rounded-full bg-muted-foreground"
                  aria-hidden="true"
                />
              </FilterButton>
            ) : null}
          </div>
        </div>

        {showToggle ? (
          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            className="inline-flex h-7 shrink-0 items-center gap-1 self-end rounded-md px-2 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            aria-expanded={expanded}
          >
            {expanded ? "收起" : "展开全部"}
            {expanded ? (
              <ChevronUpIcon aria-hidden="true" className="size-3.5" />
            ) : (
              <ChevronDownIcon aria-hidden="true" className="size-3.5" />
            )}
          </button>
        ) : null}
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
      aria-pressed={active}
      onClick={onClick}
      className={[
        "inline-flex shrink-0 items-center rounded-md border bg-background font-medium",
        "transition-colors hover:bg-muted",
        "focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
        "h-11 w-11 gap-0 px-0 justify-center text-xs",
        "sm:h-9 sm:w-auto sm:gap-1.5 sm:px-2.5 sm:justify-start sm:text-sm",
        "md:h-10 md:px-3",
      ].join(" ")}
      aria-label={label}
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
      <span className="hidden sm:inline">{label}</span>
      <span className="hidden sm:inline text-xs text-muted-foreground">{count}</span>
    </button>
  )
}
