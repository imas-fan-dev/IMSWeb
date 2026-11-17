import { useRequest } from "alova/client"
import { HistoryIcon, MapPinIcon } from "lucide-react"
import { useState } from "react"

import { NavigationLink } from "~/components/navigation/navigation-link"
import { PageShell } from "~/components/shared/page-shell"
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert"
import { Button } from "~/components/ui/button"
import { Skeleton } from "~/components/ui/skeleton"
import { getEditorialChroniclePage, type EditorialArticle } from "~/lib/api"
import { IS_APP_TARGET } from "~/lib/app-target"

export function meta() {
  return [{ title: "活动编年史 | IMSWeb" }]
}

interface ChroniclePage {
  items: EditorialArticle[]
  pageInfo: { hasNextPage: boolean; nextCursor: string | null }
}

const EMPTY_PAGE: ChroniclePage = {
  items: [],
  pageInfo: { hasNextPage: false, nextCursor: null },
}

const LANES = [
  ["official", "官方记录"],
  ["community", "民间记录"],
] as const

function formatDate(item: EditorialArticle) {
  const value = item.occurred_on
  if (!value) return "日期待补充"
  if (item.date_precision === "year") return value.slice(0, 4)
  if (item.date_precision === "month") return value.slice(0, 7)
  return value
}

export default function ChronicleIndexPage() {
  const { data, loading, error, onError } = useRequest(
    getEditorialChroniclePage(),
    { initialData: EMPTY_PAGE }
  )
  onError(() => undefined)
  const [loadedPage, setLoadedPage] = useState<ChroniclePage | null>(null)
  const page = loadedPage ?? data ?? EMPTY_PAGE
  const items = page.items
  // 时间轴从左到右由远及近，接口按倒序返回，这里翻回来再分泳道。
  const older = items.slice().reverse()
  const lanes = {
    official: older.filter((item) => item.source_type === "official"),
    community: older.filter((item) => item.source_type === "community"),
  }

  async function loadEarlier() {
    if (!page.pageInfo.nextCursor) return
    const next = await getEditorialChroniclePage(
      24,
      page.pageInfo.nextCursor
    ).send()
    const merged = [
      ...items,
      ...next.items.filter(
        (item) =>
          !items.some((current) => current.article_id === item.article_id)
      ),
    ]
    setLoadedPage({ items: merged, pageInfo: next.pageInfo })
  }

  return (
    <PageShell width="wide">
      <div className="max-w-3xl">
        {!IS_APP_TARGET ? (
          <p className="text-sm font-semibold tracking-[0.2em] text-primary uppercase">
            Community archive
          </p>
        ) : null}
        <h1
          className={
            IS_APP_TARGET
              ? "text-2xl font-semibold tracking-tight"
              : "mt-3 text-4xl font-semibold tracking-tight"
          }
        >
          活动编年史
        </h1>
        <p
          className={
            IS_APP_TARGET
              ? "mt-2 text-sm/6 text-muted-foreground"
              : "mt-4 text-base/7 text-muted-foreground"
          }
        >
          从左到右回看圈内发生过的官方与同好活动，时间轴节点进入完整记录。
        </p>
      </div>

      {loading ? (
        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
      ) : null}

      {error ? (
        <Alert className="mt-10" variant="destructive">
          <HistoryIcon />
          <AlertTitle>暂时无法读取编年史</AlertTitle>
          <AlertDescription>请稍后刷新页面重试。</AlertDescription>
        </Alert>
      ) : null}

      {!loading && !error ? (
        <section
          className="mt-10 overflow-x-auto rounded-xl border bg-muted/10 p-4"
          aria-label="官方与民间活动时间轴"
        >
          <div className="min-w-200 space-y-8">
            {LANES.map(([lane, label]) => (
              <div
                key={lane}
                className="grid grid-cols-[7rem_minmax(0,1fr)] gap-4"
              >
                <div className="pt-5 text-sm font-semibold text-muted-foreground">
                  {label}
                </div>
                <div className="relative grid min-h-36 auto-cols-[15rem] grid-flow-col gap-4 border-t pt-5">
                  {lanes[lane].map((item) => (
                    <NavigationLink
                      key={item.article_id}
                      href={`/chronicle/${item.article_id}`}
                      className="group rounded-lg border bg-background p-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                    >
                      <span className="text-xs text-primary">
                        {formatDate(item)}
                      </span>
                      <h2 className="mt-2 line-clamp-2 font-semibold wrap-anywhere">
                        {item.title}
                      </h2>
                      {item.location ? (
                        <span className="mt-3 flex items-center gap-1 text-xs wrap-anywhere text-muted-foreground">
                          <MapPinIcon className="size-3" />
                          {item.location}
                        </span>
                      ) : null}
                    </NavigationLink>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {!loading && !error && !items.length ? (
        <div className="mt-10 flex min-h-48 items-center justify-center border text-muted-foreground">
          尚无公开活动记录
        </div>
      ) : null}

      {page.pageInfo.hasNextPage ? (
        <div className="mt-5 flex justify-center">
          <Button variant="outline" onClick={() => void loadEarlier()}>
            加载更早记录
          </Button>
        </div>
      ) : null}
    </PageShell>
  )
}
