import { useRequest } from "alova/client"
import {
  CalendarDaysIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ExternalLinkIcon,
  MapPinIcon,
  RadioIcon,
  ClockIcon,
} from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"

import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { Card, CardContent } from "~/components/ui/card"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "~/components/ui/empty"
import { Skeleton } from "~/components/ui/skeleton"
import { Input } from "~/components/ui/input"
import {
  hasLiveBrandLogo,
  LiveBrandLogo,
} from "~/pages/live/components/live-brand-logo"
import {
  eventsForMonth,
  LIVE_ARCHIVE_START_MONTH,
  livePage,
  livePageCount,
  monthKey,
  nextMonthKey,
  upcomingLiveEvents,
} from "~/pages/live/live-schedule-model"
import { getLiveEvents, type LiveEvent } from "~/shared/api"

export function meta() {
  return [{ title: "Live 日程 | IMSWeb" }]
}

function LiveLoading({ label, rows = 3 }: { label: string; rows?: number }) {
  return (
    <div className="space-y-4" aria-label={label}>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-32 w-full rounded-xl" />
      ))}
    </div>
  )
}

function LiveCard({ event }: { event: LiveEvent }) {
  return (
    <Card className="overflow-hidden transition-colors hover:border-foreground/15">
      <CardContent className="flex gap-4 p-5">
        <div className="flex w-16 shrink-0 flex-col items-center justify-center rounded-lg border bg-muted/50 py-2">
          <span className="text-xs text-muted-foreground">{event.month}月</span>
          <span className="text-2xl font-bold tabular-nums">{event.day}</span>
        </div>

        <div className="min-w-0 flex-1">
          <h3 className="text-base/snug font-semibold">
            {event.title}
          </h3>

          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            {event.time ? (
              <span className="inline-flex items-center gap-1">
                <ClockIcon className="size-3.5" aria-hidden="true" />
                {event.time}
              </span>
            ) : null}
            {event.location ? (
              <span className="inline-flex items-center gap-1">
                <MapPinIcon className="size-3.5" aria-hidden="true" />
                {event.location}
              </span>
            ) : null}
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            {event.franchises.map((franchise, index) => {
              const code = event.brandCodes[index] ?? "OTHER"
              return (
                <span key={`${code}-${franchise}`}>
                  {hasLiveBrandLogo(code) ? (
                    <LiveBrandLogo code={code} name={franchise} />
                  ) : (
                    <Badge variant="outline" className="text-xs">
                      {franchise}
                    </Badge>
                  )}
                </span>
              )
            })}
            {event.detailUrl ? (
              <a
                href={event.detailUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-primary transition-colors hover:underline"
              >
                详情
                <ExternalLinkIcon className="size-3" aria-hidden="true" />
              </a>
            ) : null}
          </div>
        </div>

        {event.image ? (
          <img
            src={event.image}
            alt=""
            className="hidden size-20 shrink-0 rounded-lg object-cover sm:block"
            loading="lazy"
          />
        ) : null}
      </CardContent>
    </Card>
  )
}

export default function Live() {
  const today = useMemo(() => new Date(), [])
  const currentMonth = useMemo(() => monthKey(today), [today])
  const initialMonths = useMemo(
    () => [currentMonth, nextMonthKey(today)],
    [currentMonth, today]
  )
  const {
    data: initialData,
    loading: initialLoading,
    error: initialError,
  } = useRequest(getLiveEvents(initialMonths))
  const {
    data: selectedData,
    loading: selectedLoading,
    error: selectedError,
    send: loadSelectedMonth,
  } = useRequest((month: string) => getLiveEvents([month]), {
    immediate: false,
  })
  const [selectedMonth, setSelectedMonth] = useState(currentMonth)
  const [page, setPage] = useState(1)
  const loadSelectedMonthRef = useRef(loadSelectedMonth)

  const usesInitialData = initialMonths.includes(selectedMonth)

  useEffect(() => {
    loadSelectedMonthRef.current = loadSelectedMonth
  }, [loadSelectedMonth])

  useEffect(() => {
    if (usesInitialData) return
    void loadSelectedMonthRef.current(selectedMonth).catch(() => undefined)
  }, [selectedMonth, usesInitialData])

  const featuredEvents = useMemo(
    () => upcomingLiveEvents(initialData ?? [], today),
    [initialData, today]
  )
  const archiveSource = usesInitialData ? initialData : selectedData
  const archiveEvents = useMemo(
    () => eventsForMonth(archiveSource ?? [], selectedMonth),
    [archiveSource, selectedMonth]
  )
  const pageCount = livePageCount(archiveEvents)
  const pagedEvents = livePage(archiveEvents, page)
  const archiveLoading = usesInitialData ? initialLoading : selectedLoading
  const archiveError = usesInitialData ? initialError : selectedError

  return (
    <main id="main-content" className="mx-auto w-full max-w-4xl px-6 py-16">
      <div className="max-w-3xl">
        <p className="text-sm font-semibold tracking-[0.2em] text-primary uppercase">
          Live schedule
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight">
          Live 日程
        </h1>
        <p className="mt-4 text-base/7 text-muted-foreground">
          查看各企划已公布的演出安排与线上活动信息。
        </p>
      </div>

      <section className="mt-10" aria-labelledby="featured-live-title">
        <div className="mb-5 flex items-end justify-between gap-4">
          <h2 id="featured-live-title" className="text-xl font-semibold">
            未来两周
          </h2>
          {!initialLoading && !initialError ? (
            <span className="text-sm text-muted-foreground">
              {featuredEvents.length} 条
            </span>
          ) : null}
        </div>

        {initialLoading ? <LiveLoading label="正在加载未来两周日程" /> : null}

        {initialError ? (
          <Alert variant="destructive">
            <RadioIcon aria-hidden="true" />
            <AlertTitle>无法加载日程</AlertTitle>
            <AlertDescription>请稍后刷新页面重试。</AlertDescription>
          </Alert>
        ) : null}

        {!initialLoading && !initialError ? (
          featuredEvents.length ? (
            <div className="space-y-4">
              {featuredEvents.map((event) => (
                <LiveCard key={event.id} event={event} />
              ))}
            </div>
          ) : (
            <Empty className="min-h-48 border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <CalendarDaysIcon aria-hidden="true" />
                </EmptyMedia>
                <EmptyTitle>未来两周暂无日程</EmptyTitle>
                <EmptyDescription>
                  当前没有已公布的近期演出安排。
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )
        ) : null}
      </section>

      <section
        className="mt-12 border-t pt-10"
        aria-labelledby="archive-live-title"
      >
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <h2 id="archive-live-title" className="text-xl font-semibold">
              更多日程
            </h2>
            {!archiveLoading && !archiveError ? (
              <p className="mt-1 text-sm text-muted-foreground">
                共 {archiveEvents.length} 条
              </p>
            ) : null}
          </div>
          <label className="grid gap-1.5 text-sm font-medium">
            <span>月份</span>
            <Input
              type="month"
              min={LIVE_ARCHIVE_START_MONTH}
              value={selectedMonth}
              onChange={(event) => {
                setSelectedMonth(event.target.value)
                setPage(1)
              }}
              className="w-44"
              aria-label="筛选日程月份"
            />
          </label>
        </div>

        <div className="mt-6">
          {archiveLoading ? (
            <LiveLoading label="正在加载所选月份日程" rows={4} />
          ) : null}

          {archiveError ? (
            <Alert variant="destructive">
              <RadioIcon aria-hidden="true" />
              <AlertTitle>无法加载所选月份</AlertTitle>
              <AlertDescription>请稍后重试或选择其他月份。</AlertDescription>
            </Alert>
          ) : null}

          {!archiveLoading && !archiveError ? (
            archiveEvents.length ? (
              <div className="space-y-4" aria-label="更多日程列表">
                {pagedEvents.map((event) => (
                  <LiveCard key={event.id} event={event} />
                ))}
              </div>
            ) : (
              <Empty className="min-h-48 border">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <CalendarDaysIcon aria-hidden="true" />
                  </EmptyMedia>
                  <EmptyTitle>该月份暂无日程</EmptyTitle>
                  <EmptyDescription>
                    {selectedMonth} 没有已记录的演出安排。
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            )
          ) : null}
        </div>

        {!archiveLoading && !archiveError && archiveEvents.length > 10 ? (
          <nav
            className="mt-6 flex items-center justify-center gap-3"
            aria-label="更多日程分页"
          >
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="上一页"
              title="上一页"
              disabled={page === 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              <ChevronLeftIcon aria-hidden="true" />
            </Button>
            <span className="min-w-20 text-center text-sm tabular-nums">
              第 {page} / {pageCount} 页
            </span>
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="下一页"
              title="下一页"
              disabled={page === pageCount}
              onClick={() =>
                setPage((current) => Math.min(pageCount, current + 1))
              }
            >
              <ChevronRightIcon aria-hidden="true" />
            </Button>
          </nav>
        ) : null}
      </section>
    </main>
  )
}
