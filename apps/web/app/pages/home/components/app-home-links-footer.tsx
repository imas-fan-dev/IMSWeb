import { RefreshCwIcon } from "lucide-react"

import { HomepageCompactLinkList } from "~/components/homepage/homepage-links"
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert"
import { Button } from "~/components/ui/button"
import { Skeleton } from "~/components/ui/skeleton"
import { useHomepageLinks } from "../hooks/use-homepage-links"

export function AppHomeLinksFooter() {
  const { data, loading, error, retry } = useHomepageLinks()
  const groups = [
    {
      id: "app-home-friends",
      title: "友情链接",
      items: data.sections.friend,
    },
    {
      id: "app-home-support",
      title: "网站支持",
      items: data.sections.support,
    },
  ].filter((group) => group.items.length > 0)

  return (
    <section className="border-t" aria-labelledby="app-home-links-heading">
      <div className="mx-auto w-full max-w-7xl px-(--app-safe-inline) py-6">
        <h2 id="app-home-links-heading" className="text-base font-semibold">
          社区与支持
        </h2>
        {loading ? (
          <div
            className="mt-4 grid grid-cols-2 gap-x-3 border-y"
            role="status"
            aria-label="正在加载社区与支持链接"
          >
            {[0, 1, 2].map((item) => (
              <Skeleton
                key={item}
                className="h-24 w-full border-b nth-last-[-n+2]:border-b-0"
              />
            ))}
          </div>
        ) : error ? (
          <Alert className="mt-4">
            <AlertTitle>社区与支持链接暂时不可用</AlertTitle>
            <AlertDescription>可以重新获取链接列表。</AlertDescription>
            <div className="col-start-2 mt-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => void retry()}
              >
                <RefreshCwIcon aria-hidden="true" />
                重试
              </Button>
            </div>
          </Alert>
        ) : groups.length ? (
          <div className="mt-4 space-y-5">
            {groups.map((group) => (
              <div key={group.id}>
                <h3
                  id={`${group.id}-heading`}
                  className="mb-2 text-xs font-semibold text-muted-foreground"
                >
                  {group.title}
                </h3>
                <HomepageCompactLinkList
                  items={group.items}
                  labelledBy={`${group.id}-heading`}
                />
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-4 border-y py-5 text-sm text-muted-foreground">
            当前没有友情链接或网站支持信息。
          </p>
        )}
      </div>
    </section>
  )
}
