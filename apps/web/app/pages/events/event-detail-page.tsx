import { useRequest } from "alova/client"

import { CommunityPostDetail } from "~/components/editorial/community-post-detail"
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "~/components/ui/empty"
import { Skeleton } from "~/components/ui/skeleton"
import { getEditorialEvent } from "~/lib/api"
import type { Route } from "./+types/event-detail-page"

export function meta() { return [{ title: "社区动态 | IMSWeb" }] }

export default function EventDetailPage({ params }: Route.ComponentProps) {
  const { data, loading, error } = useRequest(() => getEditorialEvent(params.eventId))
  return (
    <main id="main-content" className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 sm:py-12">
      {loading ? <div className="mx-auto max-w-4xl space-y-6"><Skeleton className="h-8 w-32" /><Skeleton className="h-12 w-3/4" /><Skeleton className="h-64 w-full rounded-xl" /></div> : null}
      {error ? <Alert variant="destructive"><AlertTitle>无法读取社区动态</AlertTitle><AlertDescription>该帖子不存在或尚未公开。</AlertDescription></Alert> : null}
      {!loading && !error && !data ? <Empty className="min-h-64 border"><EmptyHeader><EmptyMedia /><EmptyTitle>未找到社区动态</EmptyTitle><EmptyDescription>该帖子不存在或尚未公开。</EmptyDescription></EmptyHeader></Empty> : null}
      {data ? <CommunityPostDetail article={data} showBackLink /> : null}
    </main>
  )
}
