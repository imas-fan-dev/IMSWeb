import { useRequest } from "alova/client"
import { ArrowLeftIcon, CalendarDaysIcon, LoaderCircleIcon } from "lucide-react"
import { Link, useParams } from "react-router"

import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert"
import { InformationDocumentFrame } from "~/pages/information/components/information-document-frame"
import { getHomeInformationDetail, isApiError } from "~/lib/api"

export function meta() {
  return [{ title: "活动内容 | IMSWeb" }]
}

export default function InformationContent() {
  const { contentId = "" } = useParams()
  const { data, loading, error, onError } = useRequest(
    getHomeInformationDetail(contentId),
    { immediate: Boolean(contentId) }
  )
  onError(() => undefined)

  if (loading) {
    return (
      <main
        id="main-content"
        className="flex min-h-[60svh] items-center justify-center"
      >
        <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
          <LoaderCircleIcon
            className="size-4 animate-spin"
            aria-hidden="true"
          />
          正在加载活动内容
        </span>
      </main>
    )
  }

  if (error || !data) {
    return (
      <main
        id="main-content"
        className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6"
      >
        <Alert>
          <CalendarDaysIcon aria-hidden="true" />
          <AlertTitle>活动内容无法打开</AlertTitle>
          <AlertDescription>
            {isApiError(error) ? error.message : "活动内容不存在或已下线。"}
          </AlertDescription>
        </Alert>
        <Link
          to="/"
          className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
        >
          <ArrowLeftIcon className="size-4" aria-hidden="true" />
          返回首页
        </Link>
      </main>
    )
  }

  return (
    <main id="main-content">
      <header className="border-b bg-muted/20">
        <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
          >
            <ArrowLeftIcon className="size-4" aria-hidden="true" />
            返回首页
          </Link>
          <p className="mt-7 text-xs font-semibold text-primary">
            {data.card.category === "activity" ? "活动资讯" : "同人活动"}
          </p>
          <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">
            {data.card.title}
          </h1>
        </div>
      </header>
      <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <InformationDocumentFrame
          contentId={data.card.id}
          title={data.card.title}
        />
      </div>
    </main>
  )
}
