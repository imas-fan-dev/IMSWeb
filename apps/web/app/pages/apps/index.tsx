import { LayoutGridIcon, RefreshCwIcon } from "lucide-react"

import {
  HomepageLinkGrid,
  HomepageLinkGridSkeleton,
} from "~/components/homepage/homepage-links"
import { PageShell } from "~/components/shared/page-shell"
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert"
import { Button } from "~/components/ui/button"
import {
  HomepageLinksProvider,
  useHomepageLinks,
} from "../home/hooks/use-homepage-links"

export function meta() {
  return [
    { title: "站内应用 | IMSWeb" },
    {
      name: "description",
      content: "浏览 IMSWeb 站内功能、资料与社区入口。",
    },
  ]
}

export function AppsDirectory() {
  const { data, loading, error, retry } = useHomepageLinks()
  const items = data.sections.navigation

  return (
    <PageShell width="wide" className="space-y-5">
      <section aria-labelledby="apps-directory-heading">
        <div className="mb-5 flex min-h-10 items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold text-primary">APP DIRECTORY</p>
            <h1
              id="apps-directory-heading"
              className="mt-1.5 text-xl font-semibold"
            >
              全部入口
            </h1>
          </div>
          {!loading && !error && items.length ? (
            <p className="shrink-0 text-xs text-muted-foreground">
              共 {items.length} 项
            </p>
          ) : null}
        </div>

        {loading ? (
          <HomepageLinkGridSkeleton />
        ) : error ? (
          <Alert>
            <LayoutGridIcon aria-hidden="true" />
            <AlertTitle>应用列表暂时无法加载</AlertTitle>
            <AlertDescription>请检查网络连接后重试。</AlertDescription>
            <div className="col-start-2 mt-3">
              <Button type="button" onClick={() => void retry()}>
                <RefreshCwIcon aria-hidden="true" />
                重试
              </Button>
            </div>
          </Alert>
        ) : items.length ? (
          <HomepageLinkGrid items={items} />
        ) : (
          <div className="flex min-h-40 flex-col items-center justify-center border-y text-center">
            <LayoutGridIcon
              aria-hidden="true"
              className="size-6 text-muted-foreground"
            />
            <p className="mt-3 font-medium">当前没有可用应用</p>
            <p className="mt-1 text-sm text-muted-foreground">
              新入口发布后会显示在这里。
            </p>
          </div>
        )}
      </section>
    </PageShell>
  )
}

export function AppsPage() {
  return (
    <HomepageLinksProvider>
      <AppsDirectory />
    </HomepageLinksProvider>
  )
}

export default AppsPage
