import {
  ChevronDownIcon,
  ChevronUpIcon,
  SearchIcon,
  SparklesIcon,
} from "lucide-react"

import { cn } from "~/lib/utils"
import {
  GAKUMAS_S_CARD_ALL_CAST,
  GAKUMAS_S_CARD_CAST_OPTIONS,
  type GakumasSCardCastFilter,
} from "~/pages/wiki/gakumas-s-card-cast-model"

export interface ClassicSCardCastFilterProps {
  selectedCast: GakumasSCardCastFilter
  collapsed: boolean
  onSelectCast: (cast: GakumasSCardCastFilter) => void
  onToggleCollapsed: () => void
}

export function ClassicSCardCastFilter({
  selectedCast,
  collapsed,
  onSelectCast,
  onToggleCollapsed,
}: ClassicSCardCastFilterProps) {
  return (
    <section
      className="wiki-classic-s-card-filter"
      aria-label="出场偶像快速筛选"
      data-temporary-compatibility="subtitle-cast-filter"
    >
      <button
        type="button"
        className="wiki-classic-s-card-filter-toggle"
        aria-expanded={!collapsed}
        aria-controls="wiki-classic-s-card-filter-options"
        onClick={onToggleCollapsed}
      >
        <SearchIcon aria-hidden="true" />
        <strong>出场偶像快速筛选</strong>
        <span>
          {collapsed ? "展开" : "收起"}
          {collapsed ? (
            <ChevronDownIcon aria-hidden="true" />
          ) : (
            <ChevronUpIcon aria-hidden="true" />
          )}
        </span>
      </button>

      {!collapsed ? (
        <div
          id="wiki-classic-s-card-filter-options"
          className="wiki-classic-s-card-filter-options"
          role="group"
          aria-label="按登场偶像筛选"
        >
          <button
            type="button"
            className={cn(
              selectedCast === GAKUMAS_S_CARD_ALL_CAST && "is-active"
            )}
            aria-pressed={selectedCast === GAKUMAS_S_CARD_ALL_CAST}
            onClick={() => onSelectCast(GAKUMAS_S_CARD_ALL_CAST)}
          >
            <SparklesIcon aria-hidden="true" />
            全部显示
          </button>
          {GAKUMAS_S_CARD_CAST_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={cn(selectedCast === option.value && "is-active")}
              aria-pressed={selectedCast === option.value}
              onClick={() => onSelectCast(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
    </section>
  )
}
