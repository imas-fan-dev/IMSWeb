import {
  ChevronDownIcon,
  ChevronUpIcon,
  SearchIcon,
  SparklesIcon,
} from "lucide-react"

import type { WikiPublicStories, WikiPublicStoryCard } from "~/lib/api"
import { cn } from "~/lib/utils"

export const GAKUMAS_S_CARD_ALL_CAST = "all" as const

// TODO(wiki-structured-cast): Temporary frontend compatibility for legacy Gakumas
// S-card filter. Cast members are still encoded in subtitle text as
// "出场：...". Delete this mapping and parser after card/cast relations are
// represented by structured API data.
export const GAKUMAS_S_CARD_CAST_OPTIONS = [
  { label: "花海咲季", value: "咲季" },
  { label: "月村手毬", value: "手毬" },
  { label: "藤田琴音", value: "琴音" },
  { label: "有村麻央", value: "麻央" },
  { label: "葛城莉莉娅", value: "莉莉娅" },
  { label: "仓本千奈", value: "千奈" },
  { label: "紫云清夏", value: "清夏" },
  { label: "篠泽广", value: "广" },
  { label: "姬崎莉波", value: "莉波" },
  { label: "花海佑芽", value: "佑芽" },
  { label: "秦谷美铃", value: "美铃" },
  { label: "十王星南", value: "星南" },
  { label: "雨夜燕", value: "燕" },
  { label: "舞蹈教练", value: "舞蹈教练" },
  { label: "声乐教练", value: "声乐教练" },
  { label: "视觉教练", value: "视觉教练" },
  { label: "真城优", value: "真城优" },
] as const

export type GakumasSCardCastFilter =
  | typeof GAKUMAS_S_CARD_ALL_CAST
  | (typeof GAKUMAS_S_CARD_CAST_OPTIONS)[number]["value"]

export interface ClassicSCardCastFilterProps {
  selectedCast: GakumasSCardCastFilter
  collapsed: boolean
  onSelectCast: (cast: GakumasSCardCastFilter) => void
  onToggleCollapsed: () => void
}

export function isGakumasSCardStories(stories: WikiPublicStories) {
  return stories.agency.code === "gk" && stories.idol.folderName === "s_card"
}

export function gakumasSCardMatchesCast(
  card: WikiPublicStoryCard,
  selectedCast: GakumasSCardCastFilter
) {
  if (selectedCast === GAKUMAS_S_CARD_ALL_CAST) return true
  const subtitle = card.subtitle.trim()
  if (!subtitle.startsWith("出场：")) return false
  return subtitle
    .slice("出场：".length)
    .split(/[,，]/)
    .map((name) => name.trim())
    .includes(selectedCast)
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
