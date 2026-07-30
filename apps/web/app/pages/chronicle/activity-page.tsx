import { useRequest } from "alova/client"
import {
  ArrowLeftIcon,
  CalendarDaysIcon,
  HistoryIcon,
  MapPinIcon,
} from "lucide-react"
import { Link } from "react-router"

import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert"
import { Badge } from "~/components/ui/badge"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "~/components/ui/empty"
import { Skeleton } from "~/components/ui/skeleton"
import { getChronicleActivity } from "~/lib/api"
import type { Route } from "./+types/activity-page"

export function meta() {
  return [{ title: "活动纪年 | IMSWeb" }]
}

function ActivityLoading() {
  return (
    <div className="space-y-6" aria-label="正在加载活动详情">
      <Skeleton className="h-6 w-24" />
      <Skeleton className="h-10 w-2/3" />
      <div className="flex gap-2">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-6 w-24" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="aspect-4/3 rounded-lg" />
        ))}
      </div>
    </div>
  )
}

export default function ChronicleActivityPage({
  params,
}: Route.ComponentProps) {
  const { activityId } = params
  const { data, loading, error } = useRequest(() =>
    getChronicleActivity(activityId)
  )

  return (
    <main id="main-content" className="mx-auto w-full max-w-6xl px-6 py-16">
      {loading ? <ActivityLoading /> : null}

      {error ? (
        <Alert variant="destructive">
          <HistoryIcon aria-hidden="true" />
          <AlertTitle>暂时无法读取活动详情</AlertTitle>
          <AlertDescription>请稍后刷新页面重试。</AlertDescription>
        </Alert>
      ) : null}

      {!loading && !error && !data ? (
        <Empty className="min-h-64 border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <HistoryIcon aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>未找到该活动</EmptyTitle>
            <EmptyDescription>该活动编号不存在或尚未收录。</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : null}

      {!loading && !error && data ? (
        <>
          <Link
            to="/chronicle"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeftIcon className="size-4" aria-hidden="true" />
            返回编年史
          </Link>

          <h1 className="mt-4 text-3xl font-semibold tracking-tight">
            {data.title}
          </h1>

          <div className="mt-4 flex flex-wrap gap-2">
            {data.date ? (
              <Badge variant="secondary" className="gap-1.5">
                <CalendarDaysIcon className="size-3.5" aria-hidden="true" />
                {data.date}
              </Badge>
            ) : null}
            {data.location ? (
              <Badge variant="secondary" className="gap-1.5">
                <MapPinIcon className="size-3.5" aria-hidden="true" />
                {data.location}
              </Badge>
            ) : null}
          </div>

          {data.images.length > 0 ? (
            <section className="mt-10" aria-label="活动照片">
              <h2 className="mb-4 text-lg font-semibold">
                活动照片（{data.images.length}）
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {data.images.map((url, index) => (
                  <a
                    key={index}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group block overflow-hidden rounded-lg border bg-muted/30 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                  >
                    <img
                      src={url}
                      alt={`${data.title} — 照片 ${index + 1}`}
                      className="aspect-4/3 w-full object-cover transition-transform group-hover:scale-105"
                      loading="lazy"
                    />
                  </a>
                ))}
              </div>
            </section>
          ) : (
            <Empty className="mt-10 min-h-48 border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <HistoryIcon aria-hidden="true" />
                </EmptyMedia>
                <EmptyTitle>暂无照片</EmptyTitle>
                <EmptyDescription>
                  该活动还没有审核通过的照片。
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </>
      ) : null}
    </main>
  )
}
