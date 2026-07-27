import { useRequest } from "alova/client"
import {
  ArrowLeftIcon,
  ExternalLinkIcon,
  GlobeIcon,
  PackageIcon,
} from "lucide-react"

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
import { getPublicSitePackage } from "~/shared/api"

function SiteDetailLoading() {
  return (
    <div className="space-y-6" aria-label="正在加载站点信息">
      <Skeleton className="h-6 w-24" />
      <Skeleton className="h-10 w-2/3" />
      <Skeleton className="h-5 w-full max-w-xl" />
      <div className="flex gap-2">
        <Skeleton className="h-6 w-24" />
        <Skeleton className="h-6 w-20" />
      </div>
    </div>
  )
}

function formatPublishedDate(timestamp: number) {
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
  }).format(new Date(timestamp))
}

export default function SiteDetailPage({
  siteSlug,
}: {
  siteSlug: string
}) {
  const { data, loading, error } = useRequest(() =>
    getPublicSitePackage(siteSlug)
  )

  return (
    <main
      id="main-content"
      className="mx-auto w-full max-w-4xl px-6 py-16"
    >
      {loading ? <SiteDetailLoading /> : null}

      {error ? (
        <Alert variant="destructive">
          <GlobeIcon aria-hidden="true" />
          <AlertTitle>无法加载站点信息</AlertTitle>
          <AlertDescription>请稍后刷新页面重试。</AlertDescription>
        </Alert>
      ) : null}

      {!loading && !error && !data ? (
        <Empty className="min-h-64 border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <GlobeIcon aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>站点包不存在</EmptyTitle>
            <EmptyDescription>
              该站点包尚未发布或不存在。
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : null}

      {!loading && !error && data ? (
        <>
          <a
            href="/works"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeftIcon className="size-4" aria-hidden="true" />
            返回作品中心
          </a>

          <h1 className="mt-4 text-3xl font-semibold tracking-tight">
            {data.title}
          </h1>

          <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">
            {data.description || "暂无简介。"}
          </p>

          <div className="mt-6 flex flex-wrap gap-2">
            <Badge variant="secondary" className="gap-1.5">
              <PackageIcon className="size-3.5" aria-hidden="true" />
              {`v${data.revisionNumber}`}
            </Badge>
            <Badge variant="secondary" className="gap-1.5">
              {formatPublishedDate(data.publishedAt)}
            </Badge>
          </div>

          <a
            href={data.siteUrl}
            className="mt-8 inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition-all hover:bg-primary/80 active:translate-y-px"
          >
            打开站点
            <ExternalLinkIcon className="size-4" aria-hidden="true" />
          </a>
        </>
      ) : null}
    </main>
  )
}
