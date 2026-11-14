import {
  ArrowLeftRightIcon,
  ShareIcon,
  PlusIcon,
  ShieldCheckIcon,
  SquarePenIcon,
} from "lucide-react"
import { useEffect, useRef, useState } from "react"
import type { MouseEvent } from "react"

import { creditParts } from "~/components/community/namecard-credit-format"
import {
  CardMediaPreview,
  publicMediaSlotsFromCard,
} from "~/pages/account/me/namecards/card-media-gallery"
import { useCardFieldFade } from "~/components/community/use-card-field-fade"
import type { NamecardSide } from "~/components/shared/namecard-preview"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import {
  Dialog,
  DialogBody,
  DialogFooter,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog"
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from "~/components/ui/popover"
import { getFudabaSeries, NAMECARD_REACTIONS } from "~/lib/api"
import { useOptionalPlatformSession } from "~/components/platform/platform-session-provider"
import type { FudabaSeries, Namecard, NamecardReactions } from "~/lib/api"
import { IS_APP_TARGET } from "~/lib/app-target"
import { NavigationLink } from "~/components/navigation/navigation-link"
import { useNavigation } from "~/lib/navigation/use-navigation"
import { cn } from "~/lib/utils"
import { NamecardReactionEmoji } from "~/pages/community/components/namecard-reaction-emoji"
import { NamecardFeedbackDialog } from "~/pages/community/exchange/components/namecard-feedback-dialog"

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

const NAMECARD_DATE_ONLY_FORMATTER = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "long",
  day: "numeric",
  timeZone: "Asia/Shanghai",
})

/** `YYYY`, `YYYY-MM` or `YYYY-MM-DD` as the editor stores it. */
function madeOnLabel(value: string | null): string {
  if (!value) return "-"
  const [year, month, day] = value.split("-")
  if (!year) return "-"
  if (!month) return `${year} 年`
  if (!day) return `${year} 年 ${Number(month)} 月`
  const parsed = new Date(`${value}T00:00:00+08:00`)
  return Number.isNaN(parsed.valueOf())
    ? `${year} 年 ${Number(month)} 月 ${Number(day)} 日`
    : NAMECARD_DATE_ONLY_FORMATTER.format(parsed)
}

function FieldRow({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  const { ref: valueRef, fade } = useCardFieldFade(children)
  return (
    <div className="flex min-h-12 items-start gap-3 border-b border-border/50 py-2.5 last:border-b-0">
      <dt className="w-20 shrink-0 pt-px text-xs/5 text-muted-foreground">
        {label}
      </dt>
      <dd
        ref={valueRef}
        data-fade={fade}
        className="card-field-scroll min-w-0 flex-1 text-sm/5 wrap-break-word"
      >
        {children}
      </dd>
    </div>
  )
}

function hasText(value: string | null | undefined) {
  return Boolean(value && value.trim())
}

function EmptyDash() {
  return <span className="text-muted-foreground">-</span>
}

/** 窄屏把底栏压成一行：字号与高度都收一档，图标保持 16px。 */
const FOOTER_BUTTON =
  "min-h-9 gap-1 px-2 text-xs [&_svg]:size-4 sm:min-h-11 sm:px-2.5 sm:text-sm"

export function NamecardDetailDialog({
  card,
  canClaim,
  initialSide,
  reactions,
  busy,
  onOpenChange,
  onOpenPreview,
  onClaim,
  onSupplement,
  onReact,
  onReturnFocus,
  dismissible = true,
}: {
  card: Namecard | null
  canClaim: boolean
  /** The gallery opens on the side the visitor clicked in the wall. */
  initialSide?: NamecardSide | null
  reactions: NamecardReactionState
  busy: boolean
  onOpenChange: (open: boolean) => void
  /** 传的是画廊里的页面下标：可能超过两面，光靠 front/back 表达不全。 */
  onOpenPreview: (index: number, trigger: HTMLButtonElement) => void
  onClaim: (card: Namecard) => void
  onSupplement: (card: Namecard) => void
  onReact: (emoji: string) => Promise<boolean>
  onReturnFocus: () => void
  /** 认领/补充窗开着时置 false，点它不算「点了详情窗外面」。 */
  dismissible?: boolean
}) {
  const navigate = useNavigation()
  const platform = useOptionalPlatformSession()
  const platformCanReport =
    platform.status === "authenticated" || platform.status === "restricted"
  const entries = activeNamecardReactions(reactions.reactions)
  const [series, setSeries] = useState<ReadonlyMap<string, FudabaSeries>>(
    new Map()
  )

  useEffect(() => {
    if (!card) return
    let active = true
    getFudabaSeries()
      .send()
      .then((result) => {
        if (active) {
          setSeries(new Map(result.items.map((item) => [item.code, item])))
        }
      })
      .catch(() => {
        if (active) setSeries(new Map())
      })
    return () => {
      active = false
    }
  }, [card])

  const mediaSlots = card ? publicMediaSlotsFromCard({ pages: card.pages }) : []
  // 挂在 key 上：换卡或从另一面打开时重新挂载，预览回到正确的图。
  const slideKey = `${card?.id ?? ""}:${initialSide ?? ""}`
  const initialSlide =
    initialSide === "back" && mediaSlots.length > 1 ? mediaSlots.length - 1 : 0

  const submitted = card?.created_at ? new Date(card.created_at) : null
  const submittedLabel =
    submitted && !Number.isNaN(submitted.valueOf())
      ? NAMECARD_DATE_FORMATTER.format(submitted)
      : "-"

  // Ownership is the real gate: a claimed card keeps the queue actions out of
  // the footer even while its claim request is still being reviewed.
  const unclaimed = card ? !card.hasOwner : false
  // 认领优先于补充：认领审核期间这张卡不再接受补充，也不接受第二份认领。
  const claimBlocked = card ? card.claimStatus !== "unclaimed" : true
  const supplementBlocked = card
    ? card.claimStatus !== "unclaimed" || card.supplementPending
    : true

  return (
    <Dialog
      open={card !== null}
      onOpenChange={onOpenChange}
      disablePointerDismissal={!dismissible}
    >
      <DialogContent
        layout="pinned"
        className="sm:max-w-5xl"
        finalFocus={() => {
          onReturnFocus()
          return false
        }}
      >
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">
            制作人名片
            {/* 视觉上不显示编号，但对话框的可访问名必须唯一，屏幕阅读器会读出来。 */}
            <span className="sr-only"> {card?.id ?? ""}</span>
          </DialogTitle>
          <div
            className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground"
            aria-label="名片编号信息"
          >
            <span className="whitespace-nowrap">
              名片 #{card?.cardNumber ?? card?.id ?? ""} · 版本{" "}
              {card?.revision ?? 0}
            </span>
            {card?.claimStatus === "claimed" ? (
              card.claimerUid ? (
                <Badge
                  variant="outline"
                  className="text-muted-foreground"
                  render={<NavigationLink to={`/user/${card.claimerUid}`} />}
                >
                  <ShieldCheckIcon
                    data-icon="inline-start"
                    aria-hidden="true"
                  />
                  {card.claimerName ?? "已由注册用户认领"}
                </Badge>
              ) : (
                <Badge variant="outline" className="text-muted-foreground">
                  <ShieldCheckIcon
                    data-icon="inline-start"
                    aria-hidden="true"
                  />
                  {card.claimerName ?? "已由注册用户认领"}
                </Badge>
              )
            ) : card?.claimStatus === "pending" ? (
              <Badge variant="outline">认领审核中</Badge>
            ) : null}
            {card?.isOriginal ? (
              <Badge
                variant="secondary"
                className="border-success/40 bg-success/15 text-success"
              >
                原创
              </Badge>
            ) : null}
            {card?.madeWithAi ? (
              <Badge
                variant="secondary"
                className="border-warning/40 bg-warning/15 text-warning-foreground"
              >
                AI 生成
              </Badge>
            ) : null}
            {submitted ? (
              <span className="ml-auto whitespace-nowrap">
                提交于 {submittedLabel}
              </span>
            ) : null}
          </div>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-5">
          <div className="grid min-h-0 gap-6 md:grid-cols-2">
            <div className="min-w-0 space-y-4">
              {/* 与认领窗口共用同一套媒体预览；详情窗只要看，不要正反面角标。 */}
              {card ? (
                <CardMediaPreview
                  key={slideKey}
                  slots={mediaSlots}
                  roleLabels={false}
                  initialIndex={initialSlide}
                  onOpenPreview={(index, element) =>
                    onOpenPreview(index, element)
                  }
                  previewLabel={(index) =>
                    `放大制作人名片 ${card.id} ${
                      index === 0
                        ? "正面"
                        : index === mediaSlots.length - 1
                          ? "背面"
                          : "中间页"
                    }`
                  }
                />
              ) : null}

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
            </div>

            <div className="min-w-0">
              <dl aria-label="名片公开参数">
                <FieldRow label="制作人名称">
                  {card?.producerName ? (
                    <>
                      {card.producerName}
                      {card.producerReading ? (
                        <span className="ml-1 text-xs text-muted-foreground">
                          （{card.producerReading}）
                        </span>
                      ) : null}
                    </>
                  ) : (
                    <EmptyDash />
                  )}
                </FieldRow>
                <FieldRow label="制作日期">
                  {card ? madeOnLabel(card.madeOn) : <EmptyDash />}
                </FieldRow>
                <FieldRow label="所属团体">
                  {hasText(card?.groupName) ? card?.groupName : <EmptyDash />}
                </FieldRow>
                <FieldRow label="制作人员">
                  {card?.credits.length ? (
                    <ul className="space-y-1">
                      {card.credits.map((credit, index) => {
                        const parts = creditParts(credit)
                        return (
                          <li key={`${credit.displayName}-${index}`}>
                            {parts.url ? (
                              <NavigationLink
                                href={parts.url}
                                className="underline underline-offset-2"
                              >
                                {parts.name}
                              </NavigationLink>
                            ) : (
                              parts.name
                            )}
                            {parts.roles ? (
                              <span className="ml-1 text-xs text-muted-foreground">
                                {parts.roles}
                              </span>
                            ) : null}
                          </li>
                        )
                      })}
                    </ul>
                  ) : (
                    <EmptyDash />
                  )}
                </FieldRow>
                <FieldRow label="企划">
                  {card?.seriesCodes.length ? (
                    <span className="flex flex-wrap gap-x-4 gap-y-1">
                      {card.seriesCodes.map((code) => (
                        <span
                          key={code}
                          className="inline-flex min-w-0 items-center gap-1.5"
                        >
                          <span
                            aria-hidden="true"
                            className="size-2 shrink-0 rounded-full"
                            style={{
                              backgroundColor:
                                series.get(code)?.color ?? "var(--border)",
                            }}
                          />
                          <span className="truncate">
                            {series.get(code)?.displayName ?? code}
                          </span>
                        </span>
                      ))}
                    </span>
                  ) : (
                    <EmptyDash />
                  )}
                </FieldRow>
                <FieldRow label="担当角色">
                  {card?.favoriteCharacters.length ? (
                    card.favoriteCharacters.map((idol) => idol.name).join("、")
                  ) : (
                    <EmptyDash />
                  )}
                </FieldRow>
                <FieldRow label="简介">
                  {hasText(card?.bio) ? card?.bio : <EmptyDash />}
                </FieldRow>
                <FieldRow label="交换说明">
                  {hasText(card?.tradeNote) ? card?.tradeNote : <EmptyDash />}
                </FieldRow>
              </dl>
            </div>
          </div>
        </DialogBody>
        <DialogFooter className="flex-row flex-nowrap justify-end gap-1.5 overflow-x-auto border-t bg-transparent px-3 sm:gap-2 sm:px-4">
          {card?.canEdit ? (
            <Button
              type="button"
              variant="outline"
              className={cn(FOOTER_BUTTON, "bg-background")}
              onClick={() => {
                onOpenChange(false)
                void navigate(
                  `/account/me/namecards?card=${encodeURIComponent(card.cardId)}`
                )
              }}
            >
              <SquarePenIcon aria-hidden="true" />
              编辑
            </Button>
          ) : null}
          {unclaimed ? (
            <Button
              type="button"
              variant="outline"
              className={cn(FOOTER_BUTTON, "bg-background")}
              disabled={!canClaim || supplementBlocked}
              title={
                card?.claimStatus === "pending"
                  ? "这张名片正在认领审核，认领优先于补充"
                  : card?.supplementPending
                    ? "这张名片已有一份补充在审核"
                    : undefined
              }
              onClick={() => {
                if (card) onSupplement(card)
              }}
            >
              <PlusIcon aria-hidden="true" />
              补充
            </Button>
          ) : null}
          {unclaimed ? (
            <Button
              type="button"
              className={FOOTER_BUTTON}
              disabled={!canClaim || claimBlocked}
              title={
                card?.claimStatus === "pending"
                  ? "这张名片已经有一份认领在审核"
                  : undefined
              }
              onClick={() => {
                if (card) onClaim(card)
              }}
            >
              <ShieldCheckIcon aria-hidden="true" />
              认领
            </Button>
          ) : null}
          {unclaimed ? null : card?.canEdit ? (
            // 拥有者看自己的名片时，这里给的是分享入口（暂不可用）。
            <Button
              type="button"
              className={FOOTER_BUTTON}
              disabled
              title="暂未开放"
            >
              <ShareIcon aria-hidden="true" />
              分享
            </Button>
          ) : (
            <Button
              type="button"
              className={FOOTER_BUTTON}
              disabled
              title="暂未开放"
            >
              <ArrowLeftRightIcon aria-hidden="true" />
              交换
            </Button>
          )}
          {card ? (
            <NamecardFeedbackDialog
              cardId={card.cardId}
              cardLabel={card.producerName || `名片 #${card.cardNumber}`}
              disabled={!platformCanReport}
              triggerVariant="destructive"
              triggerClassName={FOOTER_BUTTON}
            />
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
