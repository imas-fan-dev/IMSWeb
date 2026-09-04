import { useWindowVirtualizer } from "@tanstack/react-virtual"
import { LoaderCircleIcon, NewspaperIcon, RefreshCwIcon } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"

import { InfiniteScrollFooter } from "~/components/shared/infinite-scroll-footer"
import { PageShell } from "~/components/shared/page-shell"
import { PullToRefresh } from "~/components/shared/pull-to-refresh"
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert"
import { Button } from "~/components/ui/button"
import {
  RecommendationRow,
  RecommendationsSkeleton,
} from "./components/recommendations-list"
import { IS_APP_TARGET } from "~/lib/app-target"
import { useInfiniteScroll } from "~/lib/use-infinite-scroll"
import { cn } from "~/lib/utils"
import { useRecommendationsFeed } from "./hooks/use-recommendations-feed"

export function meta() {
  return [
    { title: "向您推荐 | IMSWeb" },
    {
      name: "description",
      content: "浏览 IMSWeb 制作人社区持续更新的推荐内容。",
    },
  ]
}

export function RecommendationsCenter() {
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
  } = useRecommendationsFeed()
  const listRef = useRef<HTMLDivElement>(null)
  const [scrollMargin, setScrollMargin] = useState(0)

  const sentinelRef = useInfiniteScroll({
    hasNextPage: pageInfo.hasNextPage,
    loading: loadingMore,
    onLoadMore: loadMore,
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

  return (
    <PageShell width="wide">
      <header
        className={cn("border-b bg-muted/25", IS_APP_TARGET ? "pb-5" : "pb-8")}
      >
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div className="max-w-2xl min-w-0">
            {!IS_APP_TARGET ? (
              <p className="text-xs font-semibold text-primary">
                RECOMMENDATIONS
              </p>
            ) : null}
            <h1
              className={cn(
                "font-semibold wrap-anywhere",
                IS_APP_TARGET ? "text-2xl" : "mt-2 text-3xl"
              )}
            >
              向您推荐
            </h1>
            <p
              className={cn(
                "leading-7 wrap-anywhere text-muted-foreground",
                IS_APP_TARGET ? "mt-2 text-sm" : "mt-3"
              )}
            >
              持续收录制作人社区近期值得关注的内容。
            </p>
          </div>
          {/* The app build refreshes by pulling the list, so it carries no
              button and no counter beside the title. Pointer viewports on the
              web keep both, because there is no gesture to reach for. */}
          {!IS_APP_TARGET && phase === "ready" && items.length ? (
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm text-muted-foreground">
                已加载 {items.length} 条
              </span>
              <Button
                type="button"
                variant="outline"
                onClick={() => void refresh()}
                disabled={refreshing}
                aria-label="刷新推荐列表"
                title="刷新推荐列表"
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
          ) : null}
        </div>
      </header>

      <PullToRefresh
        onRefresh={refresh}
        enabled={phase === "ready" || phase === "error"}
      >
        <section
          className="min-w-0 pt-6"
          aria-labelledby="recommendations-list-heading"
        >
          <h2 id="recommendations-list-heading" className="sr-only">
            推荐列表
          </h2>

          {phase === "idle" || phase === "loading" ? (
            <RecommendationsSkeleton />
          ) : phase === "error" ? (
            <Alert className="my-8 py-4">
              <NewspaperIcon aria-hidden="true" />
              <AlertTitle>推荐暂时无法加载</AlertTitle>
              <AlertDescription>{error || "请稍后重新加载。"}</AlertDescription>
              <div className="col-start-2 mt-3">
                <Button type="button" onClick={() => void loadFirstPage()}>
                  重新加载
                </Button>
              </div>
            </Alert>
          ) : items.length === 0 ? (
            <div className="flex min-h-64 flex-col items-center justify-center border-y text-center">
              <NewspaperIcon
                aria-hidden="true"
                className="size-7 text-muted-foreground"
              />
              <p className="mt-4 font-medium">当前没有已发布推荐</p>
              <p className="mt-1 text-sm text-muted-foreground">
                新内容发布后会显示在这里。
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
                aria-label="推荐列表"
                className="relative w-full"
                style={{ height: virtualizer.getTotalSize() }}
              >
                {virtualItems.map((virtualItem) => {
                  const item = items[virtualItem.index]
                  if (!item) return null
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
                      <RecommendationRow item={item} />
                    </div>
                  )
                })}
              </div>

              <InfiniteScrollFooter
                sentinelRef={sentinelRef}
                label="推荐"
                hasNextPage={pageInfo.hasNextPage}
                loading={loadingMore}
                error={loadMoreError}
                onRetry={() => void loadMore()}
              />
            </>
          )}
        </section>
      </PullToRefresh>
    </PageShell>
  )
}

export default RecommendationsCenter
