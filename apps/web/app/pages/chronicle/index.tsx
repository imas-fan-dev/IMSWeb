import { useRequest } from "alova/client"
import {
  ArrowRightIcon,
  CalendarDaysIcon,
  HistoryIcon,
  MapPinIcon,
} from "lucide-react"

import { PageShell } from "~/components/shared/page-shell"
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "~/components/ui/empty"
import { Skeleton } from "~/components/ui/skeleton"
import { getChronicleActivities } from "~/lib/api"
import { IS_APP_TARGET } from "~/lib/app-target"
import { NavigationLink } from "~/components/navigation/navigation-link"

export function meta() {
  return [{ title: "活动编年史 | IMSWeb" }]
}

function ChronicleLoading() {
  return (
    <div className="grid gap-4 md:grid-cols-2" aria-label="正在加载活动编年史">
      {Array.from({ length: 4 }, (_, index) => (
        <Skeleton key={index} className="h-48 rounded-xl" />
      ))}
    </div>
  )
}

export default function ChronicleIndexPage() {
  const { data, loading, error, onError } = useRequest(getChronicleActivities())
  onError(() => undefined)

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
          由制作人共同整理的线下活动记录。进入活动页面可以浏览已审核照片，
          也可以提交你保存的现场影像。
        </p>
      </div>

      <section
        className={IS_APP_TARGET ? "mt-6" : "mt-10"}
        aria-label="活动列表"
      >
        {loading ? <ChronicleLoading /> : null}

        {error ? (
          <Alert variant="destructive">
            <HistoryIcon aria-hidden="true" />
            <AlertTitle>暂时无法读取编年史</AlertTitle>
            <AlertDescription>请稍后刷新页面重试。</AlertDescription>
          </Alert>
        ) : null}

        {!loading && !error && data?.length === 0 ? (
          <Empty className="min-h-64 border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <HistoryIcon aria-hidden="true" />
              </EmptyMedia>
              <EmptyTitle>尚无公开活动记录</EmptyTitle>
              <EmptyDescription>
                活动资料完成整理和审核后会显示在这里。
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : null}

        {!loading && !error && data?.length ? (
          <div className="grid gap-4 md:grid-cols-2">
            {data.map((activity) => (
              <NavigationLink
                key={activity.id}
                to={`/chronicle/${encodeURIComponent(activity.id)}`}
                className="group rounded-xl focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                <Card className="h-full transition-[box-shadow,transform] group-hover:-translate-y-0.5 group-hover:shadow-md">
                  {activity.cover ? (
                    <img
                      src={activity.cover}
                      alt=""
                      className="aspect-16/7 w-full object-cover"
                      loading="lazy"
                    />
                  ) : null}
                  <CardHeader className="min-w-0">
                    <CardTitle className="wrap-anywhere">
                      {activity.title}
                    </CardTitle>
                    <CardDescription className="wrap-anywhere">
                      活动编号 {activity.id}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="grid min-w-0 gap-2 text-sm text-muted-foreground">
                    <span className="inline-flex min-w-0 items-center gap-2 wrap-anywhere">
                      <CalendarDaysIcon
                        className="size-4 shrink-0"
                        aria-hidden="true"
                      />
                      {activity.date}
                    </span>
                    <span className="inline-flex min-w-0 items-center gap-2 wrap-anywhere">
                      <MapPinIcon
                        className="size-4 shrink-0"
                        aria-hidden="true"
                      />
                      {activity.location}
                    </span>
                  </CardContent>
                  <CardFooter className="mt-auto justify-between">
                    查看活动记录
                    <ArrowRightIcon
                      className="size-4 transition-transform group-hover:translate-x-0.5"
                      aria-hidden="true"
                    />
                  </CardFooter>
                </Card>
              </NavigationLink>
            ))}
          </div>
        ) : null}
      </section>
    </PageShell>
  )
}
