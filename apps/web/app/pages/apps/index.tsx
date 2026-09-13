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
import {
  coreResourceLinks,
  groupAppsDirectoryLinks,
} from "./apps-directory-model"

export function meta() {
  return [
    { title: "资料 | IMSWeb" },
    {
      name: "description",
      content: "查阅 IMSWeb Wiki、剧情与其他资料入口。",
    },
  ]
}

export function AppsDirectory() {
  const { data, loading, error, retry } = useHomepageLinks()
  const items = data.sections.navigation
  const { resources, extensions } = groupAppsDirectoryLinks(items)
  const visibleDynamicCount = resources.length + extensions.length

  return (
    <PageShell width="wide" className="space-y-8">
      <header>
        <p className="text-xs font-semibold text-primary">RESOURCE DIRECTORY</p>
        <h1
          id="apps-directory-heading"
          className="mt-1.5 text-xl font-semibold"
        >
          资料
        </h1>
        <p className="mt-2 text-sm/6 text-muted-foreground">
          查阅站内 Wiki、剧情与其他资料工具。
        </p>
      </header>

      <section aria-labelledby="core-resources-heading">
        <h2 id="core-resources-heading" className="mb-4 text-sm font-medium">
          核心资料
        </h2>
        <HomepageLinkGrid items={coreResourceLinks} />
      </section>

      <section aria-labelledby="additional-resources-heading">
        <div className="mb-4 flex min-h-6 items-end justify-between gap-4">
          <h2 id="additional-resources-heading" className="text-sm font-medium">
            更多入口
          </h2>
          {!loading && !error && visibleDynamicCount ? (
            <p className="shrink-0 text-xs text-muted-foreground">
              共 {visibleDynamicCount} 项
            </p>
          ) : null}
        </div>

        {loading ? (
          <HomepageLinkGridSkeleton count={4} />
        ) : error ? (
          <Alert>
            <LayoutGridIcon aria-hidden="true" />
            <AlertTitle>更多入口暂时无法加载</AlertTitle>
            <AlertDescription>
              核心资料仍可使用，请检查网络连接后重试。
            </AlertDescription>
            <div className="col-start-2 mt-3">
              <Button type="button" onClick={() => void retry()}>
                <RefreshCwIcon aria-hidden="true" />
                重试
              </Button>
            </div>
          </Alert>
        ) : visibleDynamicCount ? (
          <div className="space-y-6">
            {resources.length ? <HomepageLinkGrid items={resources} /> : null}
            {extensions.length ? (
              <div>
                <h3 className="mb-3 text-xs font-medium text-muted-foreground">
                  扩展入口
                </h3>
                <HomepageLinkGrid items={extensions} />
              </div>
            ) : null}
          </div>
        ) : (
          <div className="flex min-h-40 flex-col items-center justify-center border-y text-center">
            <LayoutGridIcon
              aria-hidden="true"
              className="size-6 text-muted-foreground"
            />
            <p className="mt-3 font-medium">当前没有更多入口</p>
            <p className="mt-1 text-sm text-muted-foreground">
              新资料发布后会显示在这里。
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
