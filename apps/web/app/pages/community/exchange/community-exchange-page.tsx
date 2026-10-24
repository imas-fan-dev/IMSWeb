import {
  ArrowLeftIcon,
  Building2Icon,
  CreditCardIcon,
  MapPinnedIcon,
  RefreshCwIcon,
  SearchIcon,
  SlidersHorizontalIcon,
  XIcon,
} from "lucide-react"
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type MouseEvent,
} from "react"
import { useLocation, useOutlet, useSearchParams } from "react-router"

import { NavigationLink } from "~/components/navigation/navigation-link"
import { PlatformAccountMenu } from "~/components/platform/platform-account-menu"
import { InfiniteScrollFooter } from "~/components/shared/infinite-scroll-footer"
import { SeriesAccentStrip } from "~/components/shared/series-accent-strip"
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert"
import { Button, buttonVariants } from "~/components/ui/button"
import { Checkbox } from "~/components/ui/checkbox"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "~/components/ui/empty"
import { Input } from "~/components/ui/input"
import { Label } from "~/components/ui/label"
import { Popover, PopoverContent, PopoverTitle } from "~/components/ui/popover"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "~/components/ui/sheet"
import { Skeleton } from "~/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs"
import { useInfiniteScroll } from "~/lib/use-infinite-scroll"
import {
  getFudabaCardPage,
  getFudabaOfficePage,
  getFudabaSeries,
  isApiError,
  type FudabaCard,
  type FudabaCardPage,
  type FudabaOffice,
  type FudabaOfficePage,
  type FudabaSeries,
} from "~/lib/api"
import { IS_APP_TARGET } from "~/lib/app-target"
import { NativeGlassControlsProvider } from "~/lib/native-glass-controls"
import { shouldUseNativeGlassControls } from "~/lib/native-glass-panel"
import { cn } from "~/lib/utils"
import { CommunityExchangeMapSection } from "./community-exchange-map-section"
import {
  ExchangeDiscoveryRail,
  type ExchangeDiscoveryRailProps,
} from "./components/exchange-discovery-rail"
import { ExchangeMapAttributionDialog } from "./components/exchange-map-attribution-dialog"
import { ExchangeSeriesFilter } from "./components/exchange-series-filter"
import { ExchangeCard, OfficeCard } from "./exchange-components"
import { ExchangeMapDialogContext } from "./components/exchange-page-surface"
import { useExchangeRouteSession } from "./hooks/use-exchange-route-session"
import type { ExchangeMapAttribution } from "./exchange-map-attribution"
import {
  exchangeMapFilterDefaults,
  rememberExchangeMapFilters,
} from "./exchange-map-model"
import "./exchange-office-map.css"

type DiscoveryPhase = "loading" | "ready" | "closed" | "error"
type DirectoryView = "offices" | "cards"

type DiscoveryState = {
  phase: DiscoveryPhase
  series: FudabaSeries[]
  offices: FudabaOffice[]
  officePageInfo: FudabaOfficePage["pageInfo"]
  cards: FudabaCard[]
  cardPageInfo: FudabaCardPage["pageInfo"]
  error: string | null
}

const emptyPageInfo = { hasNextPage: false, nextCursor: null }
const initialState: DiscoveryState = {
  phase: "loading",
  series: [],
  offices: [],
  officePageInfo: emptyPageInfo,
  cards: [],
  cardPageInfo: emptyPageInfo,
  error: null,
}

function deduplicateById<T extends { id: string }>(
  current: T[],
  incoming: T[]
) {
  const known = new Set(current.map((item) => item.id))
  return [...current, ...incoming.filter((item) => !known.has(item.id))]
}

function discoveryErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "社区交换数据暂时无法加载"
}

function useNarrowWorkspace() {
  const [isNarrow, setIsNarrow] = useState(false)

  useEffect(() => {
    if (!window.matchMedia) return
    const media = window.matchMedia("(max-width: 1023px)")
    const update = () => setIsNarrow(media.matches)
    update()
    media.addEventListener("change", update)
    return () => media.removeEventListener("change", update)
  }, [])

  return isNarrow
}

interface FilterControlsProps {
  compact?: boolean
  idPrefix: string
  cityDraft: string
  city: string
  seriesCodes: readonly string[]
  openOnly: boolean
  series: FudabaSeries[]
  hasFilters: boolean
  className?: string
  onCityDraftChange: (value: string) => void
  onCitySubmit: (event: FormEvent<HTMLFormElement>) => void
  onFilterChange: (name: string, value: string | null) => void
  onSeriesToggle: (seriesCode: string) => void
  onReset: () => void
}

function FilterControls({
  compact = false,
  idPrefix,
  cityDraft,
  city,
  seriesCodes,
  openOnly,
  series,
  hasFilters,
  className,
  onCityDraftChange,
  onCitySubmit,
  onFilterChange,
  onSeriesToggle,
  onReset,
}: FilterControlsProps) {
  const cityInputId = `${idPrefix}-exchange-city`

  return (
    <form
      className={cn(
        "grid min-w-0 gap-3 lg:grid-cols-[minmax(10rem,1fr)_minmax(10rem,0.8fr)_auto] lg:items-end",
        compact && "lg:grid-cols-1 lg:items-stretch",
        className
      )}
      onSubmit={onCitySubmit}
    >
      <div className="min-w-0 space-y-1.5">
        <Label htmlFor={cityInputId} className="text-xs">
          城市
        </Label>
        <div className="flex min-w-0 gap-1.5">
          <Input
            id={cityInputId}
            value={cityDraft}
            maxLength={100}
            placeholder="例如：上海"
            className="bg-background"
            onChange={(event) => onCityDraftChange(event.currentTarget.value)}
          />
          <Button type="submit" variant="outline" aria-label="按城市查找">
            <SearchIcon aria-hidden="true" />
            <span className="hidden sm:inline">查找</span>
          </Button>
        </div>
      </div>

      <div className="min-w-0 space-y-1.5">
        <div className="flex min-h-5 items-center justify-between gap-3">
          <Label className="text-xs">企划标签</Label>
          <span className="text-xs text-muted-foreground">
            {seriesCodes.length ? `已选 ${seriesCodes.length}` : "全部"}
          </span>
        </div>
        <ExchangeSeriesFilter
          series={series}
          selectedCodes={seriesCodes}
          onToggle={onSeriesToggle}
          className={compact ? "sm:grid-cols-2" : "sm:grid-cols-3"}
        />
      </div>

      <div className="flex min-h-8 flex-wrap items-center gap-2">
        <Label className="flex min-h-8 cursor-pointer items-center gap-2 text-xs">
          <Checkbox
            checked={openOnly}
            onCheckedChange={(checked) =>
              onFilterChange("open", checked ? "true" : null)
            }
          />
          仅看开放事务所
        </Label>
        {hasFilters ? (
          <Button type="button" variant="ghost" size="sm" onClick={onReset}>
            <XIcon aria-hidden="true" />
            清除筛选
          </Button>
        ) : null}
      </div>
      <output className="sr-only" aria-live="polite">
        {city ? `当前城市筛选：${city}` : "未筛选城市"}
      </output>
    </form>
  )
}

interface DirectoryResultsProps {
  mapDialog?: boolean
  view: DirectoryView
  state: DiscoveryState
  seriesMap: ReadonlyMap<string, FudabaSeries>
  hasFilters: boolean
  loadingMoreOffices: boolean
  loadingMoreCards: boolean
  onViewChange: (view: DirectoryView) => void
  onResetFilters: () => void
  onLoadMoreOffices: () => void
  onLoadMoreCards: () => void
}

function DirectoryResults({
  mapDialog = false,
  view,
  state,
  seriesMap,
  hasFilters,
  loadingMoreOffices,
  loadingMoreCards,
  onViewChange,
  onResetFilters,
  onLoadMoreOffices,
  onLoadMoreCards,
}: DirectoryResultsProps) {
  const listClassName = mapDialog ? "grid gap-3 md:grid-cols-2" : "space-y-3"
  const footerClassName = cn("py-2", mapDialog && "md:col-span-2")
  // Each rail is its own scroller inside a full-height pane, so the sentinels
  // are watched against the viewport and use a rail-sized margin rather than
  // the page-sized one a document feed wants. Pull-to-refresh has no place
  // here: this route never scrolls the window, so the gesture could not tell a
  // pull from an ordinary drag. The toolbar keeps its refresh button.
  const officesSentinelRef = useInfiniteScroll({
    hasNextPage: state.officePageInfo.hasNextPage,
    loading: loadingMoreOffices,
    onLoadMore: onLoadMoreOffices,
    rootMargin: 200,
  })
  const cardsSentinelRef = useInfiniteScroll({
    hasNextPage: state.cardPageInfo.hasNextPage,
    loading: loadingMoreCards,
    onLoadMore: onLoadMoreCards,
    rootMargin: 200,
  })

  return (
    <Tabs
      value={view}
      onValueChange={(value) => onViewChange(value as DirectoryView)}
      className="min-h-0 flex-1 gap-0"
    >
      <div className="border-b px-4 pb-3">
        <TabsList className="w-full" aria-label="公开名录类型">
          <TabsTrigger value="offices">
            <Building2Icon aria-hidden="true" />
            事务所
          </TabsTrigger>
          <TabsTrigger value="cards">
            <CreditCardIcon aria-hidden="true" />
            名片
          </TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="offices" className="min-h-0 overflow-y-auto p-4">
        <div className="mb-4">
          <h3 className="text-sm font-semibold">公开事务所</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {hasFilters ? "当前筛选结果" : "按访问热度排列"}
            {" · 已加载 "}
            {state.offices.length}
            {" 个事务所"}
          </p>
        </div>
        {state.error ? (
          <Alert className="mb-4">
            <RefreshCwIcon aria-hidden="true" />
            <AlertTitle>部分内容未能继续加载</AlertTitle>
            <AlertDescription>{state.error}</AlertDescription>
          </Alert>
        ) : null}
        {state.offices.length ? (
          <div className={listClassName}>
            {state.offices.map((office) => (
              <OfficeCard key={office.id} office={office} series={seriesMap} />
            ))}
            <InfiniteScrollFooter
              sentinelRef={officesSentinelRef}
              label="事务所"
              hasNextPage={state.officePageInfo.hasNextPage}
              loading={loadingMoreOffices}
              className={footerClassName}
            />
          </div>
        ) : (
          <Empty className="min-h-56 border-y">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Building2Icon aria-hidden="true" />
              </EmptyMedia>
              <EmptyTitle>没有符合条件的事务所</EmptyTitle>
              <EmptyDescription>
                调整城市、企划或开放状态后重试。
              </EmptyDescription>
            </EmptyHeader>
            {hasFilters ? (
              <Button type="button" variant="outline" onClick={onResetFilters}>
                清除筛选
              </Button>
            ) : null}
          </Empty>
        )}
      </TabsContent>

      <TabsContent value="cards" className="min-h-0 overflow-y-auto p-4">
        <div className="mb-4">
          <h3 className="text-sm font-semibold">可交换名片</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            已加载 {state.cards.length} 张公开名片
          </p>
        </div>
        {state.error ? (
          <Alert className="mb-4">
            <RefreshCwIcon aria-hidden="true" />
            <AlertTitle>部分内容未能继续加载</AlertTitle>
            <AlertDescription>{state.error}</AlertDescription>
          </Alert>
        ) : null}
        {state.cards.length ? (
          <div className={listClassName}>
            {state.cards.map((card) => (
              <ExchangeCard key={card.id} card={card} series={seriesMap} />
            ))}
            <InfiniteScrollFooter
              sentinelRef={cardsSentinelRef}
              label="名片"
              hasNextPage={state.cardPageInfo.hasNextPage}
              loading={loadingMoreCards}
              className={footerClassName}
            />
          </div>
        ) : (
          <Empty className="min-h-56 border-y">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <CreditCardIcon aria-hidden="true" />
              </EmptyMedia>
              <EmptyTitle>当前没有可交换名片</EmptyTitle>
              <EmptyDescription>
                已审核且开放交换的名片会显示在这里。
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </TabsContent>
    </Tabs>
  )
}

export function meta() {
  return [
    { title: "名片交换事务所 | IMSWeb" },
    {
      name: "description",
      content: "按城市和企划浏览制作人名片交换事务所。",
    },
  ]
}

export default function CommunityExchangePage() {
  const location = useLocation()
  const outlet = useOutlet()
  const routeDialogOpen = !IS_APP_TARGET && outlet !== null
  const routeSession = useExchangeRouteSession(!IS_APP_TARGET)
  const dialogContext = useMemo(
    () => (routeDialogOpen ? { close: routeSession.close } : null),
    [routeDialogOpen, routeSession.close]
  )
  const [restoredFilterDefaults] = useState(() =>
    IS_APP_TARGET
      ? exchangeMapFilterDefaults(new URLSearchParams(location.search))
      : undefined
  )
  const [urlSearchParams, setUrlSearchParams] = useSearchParams(
    restoredFilterDefaults
  )
  const searchParams = IS_APP_TARGET
    ? urlSearchParams
    : routeSession.searchParams
  const setSearchParams = IS_APP_TARGET
    ? setUrlSearchParams
    : routeSession.setSearchParams
  const city = searchParams.get("city")?.trim() ?? ""
  const seriesCodes = useMemo(
    () =>
      Array.from(
        new Set(
          searchParams
            .getAll("series")
            .map((value) => value.trim())
            .filter(Boolean)
        )
      ).slice(0, 8),
    [searchParams]
  )
  const openOnly = searchParams.get("open") === "true"
  const [cityDraft, setCityDraft] = useState(city)
  const [state, setState] = useState<DiscoveryState>(initialState)
  const [refreshing, setRefreshing] = useState(true)
  const [loadingMoreOffices, setLoadingMoreOffices] = useState(false)
  const [loadingMoreCards, setLoadingMoreCards] = useState(false)
  const [filterOpen, setFilterOpen] = useState(false)
  const filterTitleRef = useRef<HTMLHeadingElement | null>(null)
  const filterAnchorRef = useRef<HTMLElement | null>(null)
  const filterReturnFocus = useRef(true)
  const filterTitleId = useId()
  const [directoryOpen, setDirectoryOpen] = useState(false)
  const [directoryView, setDirectoryView] = useState<DirectoryView>("offices")
  const dialogTitleRef = useRef<HTMLHeadingElement | null>(null)
  const routeOpener = useRef<HTMLElement | null>(null)
  const directoryOpener = useRef<HTMLElement | null>(null)
  const webDialogOpen = !IS_APP_TARGET && (routeDialogOpen || directoryOpen)
  const routeTitle =
    location.pathname.replace(/\/+$/, "") === "/community/exchange/me"
      ? "个人档案"
      : "事务所详情"
  function captureRouteOpener(event: MouseEvent<HTMLElement>) {
    if (
      IS_APP_TARGET ||
      routeDialogOpen ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return
    const link =
      event.target instanceof Element
        ? event.target.closest<HTMLAnchorElement>("a[href]")
        : null
    if (!link || link.target === "_blank") return
    if (
      link.origin === window.location.origin &&
      link.pathname.startsWith("/community/exchange/")
    )
      routeOpener.current = link
  }
  useEffect(() => {
    if (!webDialogOpen) return
    const frame = window.requestAnimationFrame(() => {
      const opener = routeOpener.current
      if (
        !routeDialogOpen &&
        opener?.isConnected &&
        opener.getClientRects().length
      )
        opener.focus({ preventScroll: true })
      else dialogTitleRef.current?.focus({ preventScroll: true })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [webDialogOpen, routeDialogOpen, location.pathname])
  const requestGeneration = useRef(0)
  const officeRequestInFlight = useRef<symbol | null>(null)
  const cardRequestInFlight = useRef<symbol | null>(null)
  const isNarrow = useNarrowWorkspace()
  const [attribution, setAttribution] = useState<ExchangeMapAttribution | null>(
    null
  )
  const [attributionOpen, setAttributionOpen] = useState(false)
  const [searchAttributions, setSearchAttributions] = useState<string[]>([])
  const hasAttribution = Boolean(
    attribution || (IS_APP_TARGET && searchAttributions.length)
  )
  const attributionTriggerRef = useRef<HTMLElement | null>(null)

  const openAttribution = useCallback((trigger?: HTMLElement | null) => {
    attributionTriggerRef.current = trigger ?? null
    setAttributionOpen(true)
  }, [])

  const handleAttributionOpenChange = useCallback((open: boolean) => {
    setAttributionOpen(open)
    if (open) return

    window.requestAnimationFrame(() => {
      const entries = [
        attributionTriggerRef.current,
        ...document.querySelectorAll<HTMLElement>(
          '.exchange-search-card button[aria-label="更多地图工具"], aside[aria-label="交换发现栏"] button[aria-label="更多地图工具"]'
        ),
      ]
      const target = entries.find(
        (entry) =>
          entry?.isConnected &&
          !entry.closest("[inert]") &&
          entry.getClientRects().length
      )
      target?.focus({ preventScroll: true })
    })
  }, [])

  useEffect(() => {
    if (!hasAttribution) setAttributionOpen(false)
  }, [hasAttribution])

  const loadFirstPage = useCallback(async () => {
    const generation = ++requestGeneration.current
    officeRequestInFlight.current = null
    cardRequestInFlight.current = null
    setState((current) =>
      current.phase === "ready"
        ? { ...current, error: null }
        : { ...current, phase: "loading", error: null }
    )
    setRefreshing(true)
    setLoadingMoreOffices(false)
    setLoadingMoreCards(false)

    try {
      const [seriesResult, officeResult, cardResult] = await Promise.all([
        getFudabaSeries().send(),
        getFudabaOfficePage({
          city: city || undefined,
          series: seriesCodes.length ? seriesCodes : undefined,
          open: openOnly ? true : undefined,
          limit: 12,
        }).send(),
        getFudabaCardPage({
          series: seriesCodes.length ? seriesCodes : undefined,
          available: true,
          limit: 8,
        }).send(),
      ])
      if (requestGeneration.current !== generation) return
      setState({
        phase: "ready",
        series: seriesResult.items,
        offices: officeResult.items,
        officePageInfo: officeResult.pageInfo,
        cards: cardResult.items,
        cardPageInfo: cardResult.pageInfo,
        error: null,
      })
    } catch (error) {
      if (requestGeneration.current !== generation) return
      const closed =
        isApiError(error) &&
        error.status === 404 &&
        error.payload === "Not Found"
      setState((current) =>
        current.phase === "ready" && !closed
          ? { ...current, error: discoveryErrorMessage(error) }
          : {
              ...current,
              phase: closed ? "closed" : "error",
              error: discoveryErrorMessage(error),
            }
      )
    } finally {
      if (requestGeneration.current === generation) setRefreshing(false)
    }
  }, [city, openOnly, seriesCodes])

  useEffect(() => {
    setCityDraft(city)
  }, [city])

  useEffect(() => {
    if (!IS_APP_TARGET) return
    rememberExchangeMapFilters({ city, seriesCodes, openOnly })
  }, [city, openOnly, seriesCodes])

  useEffect(() => {
    if (!searchParams.has("bbox") && !searchParams.has("view")) return
    const next = new URLSearchParams(searchParams)
    next.delete("bbox")
    next.delete("view")
    setSearchParams(next, { replace: true })
  }, [searchParams, setSearchParams])

  useEffect(() => {
    void loadFirstPage()
    return () => {
      requestGeneration.current += 1
    }
  }, [loadFirstPage])

  const seriesMap = useMemo(
    () => new Map(state.series.map((item) => [item.code, item])),
    [state.series]
  )

  function updateFilter(name: string, value: string | null) {
    const next = new URLSearchParams(searchParams)
    if (value) next.set(name, value)
    else next.delete(name)
    setSearchParams(next, { replace: true })
  }

  function toggleSeriesFilter(seriesCode: string) {
    const next = new URLSearchParams(searchParams)
    const selected = new Set(seriesCodes)
    if (selected.has(seriesCode)) selected.delete(seriesCode)
    else if (selected.size < 8) selected.add(seriesCode)
    next.delete("series")
    for (const code of selected) next.append("series", code)
    setSearchParams(next, { replace: true })
  }

  function clearSeriesFilter() {
    const next = new URLSearchParams(searchParams)
    next.delete("series")
    setSearchParams(next, { replace: true })
  }

  function applyCityFilter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    updateFilter("city", cityDraft.trim() || null)
    setFilterOpen(false)
  }

  function resetFilters() {
    setCityDraft("")
    setSearchParams(new URLSearchParams(), { replace: true })
  }

  function openDirectory(view: DirectoryView) {
    if (!IS_APP_TARGET && document.activeElement instanceof HTMLElement)
      directoryOpener.current = document.activeElement
    setDirectoryView(view)
    setDirectoryOpen(true)
  }

  const loadMoreOffices = useCallback(async () => {
    if (
      officeRequestInFlight.current ||
      !state.officePageInfo.hasNextPage ||
      !state.officePageInfo.nextCursor
    ) {
      return
    }
    const generation = requestGeneration.current
    const requestToken = Symbol("fudaba-office-page")
    officeRequestInFlight.current = requestToken
    setLoadingMoreOffices(true)
    setState((current) => ({ ...current, error: null }))
    try {
      const result = await getFudabaOfficePage({
        city: city || undefined,
        series: seriesCodes.length ? seriesCodes : undefined,
        open: openOnly ? true : undefined,
        cursor: state.officePageInfo.nextCursor,
        limit: 12,
      }).send()
      if (requestGeneration.current !== generation) return
      setState((current) => ({
        ...current,
        offices: deduplicateById(current.offices, result.items),
        officePageInfo: result.pageInfo,
      }))
    } catch (error) {
      if (requestGeneration.current !== generation) return
      setState((current) => ({
        ...current,
        error: `更多事务所加载失败：${discoveryErrorMessage(error)}`,
      }))
    } finally {
      if (officeRequestInFlight.current === requestToken) {
        officeRequestInFlight.current = null
        setLoadingMoreOffices(false)
      }
    }
  }, [city, openOnly, seriesCodes, state.officePageInfo])

  const loadMoreCards = useCallback(async () => {
    if (
      cardRequestInFlight.current ||
      !state.cardPageInfo.hasNextPage ||
      !state.cardPageInfo.nextCursor
    ) {
      return
    }
    const generation = requestGeneration.current
    const requestToken = Symbol("fudaba-card-page")
    cardRequestInFlight.current = requestToken
    setLoadingMoreCards(true)
    setState((current) => ({ ...current, error: null }))
    try {
      const result = await getFudabaCardPage({
        series: seriesCodes.length ? seriesCodes : undefined,
        available: true,
        cursor: state.cardPageInfo.nextCursor,
        limit: 8,
      }).send()
      if (requestGeneration.current !== generation) return
      setState((current) => ({
        ...current,
        cards: deduplicateById(current.cards, result.items),
        cardPageInfo: result.pageInfo,
      }))
    } catch (error) {
      if (requestGeneration.current !== generation) return
      setState((current) => ({
        ...current,
        error: `更多名片加载失败：${discoveryErrorMessage(error)}`,
      }))
    } finally {
      if (cardRequestInFlight.current === requestToken) {
        cardRequestInFlight.current = null
        setLoadingMoreCards(false)
      }
    }
  }, [seriesCodes, state.cardPageInfo])

  const hasFilters = Boolean(city || seriesCodes.length || openOnly)
  const filterProps = {
    cityDraft,
    city,
    seriesCodes,
    openOnly,
    series: state.series,
    hasFilters,
    onCityDraftChange: setCityDraft,
    onCitySubmit: applyCityFilter,
    onFilterChange: updateFilter,
    onSeriesToggle: toggleSeriesFilter,
    onReset: resetFilters,
  }

  const discovery: ExchangeDiscoveryRailProps = {
    cityDraft,
    seriesCodes,
    openOnly,
    series: state.series,
    offices: state.offices,
    cardCount: state.cards.length,
    refreshing,
    error: state.error,
    hasFilters,
    onCityDraftChange: setCityDraft,
    onCitySubmit: applyCityFilter,
    onSeriesToggle: toggleSeriesFilter,
    onSeriesClear: clearSeriesFilter,
    onOpenChange: (value) => updateFilter("open", value ? "true" : null),
    onResetFilters: resetFilters,
    onRefresh: () => void loadFirstPage(),
    onOpenFilter: () => {
      setDirectoryOpen(false)
      setFilterOpen(true)
    },
    onOpenOffices: () => openDirectory("offices"),
    onOpenCards: () => openDirectory("cards"),
    modalOpen:
      filterOpen || directoryOpen || attributionOpen || routeDialogOpen,
    onOpenAttribution: attribution ? openAttribution : undefined,
  }

  return (
    <ExchangeMapDialogContext value={dialogContext}>
      <main
        id="main-content"
        onClickCapture={captureRouteOpener}
        className={cn(
          "relative size-full min-h-0 overflow-hidden bg-[#e8f2f4]",
          IS_APP_TARGET && "exchange-map-app-viewport"
        )}
      >
        {!IS_APP_TARGET ? <h1 className="sr-only">名片交换地图</h1> : null}
        {state.phase === "ready" ? (
          <NativeGlassControlsProvider>
            <div className="flex size-full min-h-0">
              {IS_APP_TARGET ? <ExchangeDiscoveryRail {...discovery} /> : null}

              <div className="relative min-w-0 flex-1">
                <CommunityExchangeMapSection
                  webDiscovery={IS_APP_TARGET ? undefined : discovery}
                  city={city || undefined}
                  series={seriesCodes.length ? seriesCodes : undefined}
                  seriesCatalog={state.series}
                  open={openOnly ? true : undefined}
                  onAttributionChange={setAttribution}
                  onSearchAttributionChange={setSearchAttributions}
                  onSwitchDirectory={() => openDirectory("offices")}
                  searchTools={{
                    filterAnchorRef: IS_APP_TARGET
                      ? undefined
                      : filterAnchorRef,
                    refreshing,
                    filterApplied: hasFilters,
                    modalOpen:
                      filterOpen ||
                      directoryOpen ||
                      attributionOpen ||
                      routeDialogOpen,
                    onOpenFilter: () => {
                      setDirectoryOpen(false)
                      filterReturnFocus.current = true
                      setFilterOpen(true)
                    },
                    onOpenOffices: () => {
                      setFilterOpen(false)
                      openDirectory("offices")
                    },
                    onOpenCards: () => {
                      setFilterOpen(false)
                      openDirectory("cards")
                    },
                    onRefresh: () => void loadFirstPage(),
                    onOpenAttribution: hasAttribution
                      ? openAttribution
                      : undefined,
                  }}
                />
              </div>
            </div>

            {IS_APP_TARGET ? (
              <Sheet open={filterOpen} onOpenChange={setFilterOpen}>
                <SheetContent
                  side="bottom"
                  initialFocus={IS_APP_TARGET ? filterTitleRef : undefined}
                  className="exchange-map-filter-sheet overflow-y-auto pb-4"
                >
                  <SheetHeader className="border-b pr-14">
                    <SheetTitle ref={filterTitleRef} tabIndex={-1}>
                      筛选地图
                    </SheetTitle>
                    <SheetDescription>
                      按城市、企划与开放状态收窄地图和名录。
                    </SheetDescription>
                  </SheetHeader>
                  <FilterControls
                    {...filterProps}
                    idPrefix="mobile"
                    className="px-4"
                  />
                </SheetContent>
              </Sheet>
            ) : (
              <Popover
                open={filterOpen}
                modal={false}
                onOpenChange={(open, details) => {
                  filterReturnFocus.current =
                    details.reason !== "outside-press" &&
                    details.reason !== "focus-out"
                  setFilterOpen(open)
                }}
              >
                <PopoverContent
                  anchor={filterAnchorRef}
                  side="bottom"
                  align="end"
                  sideOffset={8}
                  initialFocus={filterTitleRef}
                  finalFocus={() =>
                    filterReturnFocus.current ? filterAnchorRef.current : false
                  }
                  aria-labelledby={filterTitleId}
                  className="exchange-web-filter-popover max-h-[min(var(--available-height),calc(100dvh-6rem))] w-90 max-w-[calc(100vw-1.5rem)] overflow-y-auto p-0 motion-reduce:animate-none"
                >
                  <header className="flex items-start justify-between gap-3 border-b p-4">
                    <div className="space-y-1">
                      <PopoverTitle
                        id={filterTitleId}
                        ref={filterTitleRef}
                        tabIndex={-1}
                      >
                        筛选地图
                      </PopoverTitle>
                      <p className="text-xs/5 text-muted-foreground">
                        按城市、企划与开放状态收窄地图和名录。
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-lg"
                      className="shrink-0"
                      aria-label="关闭筛选浮窗"
                      onClick={() => setFilterOpen(false)}
                    >
                      <XIcon aria-hidden="true" />
                    </Button>
                  </header>
                  <FilterControls
                    {...filterProps}
                    compact
                    idPrefix="web-floating"
                    className="p-4"
                  />
                </PopoverContent>
              </Popover>
            )}

            {IS_APP_TARGET ? (
              <Sheet open={directoryOpen} onOpenChange={setDirectoryOpen}>
                <SheetContent
                  side={isNarrow ? "bottom" : "right"}
                  className={cn(
                    "min-h-0 gap-0 overflow-hidden",
                    isNarrow
                      ? "exchange-map-directory-sheet"
                      : "w-[min(92vw,30rem)] sm:max-w-120"
                  )}
                >
                  <SheetHeader className="shrink-0 pr-14">
                    <SheetTitle>公开交换名录</SheetTitle>
                    <SheetDescription>
                      地图范围之外的公开事务所和名片也会保留在这里。
                    </SheetDescription>
                  </SheetHeader>
                  <DirectoryResults
                    view={directoryView}
                    state={state}
                    seriesMap={seriesMap}
                    hasFilters={hasFilters}
                    loadingMoreOffices={loadingMoreOffices}
                    loadingMoreCards={loadingMoreCards}
                    onViewChange={setDirectoryView}
                    onResetFilters={resetFilters}
                    onLoadMoreOffices={() => void loadMoreOffices()}
                    onLoadMoreCards={() => void loadMoreCards()}
                  />
                </SheetContent>
              </Sheet>
            ) : null}

            <ExchangeMapAttributionDialog
              attribution={attribution}
              iosMapPresentation={shouldUseNativeGlassControls()}
              searchAttributions={
                IS_APP_TARGET ? searchAttributions : undefined
              }
              open={attributionOpen}
              onOpenChange={handleAttributionOpenChange}
            />
          </NativeGlassControlsProvider>
        ) : (
          <section className="relative flex size-full min-h-0 items-center justify-center overflow-hidden px-4">
            <SeriesAccentStrip className="absolute inset-x-0 top-0 h-1" />
            {state.phase === "loading" ? (
              <div
                aria-label="正在加载交换区"
                className="w-full max-w-sm rounded-lg border bg-background/95 p-5 shadow-sm"
              >
                <div className="flex items-center gap-3">
                  <Skeleton className="size-10 shrink-0 rounded-lg" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-36" />
                    <Skeleton className="h-3 w-full" />
                  </div>
                </div>
                <p className="sr-only">正在加载名片交换事务所地图</p>
              </div>
            ) : state.phase === "closed" ? (
              <Empty className="w-full max-w-lg rounded-lg border bg-background/95 px-5 shadow-sm">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <MapPinnedIcon aria-hidden="true" />
                  </EmptyMedia>
                  <EmptyTitle>社区交换区尚未开放</EmptyTitle>
                  <EmptyDescription>
                    事务所与名片完成公开审核后会在这里显示。
                  </EmptyDescription>
                </EmptyHeader>
                <NavigationLink
                  to="/community"
                  className={buttonVariants({ variant: "outline" })}
                >
                  返回制作人社区
                </NavigationLink>
              </Empty>
            ) : (
              <Alert
                variant="destructive"
                className="w-full max-w-lg bg-background/95 shadow-sm"
              >
                <SlidersHorizontalIcon aria-hidden="true" />
                <AlertTitle>社区交换区暂时无法加载</AlertTitle>
                <AlertDescription>
                  {state.error || "请稍后重新加载。"}
                </AlertDescription>
                <div className="col-start-2 mt-3">
                  <Button type="button" onClick={() => void loadFirstPage()}>
                    <RefreshCwIcon aria-hidden="true" />
                    重新加载
                  </Button>
                </div>
              </Alert>
            )}
          </section>
        )}
      </main>
      {!IS_APP_TARGET ? (
        <Dialog
          open={webDialogOpen}
          onOpenChange={(open) => {
            if (open) return
            if (routeDialogOpen) routeSession.close()
            else setDirectoryOpen(false)
          }}
        >
          <DialogContent
            layout="pinned"
            showCloseButton={false}
            initialFocus={dialogTitleRef}
            finalFocus={() => {
              const candidates = [
                routeOpener.current,
                directoryOpener.current,
                document.querySelector<HTMLElement>(
                  '.exchange-web-search-dock button[aria-label="更多地图工具"]'
                ),
              ]
              return (
                candidates.find(
                  (node) =>
                    node?.isConnected &&
                    !node.closest("[inert]") &&
                    node.getClientRects().length
                ) ?? false
              )
            }}
            className="exchange-map-page-dialog h-[min(48rem,var(--overlay-safe-height))] gap-0 rounded-lg p-0 motion-reduce:animate-none sm:max-w-5xl"
          >
            <DialogHeader className="flex-row items-center justify-between gap-3 border-b px-4 py-3 text-left sm:px-6">
              <div className="flex min-w-0 items-center gap-2">
                {routeDialogOpen ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-lg"
                    aria-label={directoryOpen ? "返回交换名录" : "返回地图"}
                    onClick={routeSession.close}
                  >
                    <ArrowLeftIcon aria-hidden="true" />
                  </Button>
                ) : null}
                <div className="min-w-0">
                  <DialogTitle
                    ref={dialogTitleRef}
                    tabIndex={-1}
                    className="text-base"
                  >
                    {routeDialogOpen ? routeTitle : "公开交换名录"}
                  </DialogTitle>
                  <DialogDescription
                    className={routeDialogOpen ? "sr-only" : "mt-1 text-xs"}
                  >
                    {routeDialogOpen
                      ? "查看与管理交换资料，关闭后返回地图。"
                      : "浏览符合当前筛选的公开事务所和名片。"}
                  </DialogDescription>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {routeDialogOpen && routeTitle === "个人档案" ? (
                  <PlatformAccountMenu />
                ) : null}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-lg"
                  aria-label="关闭"
                  onClick={() => {
                    setDirectoryOpen(false)
                    if (routeDialogOpen) routeSession.close()
                  }}
                >
                  <XIcon aria-hidden="true" />
                </Button>
              </div>
            </DialogHeader>
            <div
              className={
                routeDialogOpen ? "hidden" : "flex min-h-0 flex-1 flex-col"
              }
              aria-hidden={routeDialogOpen}
              inert={routeDialogOpen}
              onClickCapture={captureRouteOpener}
            >
              <DirectoryResults
                mapDialog
                view={directoryView}
                state={state}
                seriesMap={seriesMap}
                hasFilters={hasFilters}
                loadingMoreOffices={loadingMoreOffices}
                loadingMoreCards={loadingMoreCards}
                onViewChange={setDirectoryView}
                onResetFilters={resetFilters}
                onLoadMoreOffices={() => void loadMoreOffices()}
                onLoadMoreCards={() => void loadMoreCards()}
              />
            </div>
            {routeDialogOpen ? (
              <DialogBody className="exchange-map-page-dialog-body">
                {outlet}
              </DialogBody>
            ) : null}
          </DialogContent>
        </Dialog>
      ) : null}
    </ExchangeMapDialogContext>
  )
}
