import {
  CalendarIcon,
  EyeOffIcon,
  ZapIcon,
} from "lucide-react"

import { NAMECARD_REVIEW_LABELS } from "~/components/community/namecard-status-labels"
import { Badge } from "~/components/ui/badge"
import type { FudabaOwnerCard } from "~/lib/api"
import { cardTimeLabel } from "~/lib/namecards/dates"
import { cn } from "~/lib/utils"
import { publicationLabels } from "./card-model"
import { OwnerCardImage } from "./owner-card-image"

/** The inventory tile follows the revision the owner is reviewing. */
export function inventoryProducerName(card: FudabaOwnerCard): string {
  return card.reviewStatus === "pending" && card.pendingContent
    ? card.pendingContent.producerName
    : card.producerName
}

export function inventoryCoverUrl(card: FudabaOwnerCard): string {
  return card.reviewStatus === "pending" && card.pendingContent?.frontImageUrl
    ? card.pendingContent.frontImageUrl
    : card.frontImageUrl
}

export function PublicationBadge({ card }: { card: FudabaOwnerCard }) {
  const status = card.publicationStatus
  // A published card keeps serving the old copy while a revision is decided, so
  // the badge reports the revision instead of the card-level status.
  const review = status === "published" ? card.reviewStatus : null
  return (
    <Badge
      variant={
        status === "rejected" || review === "rejected" || review === "locked"
          ? "destructive"
          : "secondary"
      }
      className={cn(
        status === "published" &&
          !review &&
          "bg-success/20 text-success-foreground",
        review === "pending" && "bg-pending/20 text-pending-foreground"
      )}
    >
      {review ? NAMECARD_REVIEW_LABELS[review] : publicationLabels[status]}
    </Badge>
  )
}

/** 属主视角的三态：自动交换 / 手动交换 / 仅展示。 */
const EXCHANGE_MODE_LABELS = {
  auto: "自动交换",
  manual: "手动交换",
  none: "仅展示",
} as const

export function ExchangeModeBadge({
  mode,
}: {
  mode: FudabaOwnerCard["exchangeMode"]
}) {
  return (
    <Badge
      variant={
        mode === "none" ? "outline" : mode === "manual" ? "secondary" : "default"
      }
    >
      {EXCHANGE_MODE_LABELS[mode]}
    </Badge>
  )
}

/**
 * 名片瓦片：1:1 缩略图容器 + 角标 + 元信息。
 *
 * 缩略图用 `object-contain`（名片多为 90×50 / 90×54 mm，固定比例裁切会切掉内容，
 * 理由见 `NamecardMediaPreview` 的注释），容器底色用卡片 accent 兜住留白。
 */
export function CardTile({
  card,
  inQuickExchange = false,
  selected = false,
  onSelect,
}: {
  card: FudabaOwnerCard
  inQuickExchange?: boolean
  selected?: boolean
  onSelect: () => void
}) {
  const time = cardTimeLabel(card)
  return (
    <button
      type="button"
      className={cn(
        "min-w-0 rounded-lg border bg-background p-2 text-left transition-colors outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50",
        selected && "border-primary bg-accent/40"
      )}
      aria-current={selected ? "page" : undefined}
      onClick={onSelect}
    >
      <span
        className="relative block aspect-square overflow-hidden rounded-md border bg-muted"
        style={card.accent ? { backgroundColor: card.accent } : undefined}
      >
        <OwnerCardImage src={inventoryCoverUrl(card)} />
        {!card.visible ? (
          <span
            className="absolute top-2 left-2 z-10 inline-flex items-center rounded-md bg-background/90 p-1 text-muted-foreground shadow-sm ring-1 ring-border"
            title="在用户主页和名片墙不可见"
          >
            <EyeOffIcon className="size-3.5" aria-hidden="true" />
            <span className="sr-only">在用户主页和名片墙不可见</span>
          </span>
        ) : null}
        {inQuickExchange ? (
          <span
            className="absolute top-2 right-2 z-10 inline-flex items-center rounded-md bg-background/90 p-1 shadow-sm ring-1 ring-border"
            title="在快速交换清单里"
          >
            <ZapIcon
              className="size-3.5 text-warning-foreground"
              aria-hidden="true"
            />
            <span className="sr-only">在快速交换清单里</span>
          </span>
        ) : null}
      </span>
      <span className="mt-2 block truncate text-sm font-medium">
        {inventoryProducerName(card)}
      </span>
      <span className="mt-1 flex min-w-0 flex-wrap gap-1">
        <PublicationBadge card={card} />
        <ExchangeModeBadge mode={card.exchangeMode} />
      </span>
      {time ? (
        <span className="mt-1 flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
          <CalendarIcon className="size-3 shrink-0" aria-hidden="true" />
          <span className="truncate">{time}</span>
        </span>
      ) : null}
    </button>
  )
}
