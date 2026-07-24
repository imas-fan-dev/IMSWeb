import { useWatcher } from "alova/client"
import {
  ArrowRightIcon,
  ArrowUpRightIcon,
  CalendarDaysIcon,
  ImageIcon,
  NewspaperIcon,
} from "lucide-react"
import { useSyncExternalStore } from "react"

import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert"
import { Skeleton } from "~/components/ui/skeleton"
import { getHomeEvents, getHomeNews } from "./api"
import type { HomeEvent, HomeNews } from "./api"

const desktopSummaryQuery = "(min-width: 1024px)"
const narrowSummaryCount = 3
const desktopSummaryCount = 4

function subscribeToSummaryBreakpoint(onChange: () => void) {
  if (typeof window === "undefined" || !window.matchMedia)
    return () => undefined
  const query = window.matchMedia(desktopSummaryQuery)
  query.addEventListener("change", onChange)
  return () => query.removeEventListener("change", onChange)
}

function getSummaryCount() {
  if (typeof window === "undefined" || !window.matchMedia) {
    return narrowSummaryCount
  }
  return window.matchMedia(desktopSummaryQuery).matches
    ? desktopSummaryCount
    : narrowSummaryCount
}

function useHomeSummaryCount() {
  return useSyncExternalStore(
    subscribeToSummaryBreakpoint,
    getSummaryCount,
    () => narrowSummaryCount
  )
}

const dateFormatter = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
})

function formatDate(value?: string | null) {
  if (!value) return "日期待定"
  const date = new Date(value)
  return Number.isNaN(date.valueOf()) ? "日期待定" : dateFormatter.format(date)
}

function safeHttpUrl(value?: string | null) {
  if (!value) return null
  try {
    const origin =
      typeof window === "undefined"
        ? "https://imsweb.invalid"
        : window.location.origin
    const url = new URL(value, origin)
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.href
      : null
  } catch {
    return null
  }
}

function FeedSkeleton() {
  return (
    <div className="grid gap-3" aria-label="正在加载">
      {[0, 1, 2].map((item) => (
        <div key={item} className="flex items-center gap-3 border-b pb-3">
          <Skeleton className="h-16 w-20 shrink-0" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-3 w-2/5" />
          </div>
        </div>
      ))}
    </div>
  )
}

function EventRow({ event }: { event: HomeEvent }) {
  const imageUrl = safeHttpUrl(event.image_url)
  const byline = `${event.name || "发布者未署名"} · ${formatDate(
    event.created_at
  )}`

  return (
    <a
      href="/events"
      className="group grid min-h-24 grid-cols-[5rem_minmax(0,1fr)] gap-3 py-4 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <span className="flex h-16 w-20 items-center justify-center overflow-hidden rounded-md bg-info/12 text-info">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt=""
            loading="lazy"
            className="size-full object-cover"
          />
        ) : (
          <CalendarDaysIcon aria-hidden="true" className="size-5" />
        )}
      </span>
      <span className="min-w-0">
        <span
          className="line-clamp-2 text-sm font-medium break-words whitespace-pre-line group-hover:text-primary"
          title={event.title}
        >
          {event.title}
        </span>
        <span
          className="mt-1.5 block truncate text-xs text-muted-foreground"
          title={byline}
        >
          {byline}
        </span>
        {event.contact ? (
          <span
            className="mt-1 block truncate text-xs text-muted-foreground"
            title={event.contact}
          >
            {event.contact}
          </span>
        ) : null}
      </span>
    </a>
  )
}

function NewsRow({ item }: { item: HomeNews }) {
  const href = safeHttpUrl(item.content)
  const thumbnail = safeHttpUrl(item.thumbnail)
  const content = (
    <>
      <span className="flex h-16 w-20 items-center justify-center overflow-hidden rounded-md bg-warning/14 text-warning-foreground">
        {thumbnail ? (
          <img
            src={thumbnail}
            alt=""
            loading="lazy"
            className="size-full object-cover"
          />
        ) : (
          <ImageIcon aria-hidden="true" className="size-5" />
        )}
      </span>
      <span className="min-w-0">
        <span
          className="line-clamp-2 text-sm font-medium break-words group-hover:text-primary"
          title={item.title}
        >
          {item.title}
        </span>
        <span className="mt-1.5 block text-xs text-muted-foreground">
          {formatDate(item.date)}
        </span>
      </span>
      {href ? (
        <ArrowUpRightIcon
          aria-hidden="true"
          className="ml-auto size-4 shrink-0 self-center text-muted-foreground"
        />
      ) : null}
    </>
  )

  const className =
    "group grid min-h-24 grid-cols-[5rem_minmax(0,1fr)_auto] gap-3 py-4 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"

  return href ? (
    <a href={href} target="_blank" rel="noreferrer" className={className}>
      {content}
    </a>
  ) : (
    <div className={className}>{content}</div>
  )
}

export function HomeFeed() {
  const summaryCount = useHomeSummaryCount()
  const {
    loading: newsLoading,
    data: newsData,
    error: newsError,
    onError: onNewsError,
  } = useWatcher(() => getHomeNews(summaryCount), [summaryCount], {
    immediate: true,
    abortLast: true,
    initialData: [],
  })
  onNewsError(() => undefined)
  const {
    loading: eventsLoading,
    data: eventsData,
    error: eventsError,
    onError: onEventsError,
  } = useWatcher(() => getHomeEvents(summaryCount), [summaryCount], {
    immediate: true,
    abortLast: true,
    initialData: {
      items: [],
      pageInfo: {
        nextCursor: null,
        hasNextPage: false,
        snapshotAt: null,
      },
    },
  })
  onEventsError(() => undefined)
  const visibleEvents = eventsData.items.slice(0, summaryCount)
  const visibleNews = newsData.slice(0, summaryCount)

  return (
    <section className="border-t bg-muted/25" aria-labelledby="latest-heading">
      <div className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="mb-7">
          <p className="text-xs font-semibold text-primary">LATEST</p>
          <h2 id="latest-heading" className="mt-2 text-2xl font-semibold">
            站内动态
          </h2>
        </div>

        <div className="grid gap-10 lg:grid-cols-2 lg:gap-14">
          <section aria-labelledby="events-heading">
            <div className="mb-1 flex min-h-8 items-center gap-2">
              <CalendarDaysIcon
                className="size-4 text-primary"
                aria-hidden="true"
              />
              <h3 id="events-heading" className="font-semibold">
                国内活动
              </h3>
              <a
                href="/events"
                className="ml-auto inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                查看全部活动
                <ArrowRightIcon aria-hidden="true" className="size-4" />
              </a>
            </div>
            {eventsLoading ? (
              <FeedSkeleton />
            ) : eventsError ? (
              <Alert className="mt-4">
                <CalendarDaysIcon aria-hidden="true" />
                <AlertTitle>活动服务暂时不可用</AlertTitle>
                <AlertDescription>稍后刷新即可重新获取。</AlertDescription>
              </Alert>
            ) : visibleEvents.length ? (
              <div className="divide-y">
                {visibleEvents.map((event) => (
                  <EventRow key={event.id} event={event} />
                ))}
              </div>
            ) : (
              <p className="mt-4 border-y py-8 text-sm text-muted-foreground">
                当前没有已发布活动。
              </p>
            )}
          </section>

          <section aria-labelledby="news-heading">
            <div className="mb-1 flex min-h-8 items-center gap-2">
              <NewspaperIcon
                className="size-4 text-primary"
                aria-hidden="true"
              />
              <h3 id="news-heading" className="font-semibold">
                向您推荐
              </h3>
              <a
                href="/recommendations"
                className="ml-auto inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                查看全部推荐
                <ArrowRightIcon aria-hidden="true" className="size-4" />
              </a>
            </div>
            {newsLoading ? (
              <FeedSkeleton />
            ) : newsError ? (
              <Alert className="mt-4">
                <NewspaperIcon aria-hidden="true" />
                <AlertTitle>资讯服务暂时不可用</AlertTitle>
                <AlertDescription>稍后刷新即可重新获取。</AlertDescription>
              </Alert>
            ) : visibleNews.length ? (
              <div className="divide-y">
                {visibleNews.map((item) => (
                  <NewsRow key={item.id} item={item} />
                ))}
              </div>
            ) : (
              <p className="mt-4 border-y py-8 text-sm text-muted-foreground">
                当前没有已发布资讯。
              </p>
            )}
          </section>
        </div>
      </div>
    </section>
  )
}
