import { useWindowVirtualizer } from "@tanstack/react-virtual"
import {
  ArrowUpRightIcon,
  ImageIcon,
  LoaderCircleIcon,
  NewspaperIcon,
  RefreshCwIcon,
} from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"

import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert"
import { Button } from "~/components/ui/button"
import { Skeleton } from "~/components/ui/skeleton"
import type { Recommendation } from "./api"
import { useRecommendationsFeed } from "./use-recommendations-feed"

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
    : dateFormatter.format(date)
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

function RecommendationRow({ item }: { item: Recommendation }) {
  const href = safeHttpUrl(item.content)
  const thumbnail = safeHttpUrl(item.thumbnail)

  const content = (
    <>
      <div className="flex aspect-[4/3] w-full items-center justify-center self-start overflow-hidden rounded-md bg-warning/14 text-warning-foreground">
        {thumbnail ? (
          <img
            src={thumbnail}
            alt=""
            loading="lazy"
            className="size-full object-cover"
          />
        ) : (
          <ImageIcon aria-hidden="true" className="size-6" />
        )}
      </div>
      <div className="min-w-0 py-0.5">
        <p className="text-xs font-medium text-primary">推荐 #{item.id}</p>
        <h2 className="mt-1.5 text-base leading-6 font-semibold group-hover:text-primary sm:text-lg sm:leading-7">
          {item.title}
        </h2>
        <p className="mt-3 text-sm text-muted-foreground">
          {formatDate(item.date)}
        </p>
      </div>
      {href ? (
        <ArrowUpRightIcon
          aria-hidden="true"
          className="mt-1 size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary"
        />
      ) : null}
    </>
  )

  const className =
    "group grid min-h-36 grid-cols-[6.5rem_minmax(0,1fr)_auto] gap-4 border-b py-5 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none sm:grid-cols-[9rem_minmax(0,1fr)_auto] sm:gap-6"

  return href ? (
    <a href={href} target="_blank" rel="noreferrer" className={className}>
      {content}
    </a>
  ) : (
    <article className={className}>{content}</article>
  )
}

function RecommendationsSkeleton() {
  return (
    <div className="divide-y" aria-label="正在加载推荐">
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

export function RecommendationsCenter() {
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
  } = useRecommendationsFeed()
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
              <p className="text-xs font-semibold text-primary">
                RECOMMENDATIONS
              </p>
              <h1 className="mt-2 text-3xl font-semibold">向您推荐</h1>
              <p className="mt-3 leading-7 text-muted-foreground">
                持续收录制作人社区近期值得关注的内容。
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
                  aria-label="刷新推荐列表"
                  title="刷新推荐列表"
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

            <div
              ref={loadTriggerRef}
              className="flex flex-col items-center py-8"
            >
              {loadMoreError ? (
                <p role="alert" className="mb-3 text-sm text-destructive">
                  后续推荐加载失败：{loadMoreError}
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
                      : "加载更多推荐"}
                </Button>
              ) : (
                <p role="status" className="text-sm text-muted-foreground">
                  已显示本批次的全部推荐
                </p>
              )}
            </div>
          </>
        )}
      </section>
    </main>
  )
}
