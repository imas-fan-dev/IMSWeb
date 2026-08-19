import { useRequest } from "alova/client"
import { HistoryIcon, LoaderCircleIcon, MapPinIcon } from "lucide-react"
import { Link } from "react-router"
import { useState } from "react"

import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert"
import { Button } from "~/components/ui/button"
import { Skeleton } from "~/components/ui/skeleton"
import { getEditorialChroniclePage, type EditorialArticle } from "~/lib/api"

export function meta() { return [{ title: "活动编年史 | IMSWeb" }] }

export default function ChronicleIndexPage() {
  const { data, loading, error } = useRequest(getEditorialChroniclePage())
  const [loadedPage, setLoadedPage] = useState<{ items: EditorialArticle[]; pageInfo: { hasNextPage: boolean; nextCursor: string | null } } | null>(null)
  const page = loadedPage ?? data ?? { items: [], pageInfo: { hasNextPage: false, nextCursor: null } }
  const items = page.items
  const older = items.slice().reverse()
  const lanes = { official: older.filter((item) => item.source_type === "official"), community: older.filter((item) => item.source_type === "community") }
  async function loadEarlier() {
    if (!page.pageInfo.nextCursor) return
    const next = await getEditorialChroniclePage(24, page.pageInfo.nextCursor).send()
    const merged = [...items, ...next.items.filter((item) => !items.some((current) => current.article_id === item.article_id))]
    setLoadedPage({ items: merged, pageInfo: next.pageInfo })
  }
  return <main id="main-content" className="mx-auto w-full max-w-7xl px-6 py-12 sm:py-16">
    <div className="max-w-3xl"><p className="text-sm font-semibold tracking-[0.2em] text-primary uppercase">Community archive</p><h1 className="mt-3 text-4xl font-semibold tracking-tight">活动编年史</h1><p className="mt-4 text-base/7 text-muted-foreground">从左到右回看圈内发生过的官方与同好活动，时间轴节点进入完整记录。</p></div>
    {loading ? <div className="mt-10 grid gap-4 sm:grid-cols-2"><Skeleton className="h-40" /><Skeleton className="h-40" /></div> : null}
    {error ? <Alert className="mt-10" variant="destructive"><HistoryIcon /><AlertTitle>暂时无法读取编年史</AlertTitle><AlertDescription>请稍后刷新页面重试。</AlertDescription></Alert> : null}
    {!loading && !error ? <section className="mt-10 overflow-x-auto rounded-xl border bg-muted/10 p-4" aria-label="官方与民间活动时间轴"><div className="min-w-200 space-y-8">{([['official', '官方记录'], ['community', '民间记录']] as const).map(([lane, label]) => <div key={lane} className="grid grid-cols-[7rem_minmax(0,1fr)] gap-4"><div className="pt-5 text-sm font-semibold text-muted-foreground">{label}</div><div className="relative grid min-h-36 grid-flow-col auto-cols-[15rem] gap-4 border-t pt-5">{lanes[lane].map((item) => <Link key={item.article_id} to={`/chronicle/${item.article_id}`} className="group rounded-lg border bg-background p-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"><span className="text-xs text-primary">{formatDate(item)}</span><h2 className="mt-2 line-clamp-2 font-semibold">{item.title}</h2>{item.location ? <span className="mt-3 flex items-center gap-1 text-xs text-muted-foreground"><MapPinIcon className="size-3" />{item.location}</span> : null}</Link>)}</div></div>)}</div></section> : null}
    {!loading && !error && !items.length ? <div className="mt-10 flex min-h-48 items-center justify-center border text-muted-foreground">尚无公开活动记录</div> : null}
    {page.pageInfo.hasNextPage ? <div className="mt-5 flex justify-center"><Button variant="outline" onClick={() => void loadEarlier()}><LoaderCircleIcon className="hidden" />加载更早记录</Button></div> : null}
  </main>
}

function formatDate(item: EditorialArticle) { const value = item.occurred_on; if (!value) return "日期待补充"; if (item.date_precision === "year") return value.slice(0, 4); if (item.date_precision === "month") return value.slice(0, 7); return value }
