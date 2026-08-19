import { useRequest } from "alova/client"
import { ArrowLeftIcon, CalendarDaysIcon, ContactRoundIcon, ExternalLinkIcon, MapPinIcon, UserRoundIcon } from "lucide-react"
import { Link } from "react-router"

import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert"
import { Badge } from "~/components/ui/badge"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "~/components/ui/empty"
import { Skeleton } from "~/components/ui/skeleton"
import { getEditorialEvent } from "~/lib/api"
import type { Route } from "./+types/event-detail-page"

export function meta() { return [{ title: "社区动态 | IMSWeb" }] }

const eventStatusLabels = {
  scheduled: "已排期",
  ongoing: "进行中",
  ended: "已结束",
  cancelled: "已取消",
} as const

function formatEventDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)
}

export default function EventDetailPage({ params }: Route.ComponentProps) {
  const { data, loading, error } = useRequest(() => getEditorialEvent(params.eventId))
  const hasEventDetails = Boolean(data && (data.name || data.start_at || data.venue_name || data.address || data.contact || data.registration_url || data.source_url))
  return (
    <main id="main-content" className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 sm:py-12">
      {loading ? <div className="mx-auto max-w-4xl space-y-6"><Skeleton className="h-8 w-32" /><Skeleton className="h-12 w-3/4" /><Skeleton className="h-64 w-full rounded-xl" /></div> : null}
      {error ? <Alert variant="destructive"><AlertTitle>无法读取社区动态</AlertTitle><AlertDescription>该帖子不存在或尚未公开。</AlertDescription></Alert> : null}
      {!loading && !error && !data ? <Empty className="min-h-64 border"><EmptyHeader><EmptyMedia /><EmptyTitle>未找到社区动态</EmptyTitle><EmptyDescription>该帖子不存在或尚未公开。</EmptyDescription></EmptyHeader></Empty> : null}
      {data ? (
        <article className="mx-auto max-w-6xl">
          <Link to="/events" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"><ArrowLeftIcon className="size-4" />返回社区动态</Link>

          <header className="mt-5 overflow-hidden rounded-2xl border bg-muted/30">
            <div className="px-5 py-7 sm:px-9 sm:py-10">
              <div className="flex flex-wrap gap-2">
                <Badge>{data.kind === "event" ? "具体活动" : "社区动态"}</Badge>
                {data.kind === "event" && data.event_status ? <Badge variant="secondary">{eventStatusLabels[data.event_status as keyof typeof eventStatusLabels] ?? data.event_status}</Badge> : null}
              </div>
              <h1 className="mt-4 max-w-4xl text-3xl font-semibold tracking-tight sm:text-5xl">{data.title}</h1>
              {data.summary ? <p className="mt-5 max-w-3xl text-base/7 text-muted-foreground sm:text-lg/8">{data.summary}</p> : null}
              {data.published_at ? <p className="mt-5 text-sm text-muted-foreground">发布于 {formatEventDate(data.published_at)}</p> : null}
            </div>
            {data.image_url || data.cover_url ? <img src={data.cover_url ?? data.image_url ?? undefined} alt="" className="aspect-[16/8] max-h-130 w-full border-t object-cover" /> : null}
          </header>

          <div className="mt-8 grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_18rem]">
            <section className="min-w-0">
              {data.body_html ? <div className="prose prose-neutral max-w-none prose-headings:scroll-mt-24 prose-headings:font-semibold prose-a:text-primary prose-a:no-underline hover:prose-a:underline prose-img:my-8 prose-img:w-full prose-img:rounded-xl prose-img:border prose-img:shadow-sm dark:prose-invert" dangerouslySetInnerHTML={{ __html: data.body_html }} /> : <Empty className="min-h-48 border bg-muted/20"><EmptyHeader><EmptyTitle>暂无更多介绍</EmptyTitle><EmptyDescription>管理员尚未补充正文内容。</EmptyDescription></EmptyHeader></Empty>}
            </section>

            {hasEventDetails ? (
              <aside className="rounded-2xl border bg-card p-5 shadow-sm lg:sticky lg:top-6">
                <h2 className="text-base font-semibold">{data.kind === "event" ? "活动信息" : "相关信息"}</h2>
                <dl className="mt-5 space-y-5 text-sm">
                  {data.name ? <div className="flex gap-3"><UserRoundIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" /><div><dt className="text-muted-foreground">主办方</dt><dd className="mt-1 font-medium">{data.name}</dd></div></div> : null}
                  {data.start_at ? <div className="flex gap-3"><CalendarDaysIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" /><div><dt className="text-muted-foreground">时间</dt><dd className="mt-1 font-medium">{formatEventDate(data.start_at)}{data.end_at ? <><br />至 {formatEventDate(data.end_at)}</> : null}</dd></div></div> : null}
                  {data.venue_name || data.address ? <div className="flex gap-3"><MapPinIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" /><div><dt className="text-muted-foreground">地点</dt><dd className="mt-1 font-medium">{[data.venue_name, data.address].filter(Boolean).join("，")}</dd></div></div> : null}
                  {data.contact ? <div className="flex gap-3"><ContactRoundIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" /><div><dt className="text-muted-foreground">联系方式</dt><dd className="mt-1 break-all font-medium">{data.contact}</dd></div></div> : null}
                </dl>
                {data.registration_url || data.source_url ? <div className="mt-6 space-y-2 border-t pt-5">{data.registration_url ? <a href={data.registration_url} target="_blank" rel="noreferrer" className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90">报名 / 查看链接<ExternalLinkIcon className="size-4" /></a> : null}{data.source_url ? <a href={data.source_url} target="_blank" rel="noreferrer" className="flex w-full items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors hover:bg-muted">查看原页面<ExternalLinkIcon className="size-4" /></a> : null}</div> : null}
              </aside>
            ) : null}
          </div>
        </article>
      ) : null}
    </main>
  )
}
