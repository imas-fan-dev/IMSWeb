import {
  ArrowLeftRightIcon,
  EyeIcon,
  EyeOffIcon,
  ShareIcon,
  PlusIcon,
  ShieldCheckIcon,
  SquarePenIcon,
} from "lucide-react"
import { useEffect, useState } from "react"

import { NamecardClaimBadge } from "~/components/community/namecard-claim-badge"
import { creditParts } from "~/components/community/namecard-credit-format"
import { NamecardTagEditor } from "~/components/community/namecard-tag-editor"
import {
  CardMediaPreview,
  publicMediaSlotsFromCard,
} from "~/pages/account/me/namecards/card-media-gallery"
import { useCardFieldFade } from "~/components/community/use-card-field-fade"
import { namecardPageLabel } from "~/components/shared/namecard-pages"
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
import { getFudabaSeries } from "~/lib/api"
import { useOptionalPlatformSession } from "~/components/platform/platform-session-provider"
import type { FudabaSeries, Namecard, NamecardReactions } from "~/lib/api"
import { IS_APP_TARGET } from "~/lib/app-target"
import { useRetainedValue } from "~/lib/use-retained-value"
import { NavigationLink } from "~/components/navigation/navigation-link"
import { useNavigation } from "~/lib/navigation/use-navigation"
import { cn } from "~/lib/utils"
import {
  NamecardReactionPicker,
  NamecardReactionRow,
  orderedNamecardReactions,
} from "~/pages/community/components/namecard-reaction-row"
import { NamecardFeedbackDialog } from "~/pages/community/exchange/components/namecard-feedback-dialog"
import { CardShareDialog } from "~/pages/account/me/namecards/components/card-share-dialog"
import { useCardShareDialog } from "~/pages/exchange/use-card-share-dialog"

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

export type NamecardReactionState = {
  reactions: NamecardReactions
  loading: boolean
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
  /** 兼容旧调用方：胶囊尺寸已统一，`size` 不再改变高度。 */
  size?: "default" | "sm"
}) {
  const all = orderedNamecardReactions(reactions)
  return (
    <div
      className="flex min-h-5 min-w-0 flex-wrap items-center"
      data-slot="namecard-reaction-summary"
      aria-label="名片反应摘要"
      aria-busy={loading || busy}
    >
      <NamecardReactionRow
        reactions={reactions}
        limit={3}
        chipClassName="md:hidden"
        onChipClick={(_entry, event) => onOpen(event.currentTarget)}
      />
      <NamecardReactionRow
        reactions={reactions}
        chipClassName="max-md:hidden"
        chipDisabled={!IS_APP_TARGET && busy}
        onChipClick={(entry, event) => {
          if (IS_APP_TARGET) onOpen(event.currentTarget)
          else void onReact(entry[0])
        }}
      >
        {!IS_APP_TARGET ? (
          <NamecardReactionPicker
            reactions={reactions}
            busy={busy}
            onReact={onReact}
            className="max-md:hidden"
            closeBelowMd
          />
        ) : null}
      </NamecardReactionRow>
      {all.length === 0 && !loading ? (
        <Button
          type="button"
          variant="ghost"
          className={cn(
            "h-5 min-h-5 rounded-sm border border-dashed px-1.5 text-[10px] text-muted-foreground",
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

/** 【交换】的目标：页面层拿得到哪个就传哪个；实际查「对方已有」用 `?target=` / `?targetCard=`。 */
export type NamecardExchangeTarget =
  | { accountId: string }
  | { cardNumber: number }

/** 只读调用方（通知里的交换详情）没有反应数据，也不该伪造一份。 */
const EMPTY_REACTION_STATE: NamecardReactionState = {
  reactions: {},
  loading: false,
}

export function NamecardDetailDialog({
  card: incomingCard,
  canClaim = false,
  initialSide,
  reactions: incomingReactions = EMPTY_REACTION_STATE,
  busy = false,
  exchangeTarget,
  exchangeTargetCard,
  onOpenChange,
  onOpenPreview,
  onClaim,
  onSupplement,
  onExchange,
  onReact,
  onReturnFocus,
  onTagsChange,
  dismissible = true,
  readOnly = false,
  showTags = true,
  collection,
  authorizeMedia = false,
}: {
  card: Namecard | null
  canClaim?: boolean
  /** The gallery opens on the side the visitor clicked in the wall. */
  initialSide?: NamecardSide | null
  reactions?: NamecardReactionState
  busy?: boolean
  /** 卡主的平台账号（主页已知 `profile.accountId` 时传它）。 */
  exchangeTarget?: string | null
  /** 卡号：公开墙拿不到账号 ID，只能把这张卡交给选卡窗口反查卡主。 */
  exchangeTargetCard?: number | null
  onOpenChange: (open: boolean) => void
  /** 传的是画廊里的页面下标：可能超过两面，光靠 front/back 表达不全。 */
  onOpenPreview?: (index: number, trigger: HTMLButtonElement) => void
  onClaim?: (card: Namecard) => void
  onSupplement?: (card: Namecard) => void
  /** 【交换】由挂载页面打开它的选卡窗口（一页一个实例，不在窗里另起）。 */
  onExchange?: (card: Namecard, target: NamecardExchangeTarget) => void
  onReact?: (emoji: string) => Promise<boolean>
  onReturnFocus?: () => void
  /** 内联标签保存成功后回调，调用方据此更新列表里的同一张卡。 */
  onTagsChange?: (tags: string[]) => void
  /**
   * 是否挂载标签区。通知里的交换详情传 `false`（那里只做只读核对）；
   * 只读模式无论该值如何都不渲染编辑器。
   */
  showTags?: boolean
  /** 认领/补充窗开着时置 false，点它不算「点了详情窗外面」。 */
  dismissible?: boolean
  /**
   * 只读：卡片信息、页签与缩略图照旧，但**不渲染任何交互件**——反应区、
   * 编辑/认领/补充/分享/交换全部缺席，只留下【反馈】。
   * 通知里的交换详情拿它叠在交换窗上展示完整名片。
   */
  readOnly?: boolean
  /**
   * 名片册的交接：把【交换】换成【隐藏/取消隐藏】。传 `null` 表示这条是自己的名片
   * （PRD §5），两个按钮都不出现；不传则是墙 / 主页的常规详情窗。
   */
  collection?:
    | {
        hidden: boolean
        /** 写请求在飞时禁用，避免连点。 */
        busy: boolean
        onToggleHidden: () => void
      }
    | null
  /**
   * 名片册里原卡已被属主下线（`available: false`）时置 true：交换墙的媒体
   * 只剩「持有者可读」，App 里没有 cookie，必须让图片走平台凭据。
   */
  authorizeMedia?: boolean
}) {
  // 关闭时父组件会立刻把 card 置空；但对话框还要播退场动画。保留最后一张卡，
  // 让内容在淡出期间保持完整，不再出现「先空白再消失」。
  const card = useRetainedValue(incomingCard)
  // 关闭时父组件也会把反应数据换成空态；同样留住，退场期间不闪空。
  const reactions =
    useRetainedValue(incomingCard ? incomingReactions : null) ??
    EMPTY_REACTION_STATE
  const navigate = useNavigation()
  const platform = useOptionalPlatformSession()
  const platformCanReport =
    platform.status === "authenticated" || platform.status === "restricted"
  const entries = orderedNamecardReactions(reactions.reactions)
  // inline 编辑器自己保存，但详情窗是受控视图：保存成功后先把本地 chips 换掉，
  // 再通知调用方刷新列表里的同一张卡（弹窗可能不重挂）。
  const [savedTagState, setSavedTagState] = useState<{
    cardId: string
    tags: string[]
  } | null>(null)
  const savedTags =
    card && savedTagState?.cardId === card.cardId
      ? savedTagState.tags
      : (card?.tags?.map((tag) => tag.name) ?? [])
  // 只读调用方没有反应写路径；交互区在只读下整块不渲染，这里只保证类型完整。
  const react = onReact ?? (() => Promise.resolve(false))
  const share = useCardShareDialog()
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

  // 【交换】目标：调用方知道自己拿得到什么（主页 = 账号 ID，名片墙 = 卡号）。
  // 公开卡投影里 `claimerUid` 恒为 null，所以它只作为兜底，不再当必填门槛。
  const resolvedExchangeTarget: NamecardExchangeTarget | null =
    exchangeTargetCard !== undefined && exchangeTargetCard !== null
      ? { cardNumber: exchangeTargetCard }
      : exchangeTarget
        ? { accountId: exchangeTarget }
        : card?.claimerUid
          ? { accountId: String(card.claimerUid) }
          : null
  const canExchange =
    card !== null &&
    platformCanReport &&
    resolvedExchangeTarget !== null &&
    !card.collected &&
    card.exchangeMode !== "none"
  const exchangeBlockedTitle = card?.collected
    ? "你已经拥有这张名片"
    : card?.exchangeMode === "none"
      ? "这张名片不接受交换"
      : !platformCanReport
        ? "登录后才能交换"
        : "暂时无法交换"

  return (
    <Dialog
      open={incomingCard !== null}
      onOpenChange={onOpenChange}
      disablePointerDismissal={!dismissible}
    >
      <DialogContent
        layout="pinned"
        className="sm:max-w-5xl"
        finalFocus={() => {
          onReturnFocus?.()
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
            {card ? <NamecardClaimBadge card={card} layout="inline" /> : null}
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
                  authorizeMedia={authorizeMedia}
                  initialIndex={initialSlide}
                  onOpenPreview={
                    onOpenPreview
                      ? (index, element) => onOpenPreview(index, element)
                      : undefined
                  }
                  previewLabel={(index) =>
                    `放大制作人名片 ${card.id} ${
                      namecardPageLabel(index, mediaSlots.length)
                    }`
                  }
                />
              ) : null}

              {readOnly || !showTags || !card ? null : (
                <section aria-labelledby="namecard-detail-tags">
                  <h2 id="namecard-detail-tags" className="mb-2 font-medium">
                    标签
                  </h2>
                  <NamecardTagEditor
                    variant="inline"
                    value={savedTags}
                    cardId={card.cardId}
                    disabled={platform.status !== "authenticated"}
                    onChange={(tags) => {
                      setSavedTagState({ cardId: card.cardId, tags })
                      onTagsChange?.(tags)
                    }}
                  />
                </section>
              )}

              {readOnly ? null : (
                <section aria-labelledby="namecard-detail-reactions">
                  <h2
                    id="namecard-detail-reactions"
                    className="mb-1 font-medium"
                  >
                    全部反应
                  </h2>
                  <NamecardReactionRow
                    reactions={reactions.reactions}
                    busy={reactions.loading || busy}
                    label="名片全部反应"
                    chipDisabled={busy}
                    onChipClick={(entry) => void react(entry[0])}
                  >
                    {!reactions.loading && entries.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        还没有反应
                      </p>
                    ) : null}
                    <NamecardReactionPicker
                      reactions={reactions.reactions}
                      busy={busy}
                      onReact={react}
                    />
                  </NamecardReactionRow>
                </section>
              )}
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
          {readOnly ? null : (
            <>
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
                    if (card) onSupplement?.(card)
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
                    if (card) onClaim?.(card)
                  }}
                >
                  <ShieldCheckIcon aria-hidden="true" />
                  认领
                </Button>
              ) : null}
              {unclaimed ? null : card?.canEdit ? (
                // 拥有者看自己的名片时，这里给的是单卡分享入口（懒加载 slug 后开面板）。
                <Button
                  type="button"
                  className={FOOTER_BUTTON}
                  disabled={!card || share.busyCardNumber === card.cardNumber}
                  onClick={() => {
                    if (card) void share.requestShare(card.cardNumber)
                  }}
                >
                  <ShareIcon aria-hidden="true" />
                  分享
                </Button>
              ) : collection === null ? null : collection ? (
                <Button
                  type="button"
                  variant="outline"
                  className={cn(FOOTER_BUTTON, "bg-background")}
                  disabled={collection.busy}
                  onClick={collection.onToggleHidden}
                >
                  {collection.hidden ? (
                    <EyeIcon aria-hidden="true" />
                  ) : (
                    <EyeOffIcon aria-hidden="true" />
                  )}
                  {collection.hidden ? "取消隐藏" : "隐藏"}
                </Button>
              ) : (
                <Button
                  type="button"
                  className={FOOTER_BUTTON}
                  aria-label="交换名片"
                  disabled={!canExchange}
                  title={canExchange ? undefined : exchangeBlockedTitle}
                  onClick={() => {
                    if (card && resolvedExchangeTarget) {
                      onExchange?.(card, resolvedExchangeTarget)
                    }
                  }}
                >
                  <ArrowLeftRightIcon aria-hidden="true" />
                  交换
                </Button>
              )}
            </>
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
        {!readOnly && share.target ? (
          <CardShareDialog
            target={share.target}
            open={share.open}
            onOpenChange={share.onOpenChange}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
