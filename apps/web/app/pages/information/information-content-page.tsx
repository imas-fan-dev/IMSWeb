import { useRequest } from "alova/client"
import { ArrowLeftIcon, CalendarDaysIcon, LoaderCircleIcon } from "lucide-react"
import { useParams } from "react-router"

import { NavigationLink } from "~/components/navigation/navigation-link"
import { PageShell } from "~/components/shared/page-shell"
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert"
import { getHomeInformationDetail, isApiError } from "~/lib/api"
import { IS_APP_TARGET } from "~/lib/app-target"
import { InformationDocumentFrame } from "~/pages/information/components/information-document-frame"

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
      <PageShell
        width="read"
        className="flex min-h-48 items-center justify-center"
      >
        <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
          <LoaderCircleIcon
            className="size-4 animate-spin"
            aria-hidden="true"
          />
          正在加载活动内容
        </span>
      </PageShell>
    )
  }

  if (error || !data) {
    return (
      <PageShell width="read">
        <Alert>
          <CalendarDaysIcon aria-hidden="true" />
          <AlertTitle>活动内容无法打开</AlertTitle>
          <AlertDescription>
            {isApiError(error) ? error.message : "活动内容不存在或已下线。"}
          </AlertDescription>
        </Alert>
        {!IS_APP_TARGET ? (
          <NavigationLink
            to="/"
            className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
          >
            <ArrowLeftIcon className="size-4" aria-hidden="true" />
            返回首页
          </NavigationLink>
        ) : null}
      </PageShell>
    )
  }

  return (
    <PageShell width="default">
      <header className="border-b bg-muted/20 pb-6 sm:pb-8">
        {!IS_APP_TARGET ? (
          <NavigationLink
            to="/"
            className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
          >
            <ArrowLeftIcon className="size-4" aria-hidden="true" />
            返回首页
          </NavigationLink>
        ) : null}
        <p
          className={
            IS_APP_TARGET
              ? "text-xs font-semibold text-primary"
              : "mt-7 text-xs font-semibold text-primary"
          }
        >
          {data.card.category === "activity" ? "活动资讯" : "同人活动"}
        </p>
        <h1
          className={
            IS_APP_TARGET
              ? "mt-2 text-2xl font-semibold wrap-anywhere"
              : "mt-2 text-2xl font-semibold wrap-anywhere sm:text-3xl"
          }
        >
          {data.card.title}
        </h1>
      </header>
      <div className="mt-6 min-w-0 sm:mt-8">
        <InformationDocumentFrame
          contentId={data.card.id}
          title={data.card.title}
        />
      </div>
    </PageShell>
  )
}
