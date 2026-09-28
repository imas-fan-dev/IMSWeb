import { useRequest } from "alova/client"

import { CommunityPostDetail } from "~/components/editorial/community-post-detail"
import { PageShell } from "~/components/shared/page-shell"
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "~/components/ui/empty"
import { Skeleton } from "~/components/ui/skeleton"
import { getAdminCommunityPost } from "~/lib/api"
import type { Route } from "./+types/preview-page"

export function meta() {
  return [{ title: "文章预览 | IMSWeb" }]
}

export default function AdminEventPreviewPage({
  params,
}: Route.ComponentProps) {
  const { data, loading, error } = useRequest(() =>
    getAdminCommunityPost(Number(params.eventId))
  )

  return (
    <PageShell width="wide" className="py-8 sm:py-12">
      <p className="mb-5 text-sm text-muted-foreground">
        预览模式：展示最近一次保存的文章内容。
      </p>
      {loading ? (
        <div className="mx-auto max-w-4xl space-y-6">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-12 w-3/4" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      ) : null}
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>无法读取文章预览</AlertTitle>
          <AlertDescription>请返回编辑器保存草稿后再试。</AlertDescription>
        </Alert>
      ) : null}
      {!loading && !error && !data ? (
        <Empty className="min-h-64 border">
          <EmptyHeader>
            <EmptyMedia />
            <EmptyTitle>未找到文章</EmptyTitle>
            <EmptyDescription>请返回编辑器后重新保存草稿。</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : null}
      {data ? <CommunityPostDetail article={data} showBackLink /> : null}
    </PageShell>
  )
}
