import { useRequest } from "alova/client"
import {
  CalendarDaysIcon,
  ExternalLinkIcon,
  MapPinIcon,
  RadioIcon,
  ClockIcon,
} from "lucide-react"
import { useMemo, useState } from "react"

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
import { getLiveEvents, type LiveEvent } from "~/shared/api"

export function meta() {
  return [{ title: "Live 日程 | IMSWeb" }]
}

function LiveLoading() {
  return (
    <div className="space-y-4" aria-label="正在加载 Live 日程">
      {Array.from({ length: 6 }, (_, i) => (
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
            {event.franchises.map((f) => (
              <Badge key={f} variant="outline" className="text-xs">
                {f}
              </Badge>
            ))}
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
  const { data, loading, error } = useRequest(getLiveEvents)
  const [selectedYear, setSelectedYear] = useState<number | null>(null)

  const { years, filtered } = useMemo(() => {
    if (!data) return { years: [], filtered: [] }

    const yearsSet = new Set(data.map((e) => e.year))
    const yearsArr = Array.from(yearsSet).sort((a, b) => b - a)

    const filteredEvents = selectedYear
      ? data.filter((e) => e.year === selectedYear)
      : data

    // sort by date descending
    filteredEvents.sort((a, b) => {
      if (a.year !== b.year) return b.year - a.year
      if (a.month !== b.month) return b.month - a.month
      return b.day - a.day
    })

    return { years: yearsArr, filtered: filteredEvents }
  }, [data, selectedYear])

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

      {loading ? (
        <div className="mt-10">
          <LiveLoading />
        </div>
      ) : null}

      {error ? (
        <div className="mt-10">
          <Alert variant="destructive">
            <RadioIcon aria-hidden="true" />
            <AlertTitle>无法加载日程</AlertTitle>
            <AlertDescription>请稍后刷新页面重试。</AlertDescription>
          </Alert>
        </div>
      ) : null}

      {!loading && !error && data?.length === 0 ? (
        <div className="mt-10">
          <Empty className="min-h-64 border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <CalendarDaysIcon aria-hidden="true" />
              </EmptyMedia>
              <EmptyTitle>暂无日程</EmptyTitle>
              <EmptyDescription>
                当前没有已公布的演出安排。
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </div>
      ) : null}

      {!loading && !error && data?.length ? (
        <>
          <div className="mt-8 flex flex-wrap gap-2">
            <Button
              type="button"
              variant={selectedYear === null ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedYear(null)}
            >
              全部
            </Button>
            {years.map((year) => (
              <Button
                key={year}
                type="button"
                variant={selectedYear === year ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedYear(year)}
              >
                {year}
              </Button>
            ))}
          </div>

          <section className="mt-6 space-y-4" aria-label="日程列表">
            {filtered.length === 0 ? (
              <Empty className="min-h-48 border">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <CalendarDaysIcon aria-hidden="true" />
                  </EmptyMedia>
                  <EmptyTitle>该年份暂无日程</EmptyTitle>
                  <EmptyDescription>
                    {selectedYear} 年没有已记录的演出安排。
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              filtered.map((event, index) => (
                <LiveCard key={`${event.year}-${event.month}-${event.day}-${index}`} event={event} />
              ))
            )}
          </section>
        </>
      ) : null}
    </main>
  )
}
