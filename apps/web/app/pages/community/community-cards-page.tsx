import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CalendarDaysIcon,
  ImagesIcon,
  PlusIcon,
  ShieldCheckIcon,
} from "lucide-react"
import { useEffect, useRef, useState } from "react"
import type { SubmitEvent } from "react"
import { useSearchParams } from "react-router"
import { toast } from "sonner"

import { NamecardClaimDialog } from "~/components/community/namecard-claim-dialog"
import { useOptionalPlatformSession } from "~/components/platform/platform-session-provider"
import {
  NamecardPreview,
  type NamecardSide,
} from "~/components/shared/namecard-preview"
import { PageShell } from "~/components/shared/page-shell"
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert"
import { Badge } from "~/components/ui/badge"
import { Button, buttonVariants } from "~/components/ui/button"
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
} from "~/components/ui/card"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "~/components/ui/empty"
import { FieldLabel } from "~/components/ui/field"
import { Input } from "~/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from "~/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select"
import { Skeleton } from "~/components/ui/skeleton"
import { NamecardReactionEmoji } from "~/pages/community/components/namecard-reaction-emoji"
import { NamecardThumbnail } from "~/pages/community/components/namecard-thumbnail"
import { useNamecardMasonry } from "~/pages/community/hooks/use-namecard-masonry"
import { useNamecardPaginationVisibility } from "~/pages/community/hooks/use-namecard-pagination-visibility"
import { useNamecardPreviewNavigation } from "~/pages/community/hooks/use-namecard-preview-navigation"
import { useNamecardPreviewReturn } from "~/pages/community/hooks/use-namecard-preview-return"
import {
  addNamecardReaction,
  getNamecardPage,
  getNamecardReactions,
  NAMECARD_REACTIONS,
} from "~/lib/api"
import type { Namecard, NamecardPage, NamecardReactions } from "~/lib/api"
import { IS_APP_TARGET } from "~/lib/app-target"
import { cn } from "~/lib/utils"
import { NavigationLink } from "~/components/navigation/navigation-link"

const NAMECARD_REACTION_SET = new Set<string>(NAMECARD_REACTIONS)
const SESSION_REACTION_LIMIT = 10
const NAMECARD_PAGE_SIZES = [12, 24, 48] as const
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
const NAMECARD_SHORT_DATE_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "Asia/Shanghai",
})

function namecardCreatedAt(value?: string | null) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.valueOf())) return null
  const parts = Object.fromEntries(
    NAMECARD_SHORT_DATE_FORMATTER.formatToParts(date).map(({ type, value }) => [
      type,
      value,
    ])
  )
  return {
    dateTime: date.toISOString(),
    label: `${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`,
    description: `提交于 ${NAMECARD_DATE_FORMATTER.format(date)}（北京时间）`,
  }
}

function pageFromSearchParam(value: string | null) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1
}

function pageSizeFromSearchParam(value: string | null) {
  const parsed = Number(value)
  return NAMECARD_PAGE_SIZES.find((size) => size === parsed) ?? 12
}

export function meta() {
  return [{ title: "制作人名片墙 | IMSWeb" }]
}

function NamecardReactionBar({ cardId }: { cardId: number }) {
  const [reactions, setReactions] = useState<NamecardReactions>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const sessionCounts = useRef(new Map<string, number>())

  useEffect(() => {
    let active = true
    void getNamecardReactions(cardId)
      .send()
      .then((next) => {
        if (active) setReactions(next)
      })
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [cardId])

  async function react(emoji: string) {
    if (busy !== null) return
    const sessionCount = sessionCounts.current.get(emoji) ?? 0
    if (sessionCount >= SESSION_REACTION_LIMIT) {
      toast.error("这个反应点得太多了")
      return
    }

    setBusy(emoji)
    try {
      await addNamecardReaction(cardId, emoji).send()
      sessionCounts.current.set(emoji, sessionCount + 1)
      setReactions((current) => ({
        ...current,
        [emoji]: (current[emoji] ?? 0) + 1,
      }))
      setPickerOpen(false)
    } catch {
      toast.error("暂时无法添加反应")
    } finally {
      setBusy(null)
    }
  }

  const activeReactions = Object.entries(reactions).filter(
    ([emoji, count]) => count > 0 && NAMECARD_REACTION_SET.has(emoji)
  )

  return (
    <div
      className="-mx-2 flex min-h-11 min-w-0 flex-wrap gap-0 md:mx-0 md:gap-1.5"
      aria-label="名片反应"
    >
      {activeReactions.map(([emoji, count]) => (
        <Button
          key={emoji}
          type="button"
          className="min-h-11 min-w-[max(2.75rem,25%)] gap-0.5 px-0.5 text-xs tabular-nums max-md:focus-visible:ring-inset md:min-w-11 md:gap-1.5 md:border-border md:bg-background md:px-2.5 md:text-sm md:dark:border-input md:dark:bg-input/30 md:dark:hover:bg-input/50"
          variant="ghost"
          disabled={busy !== null}
          aria-label={`${emoji}，${count} 次反应`}
          onClick={() => void react(emoji)}
        >
          <NamecardReactionEmoji emoji={emoji} compact />
          {count}
        </Button>
      ))}

      <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
        <PopoverTrigger
          render={
            <Button
              type="button"
              size="icon"
              className="h-11 min-h-11 w-auto min-w-[max(2.75rem,25%)] max-md:focus-visible:ring-inset md:w-11 md:min-w-11 md:border-border md:bg-background md:dark:border-input md:dark:bg-input/30 md:dark:hover:bg-input/50"
              variant="ghost"
              title="添加反应"
              aria-label="添加反应"
              disabled={busy !== null}
            />
          }
        >
          <PlusIcon aria-hidden="true" />
        </PopoverTrigger>
        <PopoverContent
          align="start"
          sideOffset={6}
          style={{ animation: "none" }}
          className="max-h-(--available-height) w-72 max-w-(--available-width) overflow-y-auto"
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
                disabled={busy !== null}
                aria-label={`${emoji}，添加反应`}
                onClick={() => void react(emoji)}
              >
                <NamecardReactionEmoji emoji={emoji} />
              </Button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}

function NamecardItem({
  card,
  canClaim,
  onPreview,
  onClaim,
}: {
  card: Namecard
  canClaim: boolean
  onPreview: (
    card: Namecard,
    side: NamecardSide,
    trigger: HTMLButtonElement
  ) => void
  onClaim: (card: Namecard) => void
}) {
  const createdAt = namecardCreatedAt(card.created_at)
  return (
    <Card
      data-namecard-item
      className="min-w-0 gap-1 self-start overflow-hidden rounded-lg bg-card pt-0 max-md:group-data-[masonry=ready]/namecards:col-start-(--namecard-column) max-md:group-data-[masonry=ready]/namecards:row-start-(--namecard-start) max-md:group-data-[masonry=ready]/namecards:row-end-(--namecard-end) md:h-full md:gap-4 md:self-stretch md:rounded-xl"
    >
      <div className="grid gap-1 md:grid-cols-2 md:gap-px md:bg-border">
        {(["front", "back"] as const).map((side) => {
          const thumbnail =
            side === "front"
              ? card.image1_thumbnail_url
              : card.image2_thumbnail_url
          const original = side === "front" ? card.image1_url : card.image2_url
          return (
            <button
              key={side}
              type="button"
              className="relative aspect-3/2 min-h-11 w-full overflow-hidden rounded-none bg-muted outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset"
              aria-label={`查看制作人名片 ${card.id} ${side === "front" ? "正面" : "背面"}`}
              title="查看大图"
              onClick={(event) => onPreview(card, side, event.currentTarget)}
            >
              <NamecardThumbnail
                key={`${thumbnail}:${original}`}
                thumbnail={thumbnail}
                original={original}
              />
            </button>
          )
        })}
      </div>
      <CardHeader className="px-2 md:px-4">
        <CardDescription className="flex items-start gap-1.5 text-xs/5 whitespace-nowrap tabular-nums">
          <CalendarDaysIcon
            aria-hidden="true"
            className="mt-0.5 size-3.5 shrink-0"
          />
          {createdAt ? (
            <time
              dateTime={createdAt.dateTime}
              title={createdAt.description}
              aria-label={createdAt.description}
            >
              {createdAt.label}
            </time>
          ) : (
            <span title="提交时间缺失或无效">日期待补</span>
          )}
        </CardDescription>
      </CardHeader>
      <CardFooter className="flex-col items-stretch gap-1 border-0 bg-transparent p-2 pt-0 md:mt-auto md:gap-3 md:border-t md:bg-muted/50 md:p-4">
        <NamecardReactionBar cardId={card.id} />
        {card.claimStatus === "claimed" ? (
          <Badge
            variant="secondary"
            className="h-auto min-h-5 max-w-full whitespace-normal md:h-5 md:whitespace-nowrap"
          >
            <ShieldCheckIcon data-icon="inline-start" aria-hidden="true" />
            已由注册用户认领
          </Badge>
        ) : card.claimStatus === "pending" ? (
          <Badge
            variant="outline"
            className="h-auto min-h-5 max-w-full whitespace-normal md:h-5 md:whitespace-nowrap"
          >
            认领审核中
          </Badge>
        ) : canClaim ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-auto min-h-11 max-w-full self-start text-left whitespace-normal md:h-7 md:whitespace-nowrap"
            onClick={() => onClaim(card)}
          >
            <ShieldCheckIcon data-icon="inline-start" aria-hidden="true" />
            认领这张旧名片
          </Button>
        ) : null}
      </CardFooter>
    </Card>
  )
}

export default function CommunityCardsPage() {
  const platform = useOptionalPlatformSession()
  const canClaim = platform.status === "authenticated"
  const [searchParams, setSearchParams] = useSearchParams()
  const page = pageFromSearchParam(searchParams.get("page"))
  const pageSize = pageSizeFromSearchParam(searchParams.get("size"))
  const [targetPage, setTargetPage] = useState(String(page))
  const [result, setResult] = useState<NamecardPage | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [claimCard, setClaimCard] = useState<Namecard | null>(null)
  const [reload, setReload] = useState(0)
  const listContext = `${page}:${pageSize}`
  const [loadedContext, setLoadedContext] = useState(listContext)
  if (loadedContext !== listContext) {
    setLoadedContext(listContext)
    setLoading(true)
    setError(false)
    setResult(null)
    setTargetPage(String(page))
  }
  const preview = useNamecardPreviewNavigation(searchParams.toString())
  const paginationRef = useNamecardPaginationVisibility()
  const galleryRef = useNamecardMasonry(
    !loading && !error ? result?.list : undefined
  )
  const { fallbackRef, remember, prepareRestore, restore } =
    useNamecardPreviewReturn(searchParams.toString())

  useEffect(() => {
    const next = new URLSearchParams(searchParams)
    let changed = false
    if (searchParams.get("page") !== String(page)) {
      next.set("page", String(page))
      changed = true
    }
    if (searchParams.get("size") !== String(pageSize)) {
      next.set("size", String(pageSize))
      changed = true
    }
    if (changed) setSearchParams(next, { replace: true })
  }, [page, pageSize, searchParams, setSearchParams])

  useEffect(() => {
    let active = true
    void getNamecardPage(page, pageSize)
      .send()
      .then((next) => {
        if (active) setResult(next)
      })
      .catch(() => {
        if (active) setError(true)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [page, pageSize, reload])

  function changePage(nextPage: number) {
    setTargetPage(String(nextPage))
    if (nextPage === page) return
    const next = new URLSearchParams(searchParams)
    next.set("page", String(nextPage))
    next.set("size", String(pageSize))
    setSearchParams(next)
  }

  function changePageSize(value: unknown) {
    const nextPageSize = Number(value)
    if (
      !NAMECARD_PAGE_SIZES.some((size) => size === nextPageSize) ||
      nextPageSize === pageSize
    )
      return
    const next = new URLSearchParams(searchParams)
    next.set("page", "1")
    next.set("size", String(nextPageSize))
    setSearchParams(next)
  }

  function openPreview(
    card: Namecard,
    side: NamecardSide,
    trigger: HTMLButtonElement
  ) {
    if (!result) return
    remember(trigger)
    preview.open({
      result,
      page,
      pageSize,
      index: result.list.findIndex((item) => item.id === card.id),
      side,
    })
  }

  function handlePreviewOpenChange(open: boolean) {
    if (open) return
    prepareRestore()
    preview.close()
  }

  function jumpToPage(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    const totalPages = Math.max(result?.totalPage ?? 0, 1)
    const nextPage = Number(targetPage)
    if (!Number.isInteger(nextPage) || nextPage < 1 || nextPage > totalPages) {
      toast.error(`请输入 1 到 ${totalPages} 之间的页码`)
      return
    }
    changePage(nextPage)
  }

  return (
    <PageShell
      width="wide"
      className={!IS_APP_TARGET ? "py-3 sm:py-3 md:py-8" : undefined}
    >
      <NamecardPreview
        card={preview.card}
        side={preview.side}
        onSideChange={preview.changeSide}
        onOpenChange={handlePreviewOpenChange}
        navigation={preview.navigation}
        onReturnFocus={restore}
      />
      <NamecardClaimDialog
        card={canClaim ? claimCard : null}
        open={canClaim && claimCard !== null}
        onOpenChange={(open) => {
          if (!open) setClaimCard(null)
        }}
        onSubmitted={() => {
          if (!claimCard) return
          setResult((current) =>
            current
              ? {
                  ...current,
                  list: current.list.map((card) =>
                    card.id === claimCard.id
                      ? {
                          ...card,
                          claimStatus: "pending",
                          viewerClaimState: "pending",
                        }
                      : card
                  ),
                }
              : current
          )
        }}
      />

      {!IS_APP_TARGET ? (
        <NavigationLink
          to="/community"
          className={cn(
            buttonVariants({ variant: "ghost", size: "sm" }),
            "min-h-11"
          )}
        >
          <ArrowLeftIcon data-icon="inline-start" />
          返回社区
        </NavigationLink>
      ) : null}

      <header className={cn("max-w-3xl", !IS_APP_TARGET && "mt-1 md:mt-3")}>
        <h1 className="text-xl font-semibold wrap-anywhere md:text-2xl">
          制作人名片墙
        </h1>
      </header>

      <section
        ref={fallbackRef}
        tabIndex={-1}
        className="mt-3 md:mt-6"
        aria-label="公开名片"
        aria-busy={loading}
      >
        {loading ? (
          <div role="status">
            <span className="sr-only">正在读取名片墙…</span>
            <div className="grid grid-cols-2 gap-x-2 gap-y-3 md:gap-4">
              {Array.from({ length: 4 }, (_, index) => (
                <Skeleton
                  key={index}
                  className="aspect-3/4 rounded-lg md:aspect-2/1"
                />
              ))}
            </div>
          </div>
        ) : null}

        {error ? (
          <Alert variant="destructive">
            <ImagesIcon aria-hidden="true" />
            <AlertTitle>暂时无法读取名片墙</AlertTitle>
            <AlertDescription>
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                onClick={() => {
                  setError(false)
                  setLoading(true)
                  setReload((current) => current + 1)
                }}
              >
                重试读取名片墙
              </Button>
            </AlertDescription>
          </Alert>
        ) : null}

        {!loading && !error && result?.list.length === 0 ? (
          <Empty className="min-h-64 border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <ImagesIcon aria-hidden="true" />
              </EmptyMedia>
              <EmptyTitle>还没有公开名片</EmptyTitle>
              <EmptyDescription>
                你可以提交第一张双面制作人名片。
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : null}

        {!loading && !error && result?.list.length ? (
          <>
            <div
              ref={galleryRef}
              data-namecard-gallery
              className="group/namecards grid grid-cols-2 gap-x-2 gap-y-3 max-md:data-[masonry=ready]:grid-rows-(--namecard-rows) max-md:data-[masonry=ready]:gap-y-0 md:gap-4"
            >
              {result.list.map((card) => (
                <NamecardItem
                  key={card.id}
                  card={card}
                  canClaim={canClaim}
                  onPreview={openPreview}
                  onClaim={setClaimCard}
                />
              ))}
            </div>
            <nav
              ref={paginationRef}
              aria-label="名片分页"
              className="mt-4 grid grid-cols-[44px_minmax(0,1fr)_minmax(0,1fr)_44px] items-center gap-2 border-t pt-3 md:mt-6 md:grid-cols-[auto_minmax(0,1fr)_auto_auto] md:gap-y-4 md:pt-4"
            >
              <div className="col-span-2 col-start-3 row-start-2 flex min-w-0 items-center gap-1 justify-self-end md:col-span-1 md:col-start-1 md:row-start-1 md:gap-2 md:justify-self-start">
                <FieldLabel
                  htmlFor="namecard-page-size"
                  className="shrink-0 text-xs font-normal text-muted-foreground md:text-sm"
                >
                  每页<span className="sr-only md:not-sr-only">显示</span>
                </FieldLabel>
                <Select
                  items={NAMECARD_PAGE_SIZES.map((size) => ({
                    label: `${size} 张`,
                    value: String(size),
                  }))}
                  value={String(pageSize)}
                  onValueChange={changePageSize}
                >
                  <SelectTrigger
                    id="namecard-page-size"
                    aria-label="每页显示"
                    className="h-11 min-h-11 w-20 md:w-24"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent align="start" alignItemWithTrigger={false}>
                    <SelectGroup>
                      {NAMECARD_PAGE_SIZES.map((size) => (
                        <SelectItem
                          key={size}
                          value={String(size)}
                          className="min-h-11"
                        >
                          {size} 张
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>

              <span
                className="col-span-2 col-start-1 row-start-2 min-w-0 text-xs/5 text-muted-foreground tabular-nums md:col-span-1 md:col-start-3 md:row-start-1 md:text-sm"
                aria-live="polite"
              >
                第 {page} / {Math.max(result.totalPage, 1)} 页，共{" "}
                {result.total} 张
              </span>

              <form
                className="col-span-2 col-start-2 row-start-1 flex min-w-0 items-center justify-center gap-1 md:col-span-1 md:col-start-4 md:gap-2"
                onSubmit={jumpToPage}
                noValidate
              >
                <FieldLabel
                  htmlFor="namecard-target-page"
                  className="sr-only font-normal text-muted-foreground md:not-sr-only md:shrink-0"
                >
                  跳至
                </FieldLabel>
                <Input
                  id="namecard-target-page"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={Math.max(result.totalPage, 1)}
                  value={targetPage}
                  className="h-11 w-14 min-w-0 text-center tabular-nums md:w-20"
                  onChange={(event) => setTargetPage(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      event.preventDefault()
                      setTargetPage(String(page))
                    }
                  }}
                />
                <span className="shrink-0 text-sm text-muted-foreground tabular-nums">
                  <span className="md:hidden">
                    / {Math.max(result.totalPage, 1)}
                  </span>
                  <span className="hidden md:inline">页</span>
                </span>
                <Button
                  type="submit"
                  variant="secondary"
                  className="h-11 min-w-11 shrink-0 px-2 md:px-3"
                  disabled={targetPage === String(page)}
                >
                  跳转
                </Button>
              </form>

              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="上一页"
                title="上一页"
                className="col-start-1 row-start-1 size-11 justify-self-start md:row-start-2 md:w-auto md:px-3"
                disabled={page <= 1}
                onClick={() => changePage(page - 1)}
              >
                <ArrowLeftIcon aria-hidden="true" />
                <span className="hidden md:inline">上一页</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="下一页"
                title="下一页"
                className="col-start-4 row-start-1 size-11 justify-self-end md:row-start-2 md:w-auto md:px-3"
                disabled={page >= result.totalPage}
                onClick={() => changePage(page + 1)}
              >
                <span className="hidden md:inline">下一页</span>
                <ArrowRightIcon aria-hidden="true" />
              </Button>
            </nav>
          </>
        ) : null}
      </section>
    </PageShell>
  )
}
