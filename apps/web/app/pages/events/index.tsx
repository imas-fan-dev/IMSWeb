import { useWindowVirtualizer } from "@tanstack/react-virtual"
import { CalendarDaysIcon, LoaderCircleIcon, RefreshCwIcon } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"

import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert"
import { Button } from "~/components/ui/button"
import { EventRow, EventsSkeleton } from "./components/events-list"
import { useEventsFeed } from "./hooks/use-events-feed"

export function meta() {
  return [
    { title: "社区动态 | IMSWeb" },
    {
      name: "description",
      content: "浏览 IMSWeb 制作人社区持续更新的公告、招募、企划和活动。",
    },
  ]
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
              <p className="text-xs font-semibold text-primary">COMMUNITY</p>
              <h1 className="mt-2 text-3xl font-semibold">社区动态</h1>
              <p className="mt-3 leading-7 text-muted-foreground">
                汇集制作人社区近期发布的公告、招募、企划与具体活动。
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
                  aria-label="刷新社区动态列表"
                  title="刷新社区动态列表"
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
          社区动态列表
        </h2>

        {phase === "idle" || phase === "loading" ? (
          <EventsSkeleton />
        ) : phase === "error" ? (
          <Alert className="my-8 py-4">
            <CalendarDaysIcon aria-hidden="true" />
            <AlertTitle>社区动态暂时无法加载</AlertTitle>
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
            <p className="mt-4 font-medium">当前没有已发布社区动态</p>
            <p className="mt-1 text-sm text-muted-foreground">
              新帖子发布后会显示在这里。
            </p>
          </div>
        ) : (
          <>
            <div
              ref={attachList}
              role="list"
              aria-label="社区动态列表"
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
                  后续动态加载失败：{loadMoreError}
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
                    : "加载更多动态"}
                </Button>
              ) : (
                <p role="status" className="text-sm text-muted-foreground">
                  已显示本批次的全部动态
                </p>
              )}
            </div>
          </>
        )}
      </section>
    </main>
  )
}

export default EventsCenter
