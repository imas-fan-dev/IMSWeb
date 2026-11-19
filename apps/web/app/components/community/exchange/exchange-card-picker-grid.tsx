import { BadgeCheckIcon } from "lucide-react"

import { CardImage } from "~/components/shared/card-image"
import { namecardPages } from "~/components/shared/namecard-pages"
import { Skeleton } from "~/components/ui/skeleton"
import { cn } from "~/lib/utils"

import {
  isPickerCandidateAvailable,
  PICKER_TARGET_OWNS_REASON,
  type PickerCandidate,
  type PickerGroup,
} from "./exchange-card-picker-model"

/** 瓦片的可访问名：`选择制作人名片 12`；不可用时追加原因。 */
export function exchangeCardPickerTileLabel(card: PickerCandidate): string {
  const label = `选择制作人名片 ${card.cardNumber}`
  return isPickerCandidateAvailable(card)
    ? label
    : `${label}，${PICKER_TARGET_OWNS_REASON}`
}

/**
 * 网格里的一张瓦片：1:1 容器 + 正面缩略图，**不含任何文字**。
 *
 * 选中态用边框与底色（与名片管理的瓦片同一口径）。对方已收下的卡（`targetOwns`）
 * 不能点：照 `CardTile` 的既有做法用 `aria-disabled` 而不是 `disabled` —— 真
 * `disabled` 会把它踢出 Tab 序列、`title` 也播报不稳；点击处理里自己忽略。
 */
function ExchangeCardPickerTile({
  card,
  selected,
  onToggle,
}: {
  card: PickerCandidate
  selected: boolean
  onToggle: (cardNumber: number) => void
}) {
  const available = isPickerCandidateAvailable(card)
  const thumb = namecardPages(card)[0]?.thumb
  return (
    <li className="min-w-0">
      <button
        type="button"
        aria-pressed={available ? selected : undefined}
        aria-disabled={available ? undefined : true}
        aria-label={exchangeCardPickerTileLabel(card)}
        title={available ? undefined : PICKER_TARGET_OWNS_REASON}
        className={cn(
          "w-full min-w-0 rounded-lg border bg-background p-2 transition-colors outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50",
          selected && available && "border-primary bg-accent/40",
          !available && "opacity-70"
        )}
        onClick={() => {
          if (!available) return
          onToggle(card.cardNumber)
        }}
      >
        <span className="relative flex aspect-square items-center justify-center overflow-hidden rounded-md bg-border">
          <CardImage
            src={thumb}
            alt=""
            loading="lazy"
            className="max-h-full max-w-full border border-foreground/25 object-contain"
          />
          {!available ? (
            <span
              className="absolute top-2 left-2 z-10 inline-flex items-center rounded-md bg-background/90 p-1 shadow-sm ring-1 ring-border"
              title={PICKER_TARGET_OWNS_REASON}
            >
              <BadgeCheckIcon
                className="size-3.5 text-muted-foreground"
                aria-hidden="true"
              />
              <span className="sr-only">{PICKER_TARGET_OWNS_REASON}</span>
            </span>
          ) : null}
        </span>
      </button>
    </li>
  )
}

/**
 * 分组网格：默认分组没有组头，自定义分组显示布局里的标题；空分组已经在
 * `groupPickerCards` 里被丢掉，这里按收到的分组原样渲染。
 */
export function ExchangeCardPickerGrid({
  groups,
  selected,
  onToggle,
}: {
  groups: readonly PickerGroup[]
  selected: readonly number[]
  onToggle: (cardNumber: number) => void
}) {
  return (
    <div className="flex flex-col gap-3">
      {groups.map((group) => (
        <section key={group.key} className="flex flex-col gap-2">
          {group.title ? (
            <h3 className="text-xs font-medium text-muted-foreground">
              {group.title}
            </h3>
          ) : null}
          <ul className="grid grid-cols-4 gap-2">
            {group.cards.map((card) => (
              <ExchangeCardPickerTile
                key={card.cardNumber}
                card={card}
                selected={selected.includes(card.cardNumber)}
                onToggle={onToggle}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

/** 加载骨架：占住同一套 4 列格子，避免候选回来时面板高度跳一下。 */
export function ExchangeCardPickerSkeletonGrid() {
  return (
    <ul className="grid grid-cols-4 gap-2" aria-hidden="true">
      {Array.from({ length: 8 }, (_, index) => (
        <li key={index} className="min-w-0">
          <Skeleton className="aspect-square w-full rounded-lg" />
        </li>
      ))}
    </ul>
  )
}
