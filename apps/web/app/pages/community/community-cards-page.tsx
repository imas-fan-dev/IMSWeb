import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CalendarDaysIcon,
  ImagesIcon,
  PlusIcon,
} from "lucide-react"
import { useEffect, useRef, useState } from "react"
import type { FormEvent } from "react"
import { Link, useSearchParams } from "react-router"
import { toast } from "sonner"

import {
  NamecardPreview,
  type NamecardSide,
} from "~/components/shared/namecard-preview"
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert"
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
import {
  addNamecardReaction,
  getNamecardPage,
  getNamecardReactions,
  NAMECARD_REACTIONS,
} from "~/lib/api"
import type { Namecard, NamecardPage, NamecardReactions } from "~/lib/api"

const NAMECARD_REACTION_SET = new Set<string>(NAMECARD_REACTIONS)
const SESSION_REACTION_LIMIT = 10
const NAMECARD_PAGE_SIZES = [12, 24, 48] as const
const NAMECARD_DATE_FORMATTER = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "long",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "Asia/Shanghai",
})

function namecardCreatedAt(value?: string | null) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.valueOf())) return null
  return {
    dateTime: date.toISOString(),
    label: NAMECARD_DATE_FORMATTER.format(date),
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
    <div className="flex min-h-6 flex-wrap gap-1.5" aria-label="名片反应">
      {activeReactions.map(([emoji, count]) => (
        <Button
          key={emoji}
          type="button"
          size="xs"
          variant="outline"
          disabled={busy !== null}
          aria-label={`${emoji}，${count} 次反应`}
          onClick={() => void react(emoji)}
        >
          <span aria-hidden="true">{emoji}</span>
          {count}
        </Button>
      ))}

      <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
        <PopoverTrigger
          render={
            <Button
              type="button"
              size="icon-xs"
              variant="outline"
              aria-label="添加反应"
              disabled={busy !== null}
            />
          }
        >
          <PlusIcon aria-hidden="true" />
        </PopoverTrigger>
        <PopoverContent align="start" sideOffset={6} className="w-64 sm:w-80">
          <PopoverTitle className="mb-2">选择反应</PopoverTitle>
          <div className="grid grid-cols-6 gap-1 sm:grid-cols-8">
            {NAMECARD_REACTIONS.map((emoji) => (
              <Button
                key={emoji}
                type="button"
                size="icon"
                variant={reactions[emoji] ? "secondary" : "ghost"}
                className="text-base"
                disabled={busy !== null}
                aria-label={`${emoji}，添加反应`}
                onClick={() => void react(emoji)}
              >
                <span aria-hidden="true">{emoji}</span>
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
  onPreview,
}: {
  card: Namecard
  onPreview: (
    card: Namecard,
    side: NamecardSide,
    trigger: HTMLButtonElement
  ) => void
}) {
  const createdAt = namecardCreatedAt(card.created_at)
  return (
    <Card className="h-full">
      <div className="grid grid-cols-2 gap-px bg-border">
        {[card.image1_url, card.image2_url].map((image, index) => (
          <button
            key={`${card.id}-${index === 0 ? "front" : "back"}`}
            type="button"
            className="group relative aspect-3/2 w-full overflow-hidden bg-muted outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            aria-label={`查看制作人名片 ${card.id} ${index === 0 ? "正面" : "背面"}`}
            title="查看大图"
            onClick={(event) =>
              onPreview(
                card,
                index === 0 ? "front" : "back",
                event.currentTarget
              )
            }
          >
            <img
              src={image}
              alt=""
              loading="lazy"
              className="size-full object-cover transition-transform group-hover:scale-[1.02]"
            />
            <span className="absolute inset-0 flex items-center justify-center bg-black/0 text-white opacity-0 transition-colors group-hover:bg-black/35 group-hover:opacity-100 group-focus-visible:bg-black/35 group-focus-visible:opacity-100">
              <ImagesIcon
                className="size-5 drop-shadow-sm"
                aria-hidden="true"
              />
            </span>
          </button>
        ))}
      </div>
      <CardHeader>
        <CardDescription className="flex items-center gap-1.5 tabular-nums">
          <CalendarDaysIcon aria-hidden="true" className="size-3.5" />
          {createdAt ? (
            <time dateTime={createdAt.dateTime}>提交于 {createdAt.label}</time>
          ) : (
            <span>提交时间待补充</span>
          )}
        </CardDescription>
      </CardHeader>
      <CardFooter className="mt-auto">
        <NamecardReactionBar cardId={card.id} />
      </CardFooter>
    </Card>
  )
}

export default function CommunityCardsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const page = pageFromSearchParam(searchParams.get("page"))
  const pageSize = pageSizeFromSearchParam(searchParams.get("size"))
  const [targetPage, setTargetPage] = useState(String(page))
  const [result, setResult] = useState<NamecardPage | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [selectedCard, setSelectedCard] = useState<Namecard | null>(null)
  const [selectedSide, setSelectedSide] = useState<NamecardSide>("front")
  const previewReturnRef = useRef<{
    trigger: HTMLButtonElement
    scrollY: number
  } | null>(null)

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
  }, [page, pageSize])

  function changePage(nextPage: number) {
    setTargetPage(String(nextPage))
    if (nextPage === page) return
    setLoading(true)
    setError(false)
    setTargetPage("1")
    const next = new URLSearchParams(searchParams)
    next.set("page", String(nextPage))
    next.set("size", String(pageSize))
    setSearchParams(next)
  }

  function changePageSize(value: unknown) {
    const nextPageSize = Number(value)
    if (!NAMECARD_PAGE_SIZES.some((size) => size === nextPageSize)) return
    setLoading(true)
    setError(false)
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
    previewReturnRef.current = { trigger, scrollY: window.scrollY }
    setSelectedSide(side)
    setSelectedCard(card)
  }

  function handlePreviewOpenChange(open: boolean) {
    if (open) return
    const returnTarget = previewReturnRef.current
    setSelectedCard(null)
    window.requestAnimationFrame(() => {
      if (!returnTarget) return
      if (returnTarget.trigger.isConnected) {
        returnTarget.trigger.focus({ preventScroll: true })
      }
      window.scrollTo({ top: returnTarget.scrollY, behavior: "auto" })
      previewReturnRef.current = null
    })
  }

  function jumpToPage(event: FormEvent<HTMLFormElement>) {
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
    <main id="main-content" className="mx-auto w-full max-w-6xl px-6 py-12">
      <NamecardPreview
        card={selectedCard}
        side={selectedSide}
        onSideChange={setSelectedSide}
        onOpenChange={handlePreviewOpenChange}
      />

      <Link
        to="/community"
        className={buttonVariants({ variant: "ghost", size: "sm" })}
      >
        <ArrowLeftIcon data-icon="inline-start" />
        返回社区
      </Link>

      <header className="mt-8 max-w-3xl">
        <p className="text-sm font-semibold tracking-[0.2em] text-primary uppercase">
          Producer cards
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight">
          制作人名片墙
        </h1>
        <p className="mt-4 leading-7 text-muted-foreground">
          浏览制作人公开提交的双面名片，并用表情留下回应。新投稿将在运营审核后显示。
        </p>
      </header>

      <section className="mt-10" aria-label="公开名片">
        {loading ? (
          <div className="grid gap-4 md:grid-cols-2">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} className="h-80 rounded-xl" />
            ))}
          </div>
        ) : null}

        {error ? (
          <Alert variant="destructive">
            <ImagesIcon aria-hidden="true" />
            <AlertTitle>暂时无法读取名片墙</AlertTitle>
            <AlertDescription>请稍后刷新页面重试。</AlertDescription>
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
            <div className="grid gap-4 md:grid-cols-2">
              {result.list.map((card) => (
                <NamecardItem
                  key={card.id}
                  card={card}
                  onPreview={openPreview}
                />
              ))}
            </div>
            <div className="mt-6 flex flex-col gap-4 border-t pt-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2">
                  <FieldLabel
                    htmlFor="namecard-page-size"
                    className="shrink-0 font-normal text-muted-foreground"
                  >
                    每页显示
                  </FieldLabel>
                  <Select
                    items={NAMECARD_PAGE_SIZES.map((size) => ({
                      label: `${size} 张`,
                      value: String(size),
                    }))}
                    value={String(pageSize)}
                    onValueChange={changePageSize}
                  >
                    <SelectTrigger id="namecard-page-size" className="w-24">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent align="start" alignItemWithTrigger={false}>
                      <SelectGroup>
                        {NAMECARD_PAGE_SIZES.map((size) => (
                          <SelectItem key={size} value={String(size)}>
                            {size} 张
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>

                <span
                  className="text-sm text-muted-foreground"
                  aria-live="polite"
                >
                  第 {page} / {Math.max(result.totalPage, 1)} 页，共{" "}
                  {result.total} 张
                </span>

                <form
                  className="flex items-center gap-2"
                  onSubmit={jumpToPage}
                  noValidate
                >
                  <FieldLabel
                    htmlFor="namecard-target-page"
                    className="shrink-0 font-normal text-muted-foreground"
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
                    className="w-20"
                    onChange={(event) => setTargetPage(event.target.value)}
                  />
                  <span className="text-sm text-muted-foreground">页</span>
                  <Button type="submit" variant="secondary">
                    跳转
                  </Button>
                </form>
              </div>

              <div className="flex items-center justify-between">
                <Button
                  type="button"
                  variant="outline"
                  disabled={page <= 1}
                  onClick={() => changePage(page - 1)}
                >
                  <ArrowLeftIcon data-icon="inline-start" />
                  上一页
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={page >= result.totalPage}
                  onClick={() => changePage(page + 1)}
                >
                  下一页
                  <ArrowRightIcon data-icon="inline-end" />
                </Button>
              </div>
            </div>
          </>
        ) : null}
      </section>
    </main>
  )
}
