import { useWindowVirtualizer } from "@tanstack/react-virtual"
import { CalendarDaysIcon, LoaderCircleIcon, RefreshCwIcon } from "lucide-react"
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react"

import { InfiniteScrollFooter } from "~/components/shared/infinite-scroll-footer"
import { PublicFeedHeader } from "~/components/shared/public-feed-header"
import { PullToRefresh } from "~/components/shared/pull-to-refresh"
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert"
import { Button } from "~/components/ui/button"
import { IS_APP_TARGET } from "~/lib/app-target"
import { useInfiniteScroll } from "~/lib/use-infinite-scroll"
import { usePublicFeedColumnCount } from "~/lib/use-public-feed-column-count"
import { cn } from "~/lib/utils"
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
  useLayoutEffect(() => {
    if (!IS_APP_TARGET) return
    // Router restoration and virtual row corrections share the window. CSS
    // smooth scrolling leaves stale targets active while row heights change.
    const root = document.documentElement
    const value = root.style.getPropertyValue("scroll-behavior")
    const priority = root.style.getPropertyPriority("scroll-behavior")
    root.style.setProperty("scroll-behavior", "auto")
    // Resolve the new style before Router's viewport scroll in this commit.
    void getComputedStyle(root).scrollBehavior
    return () => {
      if (value) root.style.setProperty("scroll-behavior", value, priority)
      else root.style.removeProperty("scroll-behavior")
    }
  }, [])

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
  const listRef = useRef<HTMLDivElement>(null)
  const [scrollMargin, setScrollMargin] = useState(0)
  const columnCount = usePublicFeedColumnCount()
  const virtualRowCount = Math.ceil(items.length / columnCount)

  const sentinelRef = useInfiniteScroll({
    hasNextPage: pageInfo.hasNextPage,
    loading: loadingMore,
    onLoadMore: loadMore,
  })

  const getItemKey = useCallback(
    (rowIndex: number) => items[rowIndex * columnCount]?.id ?? rowIndex,
    [columnCount, items]
  )
  const virtualizer = useWindowVirtualizer({
    // Let Router reset the previous document before the App list binds the
    // window. An empty loading view must not capture the source page's offset.
    enabled: !IS_APP_TARGET || (phase === "ready" && items.length > 0),
    count: virtualRowCount,
    estimateSize: () => 144,
    getItemKey,
    overscan: 6,
    scrollMargin,
    useFlushSync: false,
  })
  const virtualItems = virtualizer.getVirtualItems()
  const measureVirtualizer = virtualizer.measure

  const attachList = useCallback((node: HTMLDivElement | null) => {
    listRef.current = node
    if (node) setScrollMargin(node.offsetTop)
  }, [])

  useEffect(() => {
    measureVirtualizer()
  }, [columnCount, items, measureVirtualizer])

  useEffect(() => {
    const updateScrollMargin = () => {
      if (listRef.current) setScrollMargin(listRef.current.offsetTop)
    }
    window.addEventListener("resize", updateScrollMargin)
    return () => window.removeEventListener("resize", updateScrollMargin)
  }, [])

  return (
    <main id="main-content">
      {IS_APP_TARGET ? (
        <div className="px-(--app-safe-inline) pt-4">
          <h1 className="text-xl font-semibold">社区动态</h1>
        </div>
      ) : (
        <PublicFeedHeader
          eyebrow="COMMUNITY"
          title="社区动态"
          description="汇集制作人社区近期发布的公告、招募、企划与具体活动。"
          actions={
            phase === "ready" && items.length ? (
              <div className="flex flex-wrap items-center gap-3">
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
                  aria-label="刷新社区动态列表"
                  title="刷新社区动态列表"
                  className="max-sm:hidden"
                >
                  {refreshing ? (
                    <LoaderCircleIcon
                      aria-hidden="true"
                      className="animate-spin motion-reduce:animate-none"
                    />
                  ) : (
                    <RefreshCwIcon aria-hidden="true" />
                  )}
                  刷新
                </Button>
              </div>
            ) : undefined
          }
        />
      )}

      <PullToRefresh
        onRefresh={refresh}
        enabled={phase === "ready" || phase === "error"}
      >
        <section
          className={
            IS_APP_TARGET
              ? "w-full px-(--app-safe-inline) py-3"
              : "mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8"
          }
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
              {refreshError ? (
                <p role="alert" className="pb-3 text-sm text-destructive">
                  刷新失败：{refreshError}
                </p>
              ) : null}

              <div
                ref={attachList}
                role="list"
                aria-label="社区动态列表"
                className="relative w-full"
                style={{ height: virtualizer.getTotalSize() }}
              >
                {virtualItems.map((virtualRow) => {
                  const firstItemIndex = virtualRow.index * columnCount
                  const rowItems = items.slice(
                    firstItemIndex,
                    firstItemIndex + columnCount
                  )
                  if (rowItems.length === 0) return null

                  return (
                    <div
                      key={virtualRow.key}
                      ref={virtualizer.measureElement}
                      role="presentation"
                      data-index={virtualRow.index}
                      className={cn(
                        "absolute top-0 left-0 grid w-full grid-cols-1",
                        columnCount === 2 && "grid-cols-2 gap-x-6"
                      )}
                      style={{
                        transform: `translateY(${virtualRow.start - scrollMargin}px)`,
                      }}
                    >
                      {rowItems.map((event, columnIndex) => {
                        const itemIndex = firstItemIndex + columnIndex
                        return (
                          <div
                            key={event.id}
                            role="listitem"
                            aria-posinset={itemIndex + 1}
                            aria-setsize={items.length}
                            className="min-w-0"
                          >
                            <EventRow event={event} />
                          </div>
                        )
                      })}
                    </div>
                  )
                })}
              </div>

              <InfiniteScrollFooter
                sentinelRef={sentinelRef}
                label="动态"
                hasNextPage={pageInfo.hasNextPage}
                loading={loadingMore}
                error={loadMoreError}
                onRetry={() => void loadMore()}
              />
            </>
          )}
        </section>
      </PullToRefresh>
    </main>
  )
}

export default EventsCenter
