import {
  ArrowLeftRightIcon,
  FlagIcon,
  PlusIcon,
  ShieldCheckIcon,
  SquarePenIcon,
} from "lucide-react"
import { useEffect, useRef, useState } from "react"
import type { MouseEvent } from "react"

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
import type {
  FudabaSeries,
  Namecard,
  NamecardReactions,
} from "~/lib/api"
import { IS_APP_TARGET } from "~/lib/app-target"
import { NavigationLink } from "~/components/navigation/navigation-link"
import { useNavigation } from "~/lib/navigation/use-navigation"
import { cn } from "~/lib/utils"
import { NamecardReactionEmoji } from "~/pages/community/components/namecard-reaction-emoji"

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

const CREATOR_ROLE_LABELS = {
  design: "设计",
  illustration: "插画",
  other: "其他",
} as const

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
  return (
    <div className="flex min-h-12 items-start gap-3 border-b border-border/50 py-2.5 last:border-b-0">
      <dt className="w-20 shrink-0 pt-px text-xs/5  text-muted-foreground">
        {label}
      </dt>
      <dd className="card-field-scroll min-w-0 flex-1 text-sm/5 wrap-break-word">
        {children}
      </dd>
    </div>
  )
}

function EmptyDash() {
  return <span className="text-muted-foreground">-</span>
}

export function NamecardDetailDialog({
  card,
  canClaim,
  initialSide,
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
  /** The gallery opens on the side the visitor clicked in the wall. */
  initialSide?: NamecardSide | null
  reactions: NamecardReactionState
  busy: boolean
  onOpenChange: (open: boolean) => void
  onOpenPreview: (side: NamecardSide, trigger: HTMLButtonElement) => void
  onClaim: (card: Namecard) => void
  onReact: (emoji: string) => Promise<boolean>
  onReturnFocus: () => void
}) {
  const navigate = useNavigation()
  const entries = activeNamecardReactions(reactions.reactions)
  const [series, setSeries] = useState<ReadonlyMap<string, FudabaSeries>>(
    new Map()
  )
  const [activeSlide, setActiveSlide] = useState(0)
  const [slideCardId, setSlideCardId] = useState(`${card?.id ?? ""}:${initialSide ?? ""}`)

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

  const slides = card
    ? [
        {
          key: "front",
          url: card.image1_url,
          thumb: card.image1_thumbnail_url ?? card.image1_url,
          side: "front" as const,
        },
        ...(card.image2_url
          ? [
              {
                key: "back",
                url: card.image2_url,
                thumb: card.image2_thumbnail_url ?? card.image2_url,
                side: "back" as const,
              },
            ]
          : []),
        ...card.middleImageUrls.map((url, index) => ({
          key: `middle-${index}`,
          url,
          thumb: url,
          side: null,
        })),
      ]
    : []

  const slideKey = `${card?.id ?? ""}:${initialSide ?? ""}`
  if (slideCardId !== slideKey) {
    setSlideCardId(slideKey)
    setActiveSlide(initialSide === "back" && card?.image2_url ? 1 : 0)
  }

  const submitted = card?.created_at ? new Date(card.created_at) : null
  const submittedLabel =
    submitted && !Number.isNaN(submitted.valueOf())
      ? NAMECARD_DATE_FORMATTER.format(submitted)
      : "-"

  const unclaimed = card?.claimStatus === "unclaimed"
  const active = slides[Math.min(activeSlide, Math.max(slides.length - 1, 0))]

  return (
    <Dialog open={card !== null} onOpenChange={onOpenChange}>
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
            <span className="sr-only">{" "}{card?.id ?? ""}</span>
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
              <Badge variant="secondary">
                {card.claimerName ?? "已由注册用户认领"}
              </Badge>
            ) : card?.claimStatus === "pending" ? (
              <Badge variant="outline">认领审核中</Badge>
            ) : null}
            {card?.isOriginal ? <Badge variant="secondary">原创</Badge> : null}
            {card?.madeWithAi ? (
              <Badge variant="secondary">AI 生成</Badge>
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
              {active ? (
                <button
                  type="button"
                  className="relative flex aspect-3/2 w-full items-center justify-center overflow-hidden rounded-lg bg-muted outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset"
                  aria-label={`放大制作人名片 ${card?.id ?? ""} ${active.key === "front" ? "正面" : active.key === "back" ? "背面" : "中间页"}`}
                  onClick={(event) => {
                    if (active.side) {
                      onOpenPreview(active.side, event.currentTarget)
                    }
                  }}
                >
                  <img
                    src={active.thumb}
                    alt={`制作人名片 ${card?.id ?? ""} ${active.key === "front" ? "正面" : active.key === "back" ? "背面" : "中间页"}`}
                    className="max-h-full max-w-full object-contain"
                  />
                </button>
              ) : (
                <div className="aspect-3/2 w-full rounded-lg border border-dashed" />
              )}
              {slides.length > 1 ? (
                <div
                  className="card-thumb-strip flex gap-2 overflow-x-auto pb-1"
                  aria-label="名片图片列表"
                >
                  {slides.map((slide, index) => (
                    <button
                      key={slide.key}
                      type="button"
                      className={cn(
                        "size-16 shrink-0 overflow-hidden rounded-md border-2 bg-muted outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                        index === activeSlide
                          ? "border-primary"
                          : "border-transparent"
                      )}
                      aria-label={`查看第 ${index + 1} 张（${slide.key === "front" ? "正面" : slide.key === "back" ? "背面" : "中间页"}）`}
                      aria-pressed={index === activeSlide}
                      onClick={() => setActiveSlide(index)}
                    >
                      <img
                        src={slide.url}
                        alt=""
                        className="size-full object-cover"
                      />
                    </button>
                  ))}
                </div>
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
                    {card?.groupName ?? <EmptyDash />}
                  </FieldRow>
                  <FieldRow label="制作人员">
                    {card?.credits.length ? (
                      <span className="flex flex-wrap items-center gap-1 ">
                        {card.credits.map((credit, index) => (
                          <span
                            key={`${credit.displayName}-${index}`}
                            className="inline-flex items-center gap-1"
                          >
                            {index > 0 ? (
                              <span
                                aria-hidden="true"
                                className="text-muted-foreground"
                              >
                                &bull;
                              </span>
                            ) : null}
                            {credit.url ? (
                              <NavigationLink
                                href={credit.url}
                                className="underline underline-offset-2"
                              >
                                {credit.displayName}
                              </NavigationLink>
                            ) : (
                              credit.displayName
                            )}
                            <span className="text-xs text-muted-foreground">
                              （
                              {credit.roles
                                .map((role) => CREATOR_ROLE_LABELS[role])
                                .join("/")}
                              ）
                            </span>
                          </span>
                        ))}
                      </span>
                    ) : (
                      <EmptyDash />
                    )}
                  </FieldRow>
                  <FieldRow label="企划">
                    {card?.seriesCodes.length ? (
                      <span className="grid grid-cols-2 gap-x-4 gap-y-1 lg:grid-cols-4">
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
                  <FieldRow label="简介">{card?.bio ?? <EmptyDash />}</FieldRow>
                  <FieldRow label="交换说明">
                    {card?.tradeNote ?? <EmptyDash />}
                  </FieldRow>
              </dl>
            </div>
          </div>

        </DialogBody>
        <DialogFooter className="mt-1 flex-nowrap justify-end gap-2 overflow-x-auto border-t bg-transparent p-0">
            {card?.canEdit ? (
              <Button
                type="button"
                variant="secondary"
                className="min-h-11"
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
                className="min-h-11"
                disabled
                title="暂未开放"
              >
                <PlusIcon aria-hidden="true" />
                补充
              </Button>
            ) : null}
            {unclaimed ? (
              <Button
                type="button"
                variant="secondary"
                className="min-h-11"
                disabled={!canClaim}
                onClick={() => {
                  if (card) onClaim(card)
                }}
              >
                <ShieldCheckIcon aria-hidden="true" />
                认领
              </Button>
            ) : null}
            <Button
              type="button"
              className="min-h-11"
              disabled
              title="暂未开放"
            >
              <ArrowLeftRightIcon aria-hidden="true" />
              交换
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="min-h-11"
              disabled
              title="暂未开放"
            >
              <FlagIcon aria-hidden="true" />
              反馈
            </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
