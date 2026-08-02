import {
  Building2Icon,
  LoaderCircleIcon,
  MapPinnedIcon,
  RefreshCwIcon,
  SearchIcon,
  SlidersHorizontalIcon,
  XIcon,
} from "lucide-react"
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react"
import { Link, useSearchParams } from "react-router"

import { SeriesAccentStrip } from "~/components/shared/series-accent-strip"
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert"
import { Button, buttonVariants } from "~/components/ui/button"
import { Checkbox } from "~/components/ui/checkbox"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "~/components/ui/empty"
import { Input } from "~/components/ui/input"
import { Label } from "~/components/ui/label"
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
import { ExchangeCard, OfficeCard } from "./exchange-components"

type DiscoveryPhase = "loading" | "ready" | "closed" | "error"

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
  const [searchParams, setSearchParams] = useSearchParams()
  const city = searchParams.get("city")?.trim() ?? ""
  const seriesCode = searchParams.get("series")?.trim() ?? ""
  const openOnly = searchParams.get("open") === "true"
  const [cityDraft, setCityDraft] = useState(city)
  const [state, setState] = useState<DiscoveryState>(initialState)
  const [loadingMoreOffices, setLoadingMoreOffices] = useState(false)
  const [loadingMoreCards, setLoadingMoreCards] = useState(false)
  const requestGeneration = useRef(0)
  const officeRequestInFlight = useRef<symbol | null>(null)
  const cardRequestInFlight = useRef<symbol | null>(null)

  const loadFirstPage = useCallback(async () => {
    const generation = ++requestGeneration.current
    officeRequestInFlight.current = null
    cardRequestInFlight.current = null
    setState((current) => ({ ...current, phase: "loading", error: null }))
    setLoadingMoreOffices(false)
    setLoadingMoreCards(false)

    try {
      const [seriesResult, officeResult, cardResult] = await Promise.all([
        getFudabaSeries().send(),
        getFudabaOfficePage({
          city: city || undefined,
          series: seriesCode || undefined,
          open: openOnly ? true : undefined,
          limit: 12,
        }).send(),
        getFudabaCardPage({
          series: seriesCode || undefined,
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
      setState((current) => ({
        ...current,
        phase:
          isApiError(error) &&
          error.status === 404 &&
          error.payload === "Not Found"
            ? "closed"
            : "error",
        error: discoveryErrorMessage(error),
      }))
    }
  }, [city, openOnly, seriesCode])

  useEffect(() => {
    setCityDraft(city)
  }, [city])

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

  function applyCityFilter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    updateFilter("city", cityDraft.trim() || null)
  }

  function resetFilters() {
    setCityDraft("")
    setSearchParams({}, { replace: true })
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
        series: seriesCode || undefined,
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
  }, [city, openOnly, seriesCode, state.officePageInfo])

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
        series: seriesCode || undefined,
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
  }, [seriesCode, state.cardPageInfo])

  const hasFilters = Boolean(city || seriesCode || openOnly)

  return (
    <main id="main-content">
      <section className="relative border-b bg-muted/25">
        <SeriesAccentStrip className="absolute inset-x-0 top-0 h-1" />
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-10 sm:px-6 sm:py-12 lg:flex-row lg:items-end lg:justify-between lg:px-8">
          <div className="max-w-2xl">
            <Link
              to="/community"
              className="text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              制作人社区
            </Link>
            <h1 className="mt-3 text-3xl font-semibold">名片交换事务所</h1>
            <p className="mt-3 leading-7 text-muted-foreground">
              按城市与企划浏览公开事务所和可交换名片。
            </p>
          </div>
          {state.phase === "ready" ? (
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span>{state.offices.length} 个事务所</span>
              <span>{state.cards.length} 张可交换名片</span>
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="刷新交换区"
                title="刷新"
                onClick={() => void loadFirstPage()}
              >
                <RefreshCwIcon aria-hidden="true" />
              </Button>
            </div>
          ) : null}
        </div>
      </section>

      <section className="border-b bg-background" aria-label="事务所筛选">
        <form
          className="mx-auto grid w-full max-w-7xl gap-4 px-4 py-5 sm:grid-cols-[minmax(12rem,1fr)_minmax(11rem,0.7fr)_auto] sm:items-end sm:px-6 lg:px-8"
          onSubmit={applyCityFilter}
        >
          <div className="space-y-2">
            <Label htmlFor="exchange-city">城市</Label>
            <div className="flex gap-2">
              <Input
                id="exchange-city"
                value={cityDraft}
                maxLength={100}
                placeholder="例如：上海"
                onChange={(event) => setCityDraft(event.currentTarget.value)}
              />
              <Button type="submit" variant="outline" aria-label="按城市查找">
                <SearchIcon aria-hidden="true" />
                查找
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="exchange-series">企划</Label>
            <Select
              value={seriesCode || "all"}
              onValueChange={(value) =>
                updateFilter(
                  "series",
                  String(value) === "all" ? null : String(value)
                )
              }
            >
              <SelectTrigger id="exchange-series" className="h-10 w-full">
                <SelectValue>
                  {seriesCode
                    ? (seriesMap.get(seriesCode)?.displayName ?? seriesCode)
                    : "全部企划"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent align="start">
                <SelectGroup>
                  <SelectItem value="all">全部企划</SelectItem>
                  {state.series.map((item) => (
                    <SelectItem key={item.code} value={item.code}>
                      {item.displayName}（{item.activeOfficeCount}）
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          <div className="flex min-h-10 flex-wrap items-center gap-4">
            <Label className="flex cursor-pointer items-center gap-2">
              <Checkbox
                checked={openOnly}
                onCheckedChange={(checked) =>
                  updateFilter("open", checked ? "true" : null)
                }
              />
              仅看开放事务所
            </Label>
            {hasFilters ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={resetFilters}
              >
                <XIcon aria-hidden="true" />
                清除筛选
              </Button>
            ) : null}
          </div>
        </form>
      </section>

      <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {state.phase === "loading" ? (
          <div aria-label="正在加载交换区" className="space-y-10">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }, (_, index) => (
                <Skeleton key={index} className="h-72" />
              ))}
            </div>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {Array.from({ length: 4 }, (_, index) => (
                <Skeleton key={index} className="h-72" />
              ))}
            </div>
          </div>
        ) : state.phase === "closed" ? (
          <Empty className="min-h-80 border-y">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <MapPinnedIcon aria-hidden="true" />
              </EmptyMedia>
              <EmptyTitle>社区交换区尚未开放</EmptyTitle>
              <EmptyDescription>
                事务所与名片完成公开审核后会在这里显示。
              </EmptyDescription>
            </EmptyHeader>
            <Link
              to="/community"
              className={buttonVariants({ variant: "outline" })}
            >
              返回制作人社区
            </Link>
          </Empty>
        ) : state.phase === "error" ? (
          <Alert variant="destructive" className="my-8">
            <SlidersHorizontalIcon aria-hidden="true" />
            <AlertTitle>社区交换区暂时无法加载</AlertTitle>
            <AlertDescription>
              {state.error || "请稍后重新加载。"}
            </AlertDescription>
            <div className="col-start-2 mt-3">
              <Button type="button" onClick={() => void loadFirstPage()}>
                重新加载
              </Button>
            </div>
          </Alert>
        ) : (
          <div className="space-y-14">
            {state.error ? (
              <Alert>
                <RefreshCwIcon aria-hidden="true" />
                <AlertTitle>部分内容未能继续加载</AlertTitle>
                <AlertDescription>{state.error}</AlertDescription>
              </Alert>
            ) : null}

            <section aria-labelledby="exchange-offices-title">
              <div className="flex items-end justify-between gap-4 border-b pb-4">
                <div>
                  <h2
                    id="exchange-offices-title"
                    className="text-xl font-semibold"
                  >
                    交换事务所
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {hasFilters ? "当前筛选结果" : "按访问热度排列"}
                  </p>
                </div>
              </div>

              {state.offices.length ? (
                <>
                  <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {state.offices.map((office) => (
                      <OfficeCard
                        key={office.id}
                        office={office}
                        series={seriesMap}
                      />
                    ))}
                  </div>
                  {state.officePageInfo.hasNextPage ? (
                    <div className="mt-6 flex justify-center">
                      <Button
                        type="button"
                        variant="outline"
                        disabled={loadingMoreOffices}
                        onClick={() => void loadMoreOffices()}
                      >
                        {loadingMoreOffices ? (
                          <LoaderCircleIcon
                            className="animate-spin motion-reduce:animate-none"
                            aria-hidden="true"
                          />
                        ) : null}
                        {loadingMoreOffices ? "正在加载" : "加载更多事务所"}
                      </Button>
                    </div>
                  ) : null}
                </>
              ) : (
                <Empty className="mt-5 min-h-56 border-y">
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
                    <Button
                      type="button"
                      variant="outline"
                      onClick={resetFilters}
                    >
                      清除筛选
                    </Button>
                  ) : null}
                </Empty>
              )}
            </section>

            <section aria-labelledby="exchange-cards-title">
              <div className="flex items-end justify-between gap-4 border-b pb-4">
                <div>
                  <h2
                    id="exchange-cards-title"
                    className="text-xl font-semibold"
                  >
                    可交换名片
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {seriesCode
                      ? `${seriesMap.get(seriesCode)?.displayName ?? seriesCode}公开名片`
                      : "最新公开名片"}
                  </p>
                </div>
              </div>

              {state.cards.length ? (
                <>
                  <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    {state.cards.map((card) => (
                      <ExchangeCard
                        key={card.id}
                        card={card}
                        series={seriesMap}
                      />
                    ))}
                  </div>
                  {state.cardPageInfo.hasNextPage ? (
                    <div className="mt-6 flex justify-center">
                      <Button
                        type="button"
                        variant="outline"
                        disabled={loadingMoreCards}
                        onClick={() => void loadMoreCards()}
                      >
                        {loadingMoreCards ? (
                          <LoaderCircleIcon
                            className="animate-spin motion-reduce:animate-none"
                            aria-hidden="true"
                          />
                        ) : null}
                        {loadingMoreCards ? "正在加载" : "加载更多名片"}
                      </Button>
                    </div>
                  ) : null}
                </>
              ) : (
                <Empty className="mt-5 min-h-56 border-y">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <MapPinnedIcon aria-hidden="true" />
                    </EmptyMedia>
                    <EmptyTitle>当前没有可交换名片</EmptyTitle>
                    <EmptyDescription>
                      已审核且开放交换的名片会显示在这里。
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              )}
            </section>
          </div>
        )}
      </div>
    </main>
  )
}
