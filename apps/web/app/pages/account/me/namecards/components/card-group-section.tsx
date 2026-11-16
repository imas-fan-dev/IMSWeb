import { ChevronDownIcon, ChevronRightIcon } from "lucide-react"
import type { ReactNode } from "react"

import { Button } from "~/components/ui/button"
import { cn } from "~/lib/utils"
import {
  cardGroupHeading,
  cardGroupKey,
  cardGroupViewTransitionName,
  DEFAULT_CARD_GROUP_LABEL,
  type CardGroup,
} from "../card-manager-model"
import { cardTileGridClassName } from "../card-tile"

/**
 * 一个分组：组头 + 放置区（瓦片网格）。
 *
 * 有标题的分组：组头始终渲染（折叠后也保留），右侧的折叠按钮在非编辑模式也可用。
 * 默认分组（`title === null`）**不渲染组头**——没有标题可显示，折叠与计数也就没有落点，
 * 只给 section 一个无障碍名称（组内瓦片靠自身网格排列）。瓦片由调用方传入。
 */
export function CardGroupSection({
  group,
  collapsed,
  onToggleCollapsed,
  children,
}: {
  group: CardGroup
  /** 默认分组忽略它：没有组头就没有折叠控件。 */
  collapsed: boolean
  onToggleCollapsed: () => void
  /** 放置区里的瓦片；折叠时整块不渲染。 */
  children: ReactNode
}) {
  const key = cardGroupKey(group)
  const cardsId = `card-group-cards-${key}`
  const heading = cardGroupHeading(group)
  const label = heading ?? DEFAULT_CARD_GROUP_LABEL

  if (!heading) {
    return (
      <section aria-label={label} className="min-w-0">
        <div id={cardsId} className={cardTileGridClassName}>
          {children}
        </div>
      </section>
    )
  }

  const headingId = `card-group-heading-${key}`

  return (
    <section aria-labelledby={headingId} className="min-w-0">
      <div
        className="flex min-w-0 items-center justify-between gap-3 border-b pb-2"
        style={{ viewTransitionName: cardGroupViewTransitionName(group) }}
      >
        <div className="flex min-w-0 items-baseline gap-2">
          <h3
            id={headingId}
            className="truncate text-sm font-medium"
          >
            {label}
          </h3>
          <span className="shrink-0 text-xs text-muted-foreground">
            {group.cards.length} 张
          </span>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-expanded={!collapsed}
          aria-controls={collapsed ? undefined : cardsId}
          aria-label={`${collapsed ? "展开" : "折叠"}${label}`}
          onClick={onToggleCollapsed}
        >
          {collapsed ? (
            <ChevronRightIcon aria-hidden="true" />
          ) : (
            <ChevronDownIcon aria-hidden="true" />
          )}
        </Button>
      </div>
      {collapsed ? null : (
        <div id={cardsId} className={cn("mt-3", cardTileGridClassName)}>
          {children}
        </div>
      )}
    </section>
  )
}
