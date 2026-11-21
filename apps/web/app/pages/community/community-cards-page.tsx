import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CalendarDaysIcon,
  ImagesIcon,
  ListFilterIcon,
} from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import type { SubmitEvent } from "react"
import { useSearchParams } from "react-router"
import { toast } from "sonner"
import {
  namecardWallSeedSchema,
  namecardWallSortSchema,
  type NamecardCollectionDirection,
  type NamecardWallSort,
} from "@imsweb/contracts/namecards"

import { NAMECARD_TAG_FILTER_LIMIT } from "@imsweb/contracts/namecards/runtime"

import {
  DEFAULT_NAMECARD_FILTERS,
  NamecardFilterBar,
  type NamecardFilterValue,
} from "~/components/community/namecard-filters/namecard-filter-bar"
import { NamecardClaimBadge } from "~/components/community/namecard-claim-badge"
import { NamecardClaimDialog } from "~/components/community/namecard-claim-dialog"
import { ExchangeCardPickerDialog } from "~/components/community/exchange/exchange-card-picker-dialog"
import { useExchangeSubmit } from "~/components/community/exchange/use-exchange-submit"
import { WallInsightsPanel } from "./components/wall-insights-panel"
import { NamecardWallOrder } from "./components/namecard-wall-order"
import { NamecardSupplementDialog } from "~/components/community/namecard-supplement-dialog"
import { NamecardTagEditor } from "~/components/community/namecard-tag-editor"
import {
  normalizeTagText,
  tagComparisonKey,
} from "~/components/community/use-tag-suggestions"
import { NamecardWallCarousel } from "~/components/community/namecard-wall-carousel"
import { useOptionalPlatformSession } from "~/components/platform/platform-session-provider"
import { FitText } from "~/components/shared/fit-text"
import {
  NamecardPreview,
  type NamecardSide,
} from "~/components/shared/namecard-preview"
import { namecardPages } from "~/components/shared/namecard-pages"
import { PageShell } from "~/components/shared/page-shell"
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert"
import { Button, buttonVariants } from "~/components/ui/button"
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
} from "~/components/ui/card"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "~/components/ui/collapsible"
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
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select"
import { Skeleton } from "~/components/ui/skeleton"
import {
  NamecardDetailDialog,
  NamecardReactionSummary,
  type NamecardReactionState,
} from "~/pages/community/components/namecard-detail-dialog"
import { useNamecardMasonry } from "~/pages/community/hooks/use-namecard-masonry"
import { useNamecardPaginationVisibility } from "~/pages/community/hooks/use-namecard-pagination-visibility"
import { useNamecardDetailSession } from "~/pages/community/hooks/use-namecard-detail-session"
import { useNamecardDetailReturn } from "~/pages/community/hooks/use-namecard-detail-return"
import type { SeriesOption } from "~/components/community/series-multi-select"
import {
  addNamecardReaction,
  getFudabaSeries,
  getNamecardPage,
  getPublicCard,
  getNamecardReactions,
  requestCardExchange,
} from "~/lib/api"
import type { Namecard, NamecardPage } from "~/lib/api"
import { IS_APP_TARGET } from "~/lib/app-target"
import { createRandomId } from "~/lib/random-id"
import { useNamecardCharacterCatalog } from "~/lib/use-namecard-character-catalog"
import { cn } from "~/lib/utils"
import { NavigationLink } from "~/components/navigation/navigation-link"

const NAMECARD_PAGE_SIZES = [12, 24, 48] as const
/** 制作人检索与名片册同一停顿，避免每敲一个字就发一次列表请求。 */
const SEARCH_DEBOUNCE_MS = 300
const SESSION_REACTION_LIMIT = 10
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

function NamecardItem({
  card,
  reactions,
  busy,
  canEditTags,
  onOpenDetail,
  onReact,
  onTagClick,
  onTagsChange,
}: {
  card: Namecard
  reactions: NamecardReactionState
  busy: boolean
  /** 匿名只读：chips 照常显示，但【+】与保存行不可用。 */
  canEditTags: boolean
  onOpenDetail: (
    card: Namecard,
    trigger: HTMLButtonElement | null,
    side?: NamecardSide
  ) => void
  onReact: (cardId: number, emoji: string) => Promise<boolean>
  /** 点击已保存标签：追加到名片墙的标签筛选。 */
  onTagClick: (tag: string) => void
  onTagsChange: (cardId: number, tags: string[]) => void
}) {
  const createdAt = namecardCreatedAt(card.created_at)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  /** 轮播在 pointerup 就打开详情，click 捕获太晚；两条路径都要记下触发按钮。 */
  const captureTrigger = (target: EventTarget | null) => {
    const button =
      target instanceof Element ? target.closest("button") : null
    triggerRef.current = button instanceof HTMLButtonElement ? button : null
  }
  const tags = card.tags?.map((tag) => tag.name) ?? []
  const producerName = card.producerName || `名片 #${card.cardNumber ?? card.id}`
  const producer = (
    <FitText
      text={producerName}
      className="text-xs font-medium md:text-sm"
    />
  )
  return (
    <Card
      data-namecard-item
      className="min-w-0 gap-1 self-start overflow-hidden rounded-lg bg-card pt-0 max-md:group-data-[masonry=ready]/namecards:col-start-(--namecard-column) max-md:group-data-[masonry=ready]/namecards:row-start-(--namecard-start) max-md:group-data-[masonry=ready]/namecards:row-end-(--namecard-end) md:gap-0 md:rounded-xl md:bg-muted/50"
    >
      {/* 轮播自己只回传正/背面；打开详情要聚焦回原来那张图的按钮，所以在这里
          捕获点击目标（pointerdown 早于轮播在 pointerup 里打开详情）。 */}
      <div
        onPointerDownCapture={(event) => captureTrigger(event.target)}
        onClickCapture={(event) => captureTrigger(event.target)}
      >
        <NamecardWallCarousel
          pages={card.pages ?? []}
          cardNumber={card.cardNumber ?? card.id}
          pageCount={card.pageCount}
          onOpen={(side) => onOpenDetail(card, triggerRef.current, side)}
        />
      </div>
      <CardHeader className="flex flex-col items-stretch gap-0.5 px-1.5 pt-1.5 md:gap-1 md:px-4 md:pt-3">
        <div className="flex min-w-0 items-center gap-1.5">
          {card.claimerUid !== null && card.claimerUid !== undefined ? (
            <NavigationLink
              to={`/user/${card.claimerUid}`}
              className="min-w-0 underline-offset-2 hover:underline"
            >
              {producer}
            </NavigationLink>
          ) : (
            <div className="min-w-0">{producer}</div>
          )}
          <NamecardClaimBadge card={card} iconOnly />
        </div>
        <CardDescription className="flex items-start gap-1.5 text-xs/5 whitespace-nowrap tabular-nums">
          <CalendarDaysIcon
            aria-hidden="true"
            className="mt-0.5 size-3.5 shrink-0 max-md:hidden"
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
      <CardFooter className="flex-col items-stretch gap-1 border-0 bg-transparent p-1.5 md:gap-1.5 md:px-4 md:pt-3 md:pb-4">
        <NamecardTagEditor
          variant="inline"
          value={tags}
          cardId={card.cardId}
          disabled={!canEditTags}
          onValueClick={onTagClick}
          onChange={(next) => onTagsChange(card.id, next)}
        />
        <NamecardReactionSummary
          {...reactions}
          busy={busy}
          size="sm"
          onOpen={(trigger) => onOpenDetail(card, trigger)}
          onReact={(emoji) => onReact(card.id, emoji)}
        />
      </CardFooter>
    </Card>
  )
}

export default function CommunityCardsPage() {
  const platform = useOptionalPlatformSession()
  const canClaim = platform.status === "authenticated"
  // 标签与内容解耦：登录用户可改任意名片的标签，匿名只读。
  const canEditTags = platform.status === "authenticated"
  const [searchParams, setSearchParams] = useSearchParams()
  const page = pageFromSearchParam(searchParams.get("page"))
  const pageSize = pageSizeFromSearchParam(searchParams.get("size"))
  const sort =
    namecardWallSortSchema.safeParse(searchParams.get("sort")).data ?? "created"
  const seed = namecardWallSeedSchema.safeParse(searchParams.get("seed")).data
  const rawDir = searchParams.get("dir")
  const dir: NamecardCollectionDirection =
    rawDir === "asc" || rawDir === "desc"
      ? rawDir
      : sort === "created" || sort === "date"
        ? "desc"
        : "asc"
  const [targetPage, setTargetPage] = useState(String(page))
  const [result, setResult] = useState<NamecardPage | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [lastLoadedPage, setLastLoadedPage] = useState(page)
  const [requestedPage, setRequestedPage] = useState<number | null>(null)
  const [appendError, setAppendError] = useState(false)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const [claimCard, setClaimCard] = useState<Namecard | null>(null)
  const [supplementCard, setSupplementCard] = useState<Namecard | null>(null)
  const [previewIndex, setPreviewIndex] = useState<number | null>(null)
  const [detailSide, setDetailSide] = useState<NamecardSide | null>(null)
  const [previewReturnTarget, setPreviewReturnTarget] =
    useState<HTMLButtonElement | null>(null)
  const [reactionsByCard, setReactionsByCard] = useState<
    Record<number, NamecardReactionState>
  >({})
  // Keep IDs after the request settles: the next effect can run before the
  // corresponding reaction state has committed.
  const requestedReactionCardIds = useRef(new Set<number>())
  const reactionVersions = useRef(new Map<number, number>())
  const reactionEmojiVersions = useRef(new Map<number, Map<string, number>>())
  const reactionMutations = useRef(new Set<number>())
  const sessionReactionCounts = useRef(new Map<string, number>())
  const [busyReactionCards, setBusyReactionCards] = useState(new Set<number>())
  const [reload, setReload] = useState(0)
  const [filters, setFilters] = useState<NamecardFilterValue>(
    DEFAULT_NAMECARD_FILTERS
  )
  // 搜索框即时响应，查询串慢半拍（与名片册一致）。
  const [search, setSearch] = useState("")
  const [series, setSeries] = useState<readonly SeriesOption[]>([])
  const { catalog, loading: catalogLoading } = useNamecardCharacterCatalog(true)

  const {
    seriesCodes,
    group,
    characterIds,
    tags,
    matchAll,
    excludeOther,
    excludeCross,
    declaration,
    invert,
  } = filters
  const query = useMemo(() => {
    return {
      sort,
      seed: sort === "random" ? seed : undefined,
      dir: sort === "random" ? undefined : dir,
      q: search || undefined,
      series: seriesCodes,
      group: group.trim() || undefined,
      character: characterIds,
      tags,
      match: matchAll ? ("all" as const) : ("any" as const),
      excludeOther,
      excludeCross,
      declaration: declaration ?? undefined,
      invert,
    }
  }, [
    seriesCodes,
    group,
    characterIds,
    tags,
    matchAll,
    excludeOther,
    excludeCross,
    declaration,
    invert,
    search,
    sort,
    seed,
    dir,
  ])
  const random = sort === "random"
  const listContext = JSON.stringify([
    page,
    pageSize,
    query,
    random ? reload : null,
  ])
  const [loadedContext, setLoadedContext] = useState(listContext)
  if (loadedContext !== listContext) {
    setLoadedContext(listContext)
    setLoading(true)
    setError(false)
    setResult(null)
    setLastLoadedPage(page)
    setRequestedPage(null)
    setAppendError(false)
    setTargetPage(String(page))
  }
  const detail = useNamecardDetailSession(searchParams.toString())
  const paginationRef = useNamecardPaginationVisibility()
  const galleryRef = useNamecardMasonry(
    !loading && !error ? result?.list : undefined
  )
  const { fallbackRef, remember, prepareRestore, restore } =
    useNamecardDetailReturn(searchParams.toString())
  const nextPage =
    random && result && lastLoadedPage < result.totalPage
      ? lastLoadedPage + 1
      : null

  // 【交换】入口：页面层一个选卡窗口，详情窗只负责打开它——详情窗保持打开，
  // 选卡窗口叠在上面。
  const [exchangeRequest, setExchangeRequest] = useState<{
    cardNumber: number
    target?: string | undefined
    targetCard?: number | undefined
  } | null>(null)
  const exchangeSubmit = useExchangeSubmit({
    onSettled: () => setReload((n) => n + 1),
  })

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
    if (sort === "random" && !seed) {
      // 初次浏览在挂载后建立种子，预渲染与水合阶段不生成随机值。
      next.set("sort", "random")
      next.set("seed", createRandomId())
      next.delete("dir")
      changed = true
    }
    if (changed) setSearchParams(next, { replace: true })
  }, [page, pageSize, searchParams, seed, setSearchParams, sort])

  useEffect(() => {
    const timer = setTimeout(
      () => setSearch(filters.q.trim()),
      SEARCH_DEBOUNCE_MS
    )
    return () => clearTimeout(timer)
  }, [filters.q])

  useEffect(() => {
    let active = true
    void getFudabaSeries()
      .send()
      .then((payload) => {
        if (active) setSeries(payload.items)
      })
      .catch(() => {
        if (active) setSeries([])
      })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (query.sort === "random" && !query.seed) return
    let active = true
    void getNamecardPage(page, pageSize, query)
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
  }, [page, pageSize, query, reload])

  useEffect(() => {
    if (!requestedPage) return
    let active = true
    void getNamecardPage(requestedPage, pageSize, query)
      .send()
      .then((next) => {
        if (!active) return
        setLastLoadedPage(requestedPage)
        setResult((current) => {
          if (!current) return next
          const seen = new Set(current.list.map((card) => card.id))
          return {
            ...next,
            list: [
              ...current.list,
              ...next.list.filter((card) => !seen.has(card.id)),
            ],
          }
        })
      })
      .catch(() => {
        if (active) setAppendError(true)
      })
      .finally(() => {
        if (active) setRequestedPage(null)
      })
    return () => {
      active = false
    }
  }, [requestedPage, pageSize, query])

  const detailOpen = detail.card !== null
  useEffect(() => {
    const target = sentinelRef.current
    if (
      !target ||
      !nextPage ||
      requestedPage ||
      appendError ||
      detailOpen ||
      typeof IntersectionObserver === "undefined"
    )
      return
    let active = true
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (active && entry?.isIntersecting) setRequestedPage(nextPage)
      },
      { rootMargin: "0px 0px 160px 0px" }
    )
    observer.observe(target)
    return () => {
      active = false
      observer.disconnect()
    }
  }, [appendError, detailOpen, nextPage, requestedPage])

  // 站内信与「随机补充一张」用 ?card=<编号> 深链到任意一张名片，当前页里
  // 通常没有它，所以要单独取一次。
  const deepLinkFetched = useRef<string | null>(null)
  useEffect(() => {
    if (!result || detail.card) return
    const wanted = searchParams.get("card")
    if (!wanted) return
    const found = result.list.find(
      (item) =>
        String(item.cardNumber ?? item.id) === wanted ||
        String(item.id) === wanted
    )
    if (found) {
      detail.open(found)
      return
    }
    const cardNumber = Number(wanted)
    if (!Number.isSafeInteger(cardNumber) || cardNumber <= 0) return
    if (deepLinkFetched.current === wanted) return
    deepLinkFetched.current = wanted
    // `detail` 每次渲染都是新对象，effect 会重复执行；用 ref 保证只取一次。
    void getPublicCard(cardNumber)
      .send()
      .then((payload) => {
        if (payload.card) detail.open(payload.card)
        else toast.error("这张名片暂时无法查看")
      })
      .catch(() => {
        toast.error("这张名片暂时无法查看")
      })
  }, [detail, result, searchParams])

  useEffect(() => {
    if (!result) return
    for (const card of result.list) {
      if (requestedReactionCardIds.current.has(card.id)) continue
      requestedReactionCardIds.current.add(card.id)
      const version = reactionVersions.current.get(card.id) ?? 0
      void getNamecardReactions(card.id)
        .send()
        .then((reactions) => {
          setReactionsByCard((current) => {
            const merged = { ...reactions }
            for (const [emoji, changedAt] of reactionEmojiVersions.current.get(
              card.id
            ) ?? []) {
              if (changedAt > version) {
                merged[emoji] = current[card.id]?.reactions[emoji] ?? 0
              }
            }
            return {
              ...current,
              [card.id]: { reactions: merged, loading: false },
            }
          })
        })
        .catch(() => {
          setReactionsByCard((current) => ({
            ...current,
            [card.id]: {
              reactions: current[card.id]?.reactions ?? {},
              loading: false,
            },
          }))
        })
    }
  }, [result])

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

  function changeOrder(
    nextSort: NamecardWallSort,
    nextDir?: NamecardCollectionDirection,
    reshuffle = false
  ) {
    const next = new URLSearchParams(searchParams)
    next.set("sort", nextSort)
    next.set("page", "1")
    if (nextSort === "random") {
      if (reshuffle || !seed) next.set("seed", createRandomId())
      next.delete("dir")
    } else if (nextDir) {
      next.set("dir", nextDir)
    } else {
      next.delete("dir")
    }
    setSearchParams(next)
  }

  function changeFilters(next: NamecardFilterValue) {
    setFilters(next)
    if (page === 1) return
    // 筛选变化回第 1 页，但保留这轮随机顺序。
    const params = new URLSearchParams(searchParams)
    params.set("page", "1")
    params.set("size", String(pageSize))
    setSearchParams(params)
  }

  function openDetail(
    card: Namecard,
    trigger: HTMLButtonElement | null,
    side?: NamecardSide
  ) {
    if (!result) return
    if (trigger) remember(trigger)
    setDetailSide(side ?? null)
    detail.open(card)
  }

  /** 墙 / 详情窗保存标签后，把列表里同一张卡与打开中的详情一起换掉。 */
  function updateCardTags(cardId: number, tags: string[]) {
    const update = (card: Namecard): Namecard => ({
      ...card,
      tags: tags.map((name) => ({ name, presetId: null })),
    })
    setResult((current) =>
      current
        ? {
            ...current,
            list: current.list.map((card) =>
              card.id === cardId ? update(card) : card
            ),
          }
        : current
    )
    detail.updateCard(cardId, update)
  }

  /** 点瓦片上的标签：追加筛选（归一去重），到上限就提示。 */
  function appendTagFilter(tag: string) {
    const text = normalizeTagText(tag)
    if (!text) return
    const key = tagComparisonKey(text)
    if (filters.tags.some((current) => tagComparisonKey(current) === key)) return
    if (filters.tags.length >= NAMECARD_TAG_FILTER_LIMIT) {
      toast.error(`最多同时筛选 ${NAMECARD_TAG_FILTER_LIMIT} 个标签`)
      return
    }
    changeFilters({ ...filters, tags: [...filters.tags, text] })
  }

  function recordReaction(cardId: number, emoji: string) {
    const version = (reactionVersions.current.get(cardId) ?? 0) + 1
    reactionVersions.current.set(cardId, version)
    const emojiVersions =
      reactionEmojiVersions.current.get(cardId) ?? new Map<string, number>()
    emojiVersions.set(emoji, version)
    reactionEmojiVersions.current.set(cardId, emojiVersions)
    setReactionsByCard((current) => ({
      ...current,
      [cardId]: {
        reactions: {
          ...(current[cardId]?.reactions ?? {}),
          [emoji]: (current[cardId]?.reactions[emoji] ?? 0) + 1,
        },
        loading: false,
      },
    }))
  }

  async function reactToCard(cardId: number, emoji: string) {
    if (reactionMutations.current.has(cardId)) return false
    const sessionKey = `${cardId}:${emoji}`
    const count = sessionReactionCounts.current.get(sessionKey) ?? 0
    if (count >= SESSION_REACTION_LIMIT) {
      toast.error("这个反应点得太多了")
      return false
    }
    reactionMutations.current.add(cardId)
    setBusyReactionCards((current) => new Set(current).add(cardId))
    try {
      await addNamecardReaction(cardId, emoji).send()
      sessionReactionCounts.current.set(sessionKey, count + 1)
      recordReaction(cardId, emoji)
      return true
    } catch {
      toast.error("暂时无法添加反应")
      return false
    } finally {
      reactionMutations.current.delete(cardId)
      setBusyReactionCards((current) => {
        const next = new Set(current)
        next.delete(cardId)
        return next
      })
    }
  }

  function closeDetail() {
    if (previewIndex !== null) return
    prepareRestore()
    detail.close()
    if (searchParams.has("card")) {
      const next = new URLSearchParams(searchParams)
      next.delete("card")
      setSearchParams(next, { replace: true })
    }
  }

  function openPreview(index: number, trigger: HTMLButtonElement) {
    setPreviewReturnTarget(trigger)
    setPreviewIndex(index)
  }

  function closePreview() {
    setPreviewIndex(null)
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

  const filtered =
    filters.q.trim() !== "" ||
    filters.characterIds.length > 0 ||
    filters.seriesCodes.length > 0 ||
    filters.tags.length > 0 ||
    filters.group.trim() !== "" ||
    filters.matchAll ||
    filters.excludeOther ||
    filters.excludeCross ||
    filters.invert ||
    filters.declaration !== null

  return (
    <PageShell
      width="wide"
      className={!IS_APP_TARGET ? "py-3 sm:py-3 md:py-8" : undefined}
    >
      <WallInsightsPanel
        onPickCard={(cardNumber) => {
          const next = new URLSearchParams(searchParams)
          next.set("card", String(cardNumber))
          setSearchParams(next)
        }}
      />
      <NamecardPreview
        card={previewIndex === null ? null : detail.card}
        pages={detail.card ? namecardPages(detail.card) : []}
        index={previewIndex ?? 0}
        onIndexChange={setPreviewIndex}
        onOpenChange={(open) => {
          if (!open) closePreview()
        }}
        finalFocus={() => previewReturnTarget}
      />
      {/* 公开墙只有卡号（投影里 `claimerUid` 恒为 null）：详情窗把卡号交给选卡窗口反查卡主。 */}
      <NamecardDetailDialog
        card={detail.card}
        canClaim={canClaim}
        initialSide={detailSide}
        busy={detail.card ? busyReactionCards.has(detail.card.id) : false}
        exchangeTargetCard={detail.card?.cardNumber}
        reactions={
          detail.card
            ? (reactionsByCard[detail.card.id] ?? {
                reactions: {},
                loading: true,
              })
            : { reactions: {}, loading: false }
        }
        onOpenChange={(open) => {
          // 选卡窗口叠在详情窗上时，只有上层收：下层的关闭请求一律忽略。
          if (!open && exchangeRequest !== null) return
          if (!open) closeDetail()
        }}
        onOpenPreview={openPreview}
        onClaim={setClaimCard}
        onSupplement={setSupplementCard}
        onExchange={(card, target) => {
          // 详情窗不收起：选卡窗口叠在它上面，关掉选卡后还能继续看这张卡。
          setExchangeRequest({
            cardNumber: card.cardNumber,
            target: "accountId" in target ? target.accountId : undefined,
            targetCard: "cardNumber" in target ? target.cardNumber : undefined,
          })
        }}
        dismissible={
          claimCard === null &&
          supplementCard === null &&
          exchangeRequest === null
        }
        onReact={(emoji) =>
          detail.card
            ? reactToCard(detail.card.id, emoji)
            : Promise.resolve(false)
        }
        onTagsChange={(tags) => {
          if (detail.card) updateCardTags(detail.card.id, tags)
        }}
        onReturnFocus={restore}
      />
      {/* 详情窗的【交换】落点：一页一个选卡窗口，成功后用 reload 重取列表与逐卡标记。 */}
      <ExchangeCardPickerDialog
        open={exchangeRequest !== null}
        onOpenChange={(open) => {
          if (!open) setExchangeRequest(null)
        }}
        target={exchangeRequest?.target}
        targetCard={exchangeRequest?.targetCard}
        onSubmit={(cardNumbers) => {
          const request = exchangeRequest
          if (!request) return
          void exchangeSubmit.submit((clientExchangeId) =>
            requestCardExchange(request.cardNumber, {
              clientExchangeId,
              giveCardNumbers: cardNumbers,
            })
          )
        }}
      />
      <NamecardSupplementDialog
        key={`supplement:${supplementCard?.id ?? "none"}`}
        card={canClaim ? supplementCard : null}
        open={canClaim && supplementCard !== null}
        onOpenChange={(open) => {
          if (!open) setSupplementCard(null)
        }}
        onSubmitted={() => {
          const submitted = supplementCard
          setSupplementCard(null)
          if (!submitted) return
          setResult((current) =>
            current
              ? {
                  ...current,
                  list: current.list.map((card) =>
                    card.id === submitted.id
                      ? { ...card, supplementPending: true }
                      : card
                  ),
                }
              : current
          )
        }}
      />
      <NamecardClaimDialog
        key={`claim:${claimCard?.id ?? "none"}`}
        card={canClaim ? claimCard : null}
        open={canClaim && claimCard !== null}
        onOpenChange={(open) => {
          if (!open) setClaimCard(null)
        }}
        onSubmitted={() => {
          if (!claimCard) return
          const update = (card: Namecard): Namecard => ({
            ...card,
            claimStatus: "pending",
            viewerClaimState: "pending",
          })
          setResult((current) =>
            current
              ? {
                  ...current,
                  list: current.list.map((card) =>
                    card.id === claimCard.id ? update(card) : card
                  ),
                }
              : current
          )
          detail.updateCard(claimCard.id, update)
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

      <Collapsible className="mt-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <NamecardWallOrder
            sort={sort}
            dir={dir}
            onSortChange={(nextSort) => changeOrder(nextSort)}
            onDirectionChange={(nextDir) => changeOrder(sort, nextDir)}
            onReshuffle={() => changeOrder("random", undefined, true)}
          />
          <CollapsibleTrigger
            render={<Button type="button" variant="outline" />}
          >
            <ListFilterIcon data-icon="inline-start" aria-hidden="true" />
            {filtered ? "筛选（已应用）" : "筛选"}
          </CollapsibleTrigger>
        </div>
        <CollapsibleContent keepMounted>
          <div className="mt-3 rounded-lg border p-3">
            <NamecardFilterBar
              value={filters}
              onChange={changeFilters}
              hideSort
              series={series}
              catalog={catalog}
              catalogLoading={catalogLoading}
              showOwner={false}
              showTags
            />
          </div>
        </CollapsibleContent>
      </Collapsible>

      <section
        ref={fallbackRef}
        className="mt-3 md:mt-6"
        tabIndex={-1}
        aria-label="公开名片"
        aria-busy={loading}
      >
        {loading ? (
          <div role="status">
            <span className="sr-only">正在读取名片墙…</span>
            <div className="grid grid-cols-2 gap-x-2 gap-y-3 sm:grid-cols-3 md:gap-4 lg:grid-cols-4">
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
              <EmptyTitle>
                {filtered ? "没有符合条件的名片" : "还没有公开名片"}
              </EmptyTitle>
              <EmptyDescription>
                {filtered
                  ? "换个筛选条件试试。"
                  : "你可以提交第一张双面制作人名片。"}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : null}

        {!loading && !error && result?.list.length ? (
          <>
            <div
              ref={galleryRef}
              data-namecard-gallery
              className="group/namecards grid grid-cols-2 gap-x-2 gap-y-3 max-md:data-[masonry=ready]:grid-rows-(--namecard-rows) max-md:data-[masonry=ready]:gap-y-0 sm:grid-cols-3 md:gap-4 lg:grid-cols-4"
            >
              {result.list.map((card) => (
                <NamecardItem
                  key={card.id}
                  card={card}
                  busy={busyReactionCards.has(card.id)}
                  canEditTags={canEditTags}
                  reactions={
                    reactionsByCard[card.id] ?? {
                      reactions: {},
                      loading: true,
                    }
                  }
                  onOpenDetail={openDetail}
                  onReact={reactToCard}
                  onTagClick={appendTagFilter}
                  onTagsChange={updateCardTags}
                />
              ))}
            </div>
            {random ? (
              <div
                ref={sentinelRef}
                className="flex min-h-16 items-center justify-center pt-3 text-sm text-muted-foreground"
              >
                {requestedPage ? (
                  <p role="status">正在加载更多名片…</p>
                ) : nextPage ? (
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    {appendError && <p role="status">暂时无法加载更多名片</p>}
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setAppendError(false)
                        setRequestedPage(nextPage)
                      }}
                    >
                      {appendError ? "重试加载更多" : "加载更多名片"}
                    </Button>
                  </div>
                ) : (
                  <p role="status">已浏览完本轮名片</p>
                )}
              </div>
            ) : (
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
            )}
          </>
        ) : null}
      </section>
    </PageShell>
  )
}
