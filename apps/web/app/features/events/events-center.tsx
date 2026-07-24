import { useWindowVirtualizer } from "@tanstack/react-virtual"
import {
  CalendarDaysIcon,
  ContactRoundIcon,
  ImageIcon,
  LoaderCircleIcon,
  RefreshCwIcon,
  UserRoundIcon,
} from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"

import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert"
import { Button } from "~/components/ui/button"
import { Skeleton } from "~/components/ui/skeleton"
import type { EventListItem } from "./api"
import { useEventsFeed } from "./use-events-feed"

const dateFormatter = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "long",
  day: "numeric",
})

function formatDate(value?: string | null) {
  if (!value) return "发布时间待补充"
  const date = new Date(value)
  return Number.isNaN(date.valueOf())
    ? "发布时间待补充"
    : `${dateFormatter.format(date)}发布`
}

function safeImageUrl(value?: string | null) {
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

function contactUrl(value?: string | null) {
  const candidate = value?.trim()
  if (!candidate || !/^https?:\/\/\S+$/i.test(candidate)) return null
  try {
    return new URL(candidate).href
  } catch {
    return null
  }
}

function EventRow({ event }: { event: EventListItem }) {
  const imageUrl = safeImageUrl(event.image_url)
  const href = contactUrl(event.contact)

  return (
    <article className="grid min-h-36 grid-cols-[6.5rem_minmax(0,1fr)] gap-4 border-b py-5 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-6">
      <div className="flex aspect-[4/3] w-full items-center justify-center self-start overflow-hidden rounded-md bg-info/12 text-info">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt=""
            loading="lazy"
            className="size-full object-cover"
          />
        ) : (
          <ImageIcon aria-hidden="true" className="size-6" />
        )}
      </div>

      <div className="min-w-0 py-0.5">
        <p className="text-xs font-medium text-primary">活动 #{event.id}</p>
        <h2 className="mt-1.5 text-base leading-6 font-semibold whitespace-pre-line sm:text-lg sm:leading-7">
          {event.title}
        </h2>
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <UserRoundIcon aria-hidden="true" className="size-3.5" />
            {event.name || "发布者未署名"}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <CalendarDaysIcon aria-hidden="true" className="size-3.5" />
            {formatDate(event.created_at)}
          </span>
        </div>
        {event.contact ? (
          <div className="mt-2 flex min-w-0 items-start gap-1.5 text-sm text-muted-foreground">
            <ContactRoundIcon
              aria-hidden="true"
              className="mt-0.5 size-3.5 shrink-0"
            />
            {href ? (
              <a
                href={href}
                target="_blank"
                rel="noreferrer"
                className="min-w-0 break-all text-primary underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                {event.contact}
              </a>
            ) : (
              <span className="min-w-0 [overflow-wrap:anywhere] whitespace-pre-line">
                {event.contact}
              </span>
            )}
          </div>
        ) : null}
      </div>
    </article>
  )
}

function EventsSkeleton() {
  return (
    <div className="divide-y" aria-label="正在加载活动">
      {[0, 1, 2, 3].map((item) => (
        <div
          key={item}
          className="grid min-h-36 grid-cols-[6.5rem_minmax(0,1fr)] gap-4 py-5 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-6"
        >
          <Skeleton className="aspect-[4/3] w-full" />
          <div className="space-y-3 py-1">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-5 w-4/5" />
            <Skeleton className="h-4 w-2/5" />
          </div>
        </div>
      ))}
    </div>
  )
}

export function EventsCenter() {
  const {
    phase,
    items,
    pageInfo,
    loadingMore,
    error,
    loadMoreError,
    loadFirstPage,
    loadMore,
    refresh,
  } = useEventsFeed()
  const loadTriggerRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const [scrollMargin, setScrollMargin] = useState(0)

  const getItemKey = useCallback(
    (index: number) => items[index]?.id ?? index,
    [items]
  )
  const virtualizer = useWindowVirtualizer({
    count: items.length,
    estimateSize: () => 176,
    getItemKey,
    overscan: 6,
    scrollMargin,
    useFlushSync: false,
  })
  const virtualItems = virtualizer.getVirtualItems()

  const attachList = useCallback((node: HTMLDivElement | null) => {
    listRef.current = node
    if (node) setScrollMargin(node.offsetTop)
  }, [])

  useEffect(() => {
    const updateScrollMargin = () => {
      if (listRef.current) setScrollMargin(listRef.current.offsetTop)
    }
    window.addEventListener("resize", updateScrollMargin)
    return () => window.removeEventListener("resize", updateScrollMargin)
  }, [])

  useEffect(() => {
    const trigger = loadTriggerRef.current
    if (
      !trigger ||
      !pageInfo.hasNextPage ||
      loadingMore ||
      typeof IntersectionObserver === "undefined"
    ) {
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) void loadMore()
      },
      { rootMargin: "480px 0px" }
    )
    observer.observe(trigger)
    return () => observer.disconnect()
  }, [loadMore, loadingMore, pageInfo.hasNextPage])

  return (
    <main id="main-content">
      <section className="border-b bg-muted/25">
        <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
          <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold text-primary">EVENTS</p>
              <h1 className="mt-2 text-3xl font-semibold">活动中心</h1>
              <p className="mt-3 leading-7 text-muted-foreground">
                汇集制作人社区正在进行和近期发布的国内活动。
              </p>
            </div>
            {phase === "ready" && items.length ? (
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground">
                  已加载 {items.length} 条
                </span>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void refresh()}
                  aria-label="刷新活动列表"
                  title="刷新活动列表"
                >
                  <RefreshCwIcon aria-hidden="true" />
                  刷新
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <section
        className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8"
        aria-labelledby="events-list-heading"
      >
        <h2 id="events-list-heading" className="sr-only">
          活动列表
        </h2>

        {phase === "idle" || phase === "loading" ? (
          <EventsSkeleton />
        ) : phase === "error" ? (
          <Alert className="my-8 py-4">
            <CalendarDaysIcon aria-hidden="true" />
            <AlertTitle>活动暂时无法加载</AlertTitle>
            <AlertDescription>{error || "请稍后重新加载。"}</AlertDescription>
            <div className="col-start-2 mt-3">
              <Button type="button" onClick={() => void loadFirstPage()}>
                重新加载
              </Button>
            </div>
          </Alert>
        ) : items.length === 0 ? (
          <div className="flex min-h-64 flex-col items-center justify-center border-y text-center">
            <CalendarDaysIcon
              aria-hidden="true"
              className="size-7 text-muted-foreground"
            />
            <p className="mt-4 font-medium">当前没有已发布活动</p>
            <p className="mt-1 text-sm text-muted-foreground">
              新活动发布后会显示在这里。
            </p>
          </div>
        ) : (
          <>
            <div
              ref={attachList}
              role="list"
              aria-label="活动列表"
              className="relative w-full"
              style={{ height: virtualizer.getTotalSize() }}
            >
              {virtualItems.map((virtualItem) => {
                const event = items[virtualItem.index]
                if (!event) return null
                return (
                  <div
                    key={virtualItem.key}
                    ref={virtualizer.measureElement}
                    role="listitem"
                    aria-posinset={virtualItem.index + 1}
                    aria-setsize={items.length}
                    data-index={virtualItem.index}
                    className="absolute top-0 left-0 w-full"
                    style={{
                      transform: `translateY(${virtualItem.start - scrollMargin}px)`,
                    }}
                  >
                    <EventRow event={event} />
                  </div>
                )
              })}
            </div>

            <div
              ref={loadTriggerRef}
              className="flex flex-col items-center py-8"
            >
              {loadMoreError ? (
                <p role="alert" className="mb-3 text-sm text-destructive">
                  后续活动加载失败：{loadMoreError}
                </p>
              ) : null}
              {pageInfo.hasNextPage ? (
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  onClick={() => void loadMore()}
                  disabled={loadingMore}
                >
                  {loadingMore ? (
                    <LoaderCircleIcon
                      aria-hidden="true"
                      className="animate-spin"
                    />
                  ) : null}
                  {loadingMore
                    ? "正在加载"
                    : loadMoreError
                      ? "重试加载"
                      : "加载更多活动"}
                </Button>
              ) : (
                <p role="status" className="text-sm text-muted-foreground">
                  已显示本批次的全部活动
                </p>
              )}
            </div>
          </>
        )}
      </section>
    </main>
  )
}
