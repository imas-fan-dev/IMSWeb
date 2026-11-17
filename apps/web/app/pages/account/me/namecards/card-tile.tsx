import { CalendarIcon, CheckIcon, EyeOffIcon, ZapIcon } from "lucide-react"
import { useId } from "react"

import { NAMECARD_REVIEW_LABELS } from "~/components/community/namecard-status-labels"
import { Badge } from "~/components/ui/badge"
import type { FudabaOwnerCard } from "~/lib/api"
import { cardTimeLabel } from "~/lib/namecards/dates"
import { cn } from "~/lib/utils"
import { cardViewTransitionName, isCardSelectable } from "./card-manager-model"
import { publicationLabels } from "./card-model"
import { OwnerCardImage } from "./owner-card-image"

/**
 * 瓦片网格：分组模式与经典模式共用同一套列宽，切换模式时瓦片只换位置、不变尺寸。
 */
export const cardTileGridClassName =
  "grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"

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

/** 缩略图只用 400 档（媒体路由支持 `w=160|400|800|1400`），列表里不需要原尺寸。 */
export function coverThumbUrl(card: FudabaOwnerCard): string {
  const [path, query = ""] = inventoryCoverUrl(card).split("?")
  const params = new URLSearchParams(query)
  params.set("w", "400")
  return `${path}?${params.toString()}`
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
        mode === "none"
          ? "outline"
          : mode === "manual"
            ? "secondary"
            : "default"
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
 * 每张瓦片带自己的 `view-transition-name`，分组↔经典切换时由浏览器把它挪到新位置。
 *
 * 编辑模式（§6.1/§8）：整卡 `published` 的瓦片变成复选框（`role="checkbox"` +
 * `aria-checked`），点击切换勾选；其余状态是只读的，禁用且不给复选框。
 *
 * `hidden` 与 `exchangeMode` 传的是**生效值**（编辑模式下草稿优先于线上值），这样批量改
 * 可见性/交换模式后角标与徽标立刻跟上；非编辑模式两者就等于卡片自己的值。
 */
export function CardTile({
  card,
  inQuickExchange = false,
  selected = false,
  editing = false,
  checked = false,
  hidden = !card.visible,
  exchangeMode = card.exchangeMode,
  preview = false,
  onSelect,
}: {
  card: FudabaOwnerCard
  inQuickExchange?: boolean
  /** 非编辑模式：这张卡正在编辑器里打开。 */
  selected?: boolean
  editing?: boolean
  /** 编辑模式：这张卡在勾选集合里。 */
  checked?: boolean
  /** 生效的可见性（默认取卡片自己的值）。 */
  hidden?: boolean
  /** 生效的交换模式（默认取卡片自己的值）。 */
  exchangeMode?: FudabaOwnerCard["exchangeMode"]
  /**
   * 落点 ghost 用的**只读副本**（拖动预览，§7.3）：不写 `view-transition-name`——同一张卡
   * 在 DOM 里出现两个同名节点时浏览器会放弃那两个名字，分组↔经典切换的动画就断了；
   * 也不可聚焦、不带控件语义（调用方在外层加 `aria-hidden` 与 `pointer-events-none`）。
   */
  preview?: boolean
  onSelect: () => void
}) {
  const time = cardTimeLabel(card)
  const selectable = editing && isCardSelectable(card)
  const lockedReason =
    editing && !selectable ? "只有已发布的名片可以批量调整" : null
  const lockedReasonId = useId()
  const marked = editing ? checked : selected
  return (
    <button
      type="button"
      className={cn(
        // 编辑模式下瓦片外面还套一层 dnd 用的 wrapper（`SortableCardTile`），
        // `w-full` 让瓦片继续铺满一个网格单元格，宽度不受 wrapper 影响。
        "w-full min-w-0 rounded-lg border bg-background p-2 text-left transition-colors outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50",
        marked && "border-primary bg-accent/40",
        lockedReason && "opacity-70"
      )}
      style={
        preview
          ? undefined
          : { viewTransitionName: cardViewTransitionName(card.id) }
      }
      role={selectable && !preview ? "checkbox" : undefined}
      aria-checked={selectable && !preview ? checked : undefined}
      aria-current={!editing && !preview && selected ? "page" : undefined}
      // 只读瓦片不能用真 `disabled`：那样它不可聚焦、`title` 也播报不稳。改成
      // `aria-disabled` + sr-only 说明，并在点击处理里自己忽略。
      aria-disabled={lockedReason ? true : undefined}
      aria-describedby={lockedReason ? lockedReasonId : undefined}
      // ghost 副本不该出现在 Tab 序列里（外层已经对读屏隐藏）。
      tabIndex={preview ? -1 : undefined}
      onClick={() => {
        if (lockedReason) return
        onSelect()
      }}
    >
      <span className="relative flex aspect-square items-center justify-center overflow-hidden rounded-md bg-border">
        <OwnerCardImage
          src={coverThumbUrl(card)}
          className="max-h-full max-w-full border border-foreground/25 object-contain"
        />
        {hidden ? (
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
        {selectable ? (
          // 视觉勾选标记：整张瓦片才是控件（`role="checkbox"`），这里不渲染真输入框。
          <span
            aria-hidden="true"
            className={cn(
              "absolute bottom-2 left-2 z-10 flex size-5 items-center justify-center rounded-[4px] border border-input bg-background/90 shadow-sm",
              checked && "border-primary bg-primary text-primary-foreground"
            )}
          >
            {checked ? <CheckIcon className="size-3.5" /> : null}
          </span>
        ) : null}
      </span>
      <span className="mt-2 block truncate text-sm font-medium">
        {inventoryProducerName(card)}
      </span>
      {time ? (
        <span className="mt-1 flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
          <CalendarIcon className="size-3 shrink-0" aria-hidden="true" />
          <span className="truncate">{time}</span>
        </span>
      ) : null}
      <span className="mt-2 flex min-w-0 flex-wrap gap-1">
        <PublicationBadge card={card} />
        <ExchangeModeBadge mode={exchangeMode} />
      </span>
      {lockedReason ? (
        <span id={lockedReasonId} className="sr-only">
          {lockedReason}
        </span>
      ) : null}
    </button>
  )
}
