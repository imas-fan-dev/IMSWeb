import { useWindowVirtualizer } from "@tanstack/react-virtual"
import { CalendarDaysIcon, LoaderCircleIcon, RefreshCwIcon } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"

import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert"
import { Button } from "~/components/ui/button"
import { cn } from "~/lib/utils"
import { IS_APP_TARGET } from "~/lib/app-target"
import { EventRow, EventsSkeleton } from "./components/events-list"
import { PullToRefreshIndicator } from "./components/pull-to-refresh-indicator"
import { useEventsFeed } from "./hooks/use-events-feed"
import { usePullToRefresh } from "./hooks/use-pull-to-refresh"

/** How close to the end of the document a scroll gets before the next page. */
const LOAD_MORE_MARGIN = 480

export function meta() {
  return [
    { title: "活动中心 | IMSWeb" },
    {
      name: "description",
      content: "浏览 IMSWeb 制作人社区持续更新的国内活动。",
    },
  ]
}

export function EventsCenter() {
  const {
    phase,
    items,
    pageInfo,
    loadingMore,
    refreshing,
    error,
    loadMoreError,
    refreshError,
    loadFirstPage,
    loadMore,
    refresh,
  } = useEventsFeed()
  const loadTriggerRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const [scrollMargin, setScrollMargin] = useState(0)

  const pull = usePullToRefresh({
    onRefresh: refresh,
    enabled: phase === "ready" || phase === "error",
  })

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
      { rootMargin: `${LOAD_MORE_MARGIN}px 0px` }
    )
    observer.observe(trigger)
    return () => observer.disconnect()
  }, [loadMore, loadingMore, pageInfo.hasNextPage])

  // Scroll-position fallback for engines without IntersectionObserver. Without
  // it those browsers would reach the end of the list with no way forward,
  // because the manual "load more" button is gone.
  useEffect(() => {
    if (
      !pageInfo.hasNextPage ||
      loadingMore ||
      typeof IntersectionObserver !== "undefined"
    ) {
      return
    }

    const loadWhenNearBottom = () => {
      const remaining =
        document.documentElement.scrollHeight -
        (window.scrollY + window.innerHeight)
      if (remaining <= LOAD_MORE_MARGIN) void loadMore()
    }

    // A first page shorter than the viewport never fires a scroll event.
    loadWhenNearBottom()
    window.addEventListener("scroll", loadWhenNearBottom, { passive: true })
    window.addEventListener("resize", loadWhenNearBottom)
    return () => {
      window.removeEventListener("scroll", loadWhenNearBottom)
      window.removeEventListener("resize", loadWhenNearBottom)
    }
  }, [loadMore, loadingMore, pageInfo.hasNextPage])

  return (
    <main id="main-content">
      {IS_APP_TARGET ? (
        // The app title bar already names this tab, and refreshing is a pull
        // now, so the page adds no second header of its own. The heading stays
        // for assistive technology, which has no title bar to read.
        <h1 className="sr-only">活动中心</h1>
      ) : (
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
                  {/* Touch viewports refresh by pulling the list. A mouse has
                      no such gesture, so the pointer layout keeps a button. */}
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void refresh()}
                    disabled={refreshing}
                    aria-label="刷新活动列表"
                    title="刷新活动列表"
                    className="max-sm:hidden"
                  >
                    {refreshing ? (
                      <LoaderCircleIcon
                        aria-hidden="true"
                        className="animate-spin"
                      />
                    ) : (
                      <RefreshCwIcon aria-hidden="true" />
                    )}
                    刷新
                  </Button>
                </div>
              ) : null}
            </div>
          </div>
        </section>
      )}

      {/* The pull band moves the list with a transform rather than by growing a
          spacer: `offsetTop` is untouched by transforms, so the window
          virtualizer's `scrollMargin` stays correct while the band is open.
          The indicator lives inside the band so it rides the same transform and
          stays anchored below the header instead of under it. */}
      <div
        className={cn(
          "relative",
          !pull.dragging && "transition-transform duration-300 ease-out",
          "motion-reduce:transition-none"
        )}
        style={{ transform: `translateY(${pull.distance}px)` }}
      >
        <PullToRefreshIndicator status={pull.status} progress={pull.progress} />

        <section
          className={
            IS_APP_TARGET
              ? "w-full px-(--app-safe-inline) py-3"
              : "mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8"
          }
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
              {refreshError ? (
                <p role="alert" className="pb-3 text-sm text-destructive">
                  刷新失败：{refreshError}
                </p>
              ) : null}

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
                  <>
                    <p role="alert" className="mb-3 text-sm text-destructive">
                      后续活动加载失败：{loadMoreError}
                    </p>
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
                      {loadingMore ? "正在加载" : "重试加载"}
                    </Button>
                  </>
                ) : pageInfo.hasNextPage ? (
                  <p
                    role="status"
                    className="flex items-center gap-2 text-sm text-muted-foreground"
                  >
                    <LoaderCircleIcon
                      aria-hidden="true"
                      className="size-4 animate-spin"
                    />
                    正在加载更多活动
                  </p>
                ) : (
                  <p role="status" className="text-sm text-muted-foreground">
                    已显示本批次的全部活动
                  </p>
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  )
}

export default EventsCenter
