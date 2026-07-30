import { useWatcher } from "alova/client"
import { ArrowRightIcon, CalendarDaysIcon, NewspaperIcon } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert"
import { getHomeEvents, getHomeNews } from "~/lib/api"
import { useHomeSummaryCount } from "../hooks/use-home-summary-count"
import { HomeEventRow, HomeFeedSkeleton, HomeNewsRow } from "./home-feed-items"

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
              <HomeFeedSkeleton />
            ) : eventsError ? (
              <Alert className="mt-4">
                <CalendarDaysIcon aria-hidden="true" />
                <AlertTitle>活动服务暂时不可用</AlertTitle>
                <AlertDescription>稍后刷新即可重新获取。</AlertDescription>
              </Alert>
            ) : visibleEvents.length ? (
              <div className="divide-y">
                {visibleEvents.map((event) => (
                  <HomeEventRow key={event.id} event={event} />
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
              <HomeFeedSkeleton />
            ) : newsError ? (
              <Alert className="mt-4">
                <NewspaperIcon aria-hidden="true" />
                <AlertTitle>资讯服务暂时不可用</AlertTitle>
                <AlertDescription>稍后刷新即可重新获取。</AlertDescription>
              </Alert>
            ) : visibleNews.length ? (
              <div className="divide-y">
                {visibleNews.map((item) => (
                  <HomeNewsRow key={item.id} item={item} />
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
