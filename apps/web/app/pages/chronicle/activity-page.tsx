import { useRequest } from "alova/client"
import {
  ArrowLeftIcon,
  CalendarDaysIcon,
  HistoryIcon,
  MapPinIcon,
} from "lucide-react"

import { NavigationLink } from "~/components/navigation/navigation-link"
import { PageShell } from "~/components/shared/page-shell"
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
import { getEditorialChronicle } from "~/lib/api"
import type { Route } from "./+types/activity-page"

export function meta() {
  return [{ title: "活动纪年 | IMSWeb" }]
}

function formatDate(value: string, precision?: string | null) {
  if (precision === "year") return value.slice(0, 4)
  if (precision === "month") return value.slice(0, 7)
  return value
}

export default function ChronicleActivityPage({
  params,
}: Route.ComponentProps) {
  const { data, loading, error, onError } = useRequest(() =>
    getEditorialChronicle(params.activityId)
  )
  onError(() => undefined)

  return (
    <PageShell>
      {loading ? (
        <div className="space-y-5">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-12 w-2/3" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : null}

      {error ? (
        <Alert variant="destructive">
          <HistoryIcon />
          <AlertTitle>无法读取编年史详情</AlertTitle>
          <AlertDescription>该记录不存在或尚未公开。</AlertDescription>
        </Alert>
      ) : null}

      {!loading && !error && !data ? (
        <Empty className="min-h-64 border">
          <EmptyHeader>
            <EmptyMedia />
            <EmptyTitle>未找到记录</EmptyTitle>
            <EmptyDescription>该记录不存在或尚未公开。</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : null}

      {data ? (
        <article>
          <NavigationLink
            href="/chronicle"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeftIcon className="size-4" />
            返回编年史
          </NavigationLink>
          <div className="mt-6 flex flex-wrap gap-2">
            <Badge>{data.source_type === "official" ? "官方" : "民间"}</Badge>
            {data.occurred_on ? (
              <Badge variant="secondary">
                <CalendarDaysIcon className="mr-1 size-3.5" />
                {formatDate(data.occurred_on, data.date_precision)}
              </Badge>
            ) : null}
            {data.location ? (
              <Badge
                variant="secondary"
                className="h-auto max-w-full whitespace-normal"
              >
                <MapPinIcon className="mr-1 size-3.5" />
                <span className="wrap-anywhere">{data.location}</span>
              </Badge>
            ) : null}
          </div>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight wrap-anywhere sm:text-4xl">
            {data.title}
          </h1>
          {data.cover_url ? (
            <img
              src={data.cover_url}
              alt=""
              className="mt-8 max-h-120 w-full rounded-xl border object-cover"
            />
          ) : null}
          {data.body_html ? (
            // 正文在服务端已经过节点白名单与 sanitize-html 两道处理。
            <div
              className="prose prose-neutral dark:prose-invert mt-10 max-w-none"
              dangerouslySetInnerHTML={{ __html: data.body_html }}
            />
          ) : (
            <Empty className="mt-10 border">
              <EmptyHeader>
                <EmptyTitle>暂无正文</EmptyTitle>
                <EmptyDescription>
                  管理员尚未补充这条记录的正文。
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </article>
      ) : null}
    </PageShell>
  )
}
