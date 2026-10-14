import { CalendarDaysIcon, PlusIcon, ShieldCheckIcon } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import type { MouseEvent } from "react"

import type { NamecardSide } from "~/components/shared/namecard-preview"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog"
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from "~/components/ui/popover"
import { NAMECARD_REACTIONS } from "~/lib/api"
import type { Namecard, NamecardReactions } from "~/lib/api"
import { IS_APP_TARGET } from "~/lib/app-target"
import { cn } from "~/lib/utils"
import { NamecardReactionEmoji } from "~/pages/community/components/namecard-reaction-emoji"
import { NamecardThumbnail } from "~/pages/community/components/namecard-thumbnail"

const NAMECARD_REACTION_SET = new Set<string>(NAMECARD_REACTIONS)
const NAMECARD_DATE_FORMATTER = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "long",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
  timeZone: "Asia/Shanghai",
})

type ReactionEntry = readonly [string, number]

function activeNamecardReactions(reactions: NamecardReactions) {
  return Object.entries(reactions).filter(
    ([emoji, count]) => count > 0 && NAMECARD_REACTION_SET.has(emoji)
  )
}

function mobileNamecardReactionSummary(reactions: NamecardReactions) {
  return activeNamecardReactions(reactions)
    .map((entry, index) => ({ entry, index }))
    .sort(
      (left, right) =>
        right.entry[1] - left.entry[1] || left.index - right.index
    )
    .slice(0, 3)
    .map(({ entry }) => entry)
}

export type NamecardReactionState = {
  reactions: NamecardReactions
  loading: boolean
}

function ReactionChip({
  entry: [emoji, count],
  compact,
  className,
  disabled,
  onClick,
}: {
  entry: ReactionEntry
  className?: string
  compact?: boolean
  disabled?: boolean
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void
}) {
  return (
    <Button
      type="button"
      className={cn(
        "h-8 min-h-8 min-w-8 shrink-0 gap-0.5 rounded-full border border-border bg-background px-1 text-[11px] tabular-nums max-md:focus-visible:ring-inset md:min-w-0 md:gap-1.5 md:px-3 md:text-sm md:dark:border-input md:dark:bg-input/30",
        !compact && "max-w-none grow-0",
        compact &&
          (String(count).length > 3
            ? "max-w-none grow-0"
            : "max-w-14 grow md:max-w-none md:grow-0"),
        className
      )}
      variant="ghost"
      disabled={disabled}
      aria-label={`${emoji}，${count} 次反应`}
      onClick={onClick}
    >
      <NamecardReactionEmoji emoji={emoji} compact={compact} />
      {count}
    </Button>
  )
}

function NamecardReactionPicker({
  reactions,
  busy,
  onReact,
  className,
  closeBelowMd = false,
}: {
  reactions: NamecardReactions
  busy: boolean
  onReact: (emoji: string) => Promise<boolean>
  className?: string
  closeBelowMd?: boolean
}) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [closedByBreakpoint, setClosedByBreakpoint] = useState(false)
  useEffect(() => {
    if (!closeBelowMd || !open) return
    const desktop = window.matchMedia("(min-width: 48rem)")
    const closeOnNarrowViewport = () => {
      if (desktop.matches) return
      setClosedByBreakpoint(true)
      setOpen(false)
    }
    closeOnNarrowViewport()
    desktop.addEventListener("change", closeOnNarrowViewport)
    return () => desktop.removeEventListener("change", closeOnNarrowViewport)
  }, [closeBelowMd, open])

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) setClosedByBreakpoint(false)
        setOpen(nextOpen)
      }}
    >
      <PopoverTrigger
        render={
          <Button
            ref={triggerRef}
            type="button"
            size="icon"
            variant="ghost"
            className={cn(
              "size-11 rounded-full bg-transparent text-muted-foreground hover:bg-transparent hover:text-foreground max-md:focus-visible:ring-inset dark:hover:bg-transparent",
              className
            )}
            title="添加反应"
            aria-label="添加反应"
            disabled={busy}
          />
        }
      >
        <span className="flex size-8 items-center justify-center rounded-full border border-dashed border-border group-hover/button:border-solid dark:border-input">
          <PlusIcon aria-hidden="true" />
        </span>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={6}
        style={{ animation: "none" }}
        className="max-h-(--available-height) w-72 max-w-(--available-width) overflow-y-auto"
        finalFocus={
          closeBelowMd && closedByBreakpoint
            ? () => {
                const row = triggerRef.current?.parentElement
                const card = triggerRef.current?.closest("[data-namecard-item]")
                const buttons = [
                  ...(row?.querySelectorAll<HTMLButtonElement>("button") ?? []),
                  ...(card?.querySelectorAll<HTMLButtonElement>("button") ??
                    []),
                ]
                return (
                  buttons.find(
                    (button) =>
                      !button.disabled && button.getClientRects().length > 0
                  ) ?? false
                )
              }
            : undefined
        }
      >
        <PopoverTitle className="mb-2">选择反应</PopoverTitle>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(44px,1fr))] gap-1">
          {NAMECARD_REACTIONS.map((emoji) => (
            <Button
              key={emoji}
              type="button"
              size="icon"
              variant={reactions[emoji] ? "secondary" : "ghost"}
              className="size-11 text-base"
              disabled={busy}
              aria-label={`${emoji}，添加反应`}
              onClick={() => {
                void onReact(emoji).then((success) => {
                  if (success) setOpen(false)
                })
              }}
            >
              <NamecardReactionEmoji emoji={emoji} />
            </Button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}

export function NamecardReactionSummary({
  reactions,
  loading,
  busy,
  onOpen,
  onReact,
}: NamecardReactionState & {
  busy: boolean
  onOpen: (trigger: HTMLButtonElement) => void
  onReact: (emoji: string) => Promise<boolean>
}) {
  const all = activeNamecardReactions(reactions)
  const mobile = mobileNamecardReactionSummary(reactions)
  return (
    <div
      className="flex min-h-8 min-w-0 flex-wrap items-center gap-0.75 md:gap-1.5"
      aria-label="名片反应摘要"
      aria-busy={loading || busy}
    >
      {mobile.map((entry) => (
        <ReactionChip
          key={`mobile-${entry[0]}`}
          entry={entry}
          compact
          onClick={(event) => onOpen(event.currentTarget)}
          className="md:hidden"
        />
      ))}
      {all.map((entry) => (
        <ReactionChip
          key={`desktop-${entry[0]}`}
          entry={entry}
          compact
          disabled={!IS_APP_TARGET && busy}
          onClick={(event) => {
            if (IS_APP_TARGET) onOpen(event.currentTarget)
            else void onReact(entry[0])
          }}
          className="max-md:hidden"
        />
      ))}
      {!IS_APP_TARGET ? (
        <NamecardReactionPicker
          reactions={reactions}
          busy={busy}
          onReact={onReact}
          className="max-md:hidden"
          closeBelowMd
        />
      ) : null}
      {all.length === 0 && !loading ? (
        <Button
          type="button"
          variant="ghost"
          className={cn(
            "h-8 min-h-8 rounded-full border border-dashed px-2 text-xs text-muted-foreground",
            !IS_APP_TARGET && "md:hidden"
          )}
          onClick={(event) => onOpen(event.currentTarget)}
        >
          查看详情
        </Button>
      ) : null}
    </div>
  )
}

export function NamecardDetailDialog({
  card,
  canClaim,
  reactions,
  busy,
  onOpenChange,
  onOpenPreview,
  onClaim,
  onReact,
  onReturnFocus,
}: {
  card: Namecard | null
  canClaim: boolean
  reactions: NamecardReactionState
  busy: boolean
  onOpenChange: (open: boolean) => void
  onOpenPreview: (side: NamecardSide, trigger: HTMLButtonElement) => void
  onClaim: (card: Namecard) => void
  onReact: (emoji: string) => Promise<boolean>
  onReturnFocus: () => void
}) {
  const entries = activeNamecardReactions(reactions.reactions)

  const submitted = card?.created_at ? new Date(card.created_at) : null
  const submittedLabel =
    submitted && !Number.isNaN(submitted.valueOf())
      ? NAMECARD_DATE_FORMATTER.format(submitted)
      : "日期待补"

  return (
    <Dialog open={card !== null} onOpenChange={onOpenChange}>
      <DialogContent
        layout="pinned"
        className="sm:max-w-4xl"
        finalFocus={() => {
          onReturnFocus()
          return false
        }}
      >
        <DialogHeader>
          <DialogTitle>
            制作人名片 <span className="sr-only">{card?.id}</span>
          </DialogTitle>
          <DialogDescription>
            查看双面图片、公开参数、认领状态和全部反应
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-5">
          <div className="grid gap-3 md:grid-cols-2">
            {(["front", "back"] as const).map((side) => {
              const thumbnail =
                side === "front"
                  ? card?.image1_thumbnail_url
                  : card?.image2_thumbnail_url
              const original =
                side === "front" ? card?.image1_url : card?.image2_url
              return card && thumbnail && original ? (
                <button
                  key={side}
                  type="button"
                  className="relative aspect-3/2 min-h-11 overflow-hidden rounded-lg bg-muted outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset"
                  aria-label={`放大制作人名片 ${card.id} ${side === "front" ? "正面" : "背面"}`}
                  onClick={(event) => onOpenPreview(side, event.currentTarget)}
                >
                  <NamecardThumbnail
                    key={`${thumbnail}:${original}`}
                    thumbnail={thumbnail}
                    original={original}
                  />
                </button>
              ) : null
            })}
          </div>

          <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-muted-foreground">提交时间</dt>
              <dd className="mt-1 flex items-center gap-1.5">
                <CalendarDaysIcon className="size-4" aria-hidden="true" />
                {submittedLabel}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">企划</dt>
              <dd className="mt-1">{card?.seriesCode ?? "未设置"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">担当偶像</dt>
              <dd className="mt-1">
                {card?.favoriteIdols.length
                  ? card.favoriteIdols.map((idol) => idol.name).join("、")
                  : "未设置"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">认领状态</dt>
              <dd className="mt-1">
                {card?.claimStatus === "claimed" ? (
                  <Badge variant="outline">
                    <ShieldCheckIcon aria-hidden="true" />
                    {card.claimerName ?? "已由注册用户认领"}
                  </Badge>
                ) : card?.claimStatus === "pending" ? (
                  <Badge variant="outline">认领审核中</Badge>
                ) : canClaim && card ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-11"
                    onClick={() => onClaim(card)}
                  >
                    <ShieldCheckIcon aria-hidden="true" />
                    认领这张名片
                  </Button>
                ) : (
                  "尚未认领"
                )}
              </dd>
            </div>
          </dl>

          <section aria-labelledby="namecard-detail-reactions">
            <h2 id="namecard-detail-reactions" className="mb-2 font-medium">
              全部反应
            </h2>
            <div
              className="flex min-h-11 flex-wrap items-center gap-1.5"
              aria-label="名片全部反应"
              aria-busy={reactions.loading || busy}
            >
              {entries.map((entry) => (
                <ReactionChip
                  key={entry[0]}
                  entry={entry}
                  disabled={busy}
                  onClick={() => void onReact(entry[0])}
                />
              ))}
              {!reactions.loading && entries.length === 0 ? (
                <p className="text-sm text-muted-foreground">还没有反应</p>
              ) : null}
              <NamecardReactionPicker
                reactions={reactions.reactions}
                busy={busy}
                onReact={onReact}
              />
            </div>
          </section>
        </DialogBody>
      </DialogContent>
    </Dialog>
  )
}
