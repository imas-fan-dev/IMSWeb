import { LayoutGridIcon } from "lucide-react"
import { type CSSProperties, type ReactNode, useEffect, useRef } from "react"

import { WikiTransformedImage } from "~/components/shared/wiki-transformed-image"
import type { WikiPublicCatalog } from "~/lib/api"
import { contrastingWikiText, safeWikiColor } from "~/pages/wiki/wiki-model"

type PublicGroup = NonNullable<WikiPublicCatalog["selection"]>["groups"][number]

export const CLASSIC_UNGROUPED_FILTER = "ungrouped" as const

export type ClassicGroupFilterValue =
  | number
  | typeof CLASSIC_UNGROUPED_FILTER
  | null

interface ClassicGroupFilterProps {
  groups: PublicGroup[]
  ungroupedCount: number
  totalCount: number
  value: ClassicGroupFilterValue
  agencyColor: string
  disabled: boolean
  onValueChange: (value: ClassicGroupFilterValue) => void
}

export function ClassicGroupFilter({
  groups,
  ungroupedCount,
  totalCount,
  value,
  agencyColor,
  disabled,
  onValueChange,
}: ClassicGroupFilterProps) {
  const tabsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (disabled) return
    const activeTab = tabsRef.current?.querySelector<HTMLElement>(
      '[role="tab"][aria-selected="true"]'
    )
    activeTab?.scrollIntoView?.({ block: "nearest", inline: "nearest" })
  }, [disabled, value])

  return (
    <section className="wiki-classic-group-filter" aria-label="组合与分类筛选">
      <span className="wiki-classic-group-filter-label">组合/分类</span>
      <div
        ref={tabsRef}
        className="wiki-classic-group-filter-tabs"
        role="tablist"
        aria-label="按组合或分类筛选"
      >
        <ClassicFilterButton
          active={value === null}
          color={agencyColor}
          count={totalCount}
          label="全部"
          disabled={disabled}
          onClick={() => onValueChange(null)}
        >
          <span className="wiki-classic-group-filter-icon">
            <LayoutGridIcon aria-hidden="true" />
          </span>
        </ClassicFilterButton>

        {groups.map((group) => (
          <ClassicFilterButton
            key={group.id}
            active={value === group.id}
            color={group.color}
            count={group.idols.length}
            label={group.name}
            disabled={disabled}
            onClick={() => onValueChange(group.id)}
          >
            <span className="wiki-classic-group-filter-icon">
              <span
                className="wiki-classic-group-filter-dot"
                style={{ backgroundColor: safeWikiColor(group.color) }}
                aria-hidden="true"
              />
              {group.iconUrl ? (
                <WikiTransformedImage
                  src={group.iconUrl}
                  alt=""
                  transform={group.imageTransform}
                  onError={(event) => {
                    event.currentTarget.hidden = true
                  }}
                />
              ) : null}
            </span>
          </ClassicFilterButton>
        ))}

        {ungroupedCount ? (
          <ClassicFilterButton
            active={value === CLASSIC_UNGROUPED_FILTER}
            color="#6b7280"
            count={ungroupedCount}
            label="未归档"
            disabled={disabled}
            onClick={() => onValueChange(CLASSIC_UNGROUPED_FILTER)}
          >
            <span className="wiki-classic-group-filter-icon">
              <span
                className="wiki-classic-group-filter-dot"
                aria-hidden="true"
              />
            </span>
          </ClassicFilterButton>
        ) : null}
      </div>
    </section>
  )
}

function ClassicFilterButton({
  active,
  color,
  count,
  label,
  disabled,
  children,
  onClick,
}: {
  active: boolean
  color: string
  count: number
  label: string
  disabled: boolean
  children: ReactNode
  onClick: () => void
}) {
  const accent = safeWikiColor(color)

  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      disabled={disabled}
      onClick={onClick}
      className="wiki-classic-group-filter-button"
      style={
        {
          "--filter-color": accent,
          "--filter-on-color": contrastingWikiText(accent),
        } as CSSProperties
      }
    >
      {children}
      <span className="wiki-classic-group-filter-name">{label}</span>
      <span className="wiki-classic-group-filter-count">{count}</span>
    </button>
  )
}
