import {
  ArrowLeftIcon,
  Building2Icon,
  EyeIcon,
  LayoutGridIcon,
  ListIcon,
  MapPinIcon,
  RefreshCwIcon,
} from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Link, useParams } from "react-router"

import { SeriesAccentStrip } from "~/components/shared/series-accent-strip"
import { Badge } from "~/components/ui/badge"
import { Button, buttonVariants } from "~/components/ui/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "~/components/ui/empty"
import { Skeleton } from "~/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs"
import {
  getFudabaOffice,
  getFudabaSeries,
  isApiError,
  type FudabaOfficeDetail,
  type FudabaSeries,
} from "~/lib/api"
import { cn } from "~/lib/utils"
import {
  ExchangeCard,
  PlacedCardWall,
  SeriesBadge,
} from "./exchange-components"

type DetailPhase = "loading" | "ready" | "closed" | "missing" | "error"

type DetailState = {
  phase: DetailPhase
  office: FudabaOfficeDetail | null
  series: FudabaSeries[]
  error: string | null
}

const initialState: DetailState = {
  phase: "loading",
  office: null,
  series: [],
  error: null,
}

function detailFailure(error: unknown): Pick<DetailState, "phase" | "error"> {
  if (isApiError(error) && error.status === 404) {
    return error.payload === "Not Found"
      ? { phase: "closed", error: null }
      : { phase: "missing", error: null }
  }
  if (isApiError(error) && (error.status === 401 || error.status === 403)) {
    return {
      phase: "error",
      error: "平台帐号会话无法验证，请刷新登录状态后重试。",
    }
  }
  return {
    phase: "error",
    error: error instanceof Error ? error.message : "事务所暂时无法加载",
  }
}

export function meta() {
  return [
    { title: "交换事务所 | IMSWeb" },
    {
      name: "description",
      content: "浏览制作人名片交换事务所与公开名片墙。",
    },
  ]
}

export default function CommunityOfficePage() {
  const { officeSlug } = useParams()
  const [state, setState] = useState<DetailState>(initialState)
  const requestGeneration = useRef(0)

  const loadOffice = useCallback(async () => {
    if (!officeSlug) {
      setState({ ...initialState, phase: "missing" })
      return
    }
    const generation = ++requestGeneration.current
    setState((current) => ({ ...current, phase: "loading", error: null }))
    try {
      const [officeResult, seriesResult] = await Promise.allSettled([
        getFudabaOffice(officeSlug).send(),
        getFudabaSeries().send(),
      ])
      if (requestGeneration.current !== generation) return
      if (officeResult.status === "rejected") throw officeResult.reason
      setState({
        phase: "ready",
        office: officeResult.value,
        series:
          seriesResult.status === "fulfilled" ? seriesResult.value.items : [],
        error: null,
      })
    } catch (error) {
      if (requestGeneration.current !== generation) return
      setState((current) => ({ ...current, ...detailFailure(error) }))
    }
  }, [officeSlug])

  useEffect(() => {
    void loadOffice()
    return () => {
      requestGeneration.current += 1
    }
  }, [loadOffice])

  const seriesMap = useMemo(
    () => new Map(state.series.map((item) => [item.code, item])),
    [state.series]
  )

  if (state.phase === "loading") {
    return (
      <main
        id="main-content"
        className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8"
      >
        <Skeleton className="h-6 w-28" />
        <Skeleton className="mt-6 aspect-16/5 w-full" />
        <Skeleton className="mt-8 h-12 w-2/3" />
        <Skeleton className="mt-8 min-h-96 w-full" />
      </main>
    )
  }

  if (state.phase !== "ready" || !state.office) {
    let title = "事务所暂时无法加载"
    let description = state.error || "请稍后重新加载。"
    if (state.phase === "closed") {
      title = "社区交换区尚未开放"
      description = "事务所完成公开审核后会在这里显示。"
    } else if (state.phase === "missing") {
      title = "未找到这个事务所"
      description = "链接可能已失效，或者事务所已停止公开。"
    }

    return (
      <main
        id="main-content"
        className="mx-auto w-full max-w-5xl px-4 py-12 sm:px-6 lg:px-8"
      >
        <Empty className="min-h-96 border-y">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Building2Icon aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>{title}</EmptyTitle>
            <EmptyDescription>{description}</EmptyDescription>
          </EmptyHeader>
          <div className="flex flex-wrap justify-center gap-2">
            {state.phase === "error" ? (
              <Button type="button" onClick={() => void loadOffice()}>
                <RefreshCwIcon aria-hidden="true" />
                重新加载
              </Button>
            ) : null}
            <Link
              to="/community/exchange"
              className={buttonVariants({ variant: "outline" })}
            >
              返回事务所列表
            </Link>
          </div>
        </Empty>
      </main>
    )
  }

  const office = state.office

  return (
    <main id="main-content">
      <div className="mx-auto w-full max-w-7xl px-4 pt-6 sm:px-6 lg:px-8">
        <Link
          to="/community/exchange"
          className={buttonVariants({ variant: "ghost", size: "sm" })}
        >
          <ArrowLeftIcon aria-hidden="true" />
          返回事务所列表
        </Link>
      </div>

      <section className="mt-4 border-y bg-background">
        <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
          {office.coverUrl ? (
            <div className="aspect-16/5 max-h-96 min-h-48 overflow-hidden border-x bg-muted">
              <img
                src={office.coverUrl}
                alt={`${office.name}封面`}
                className="size-full object-cover"
              />
            </div>
          ) : (
            <div className="relative flex aspect-16/5 max-h-96 min-h-48 items-center justify-center overflow-hidden border-x bg-muted/50">
              <SeriesAccentStrip className="absolute inset-x-0 top-0 h-1" />
              <Building2Icon
                className="size-12 text-muted-foreground/60"
                aria-hidden="true"
              />
            </div>
          )}
        </div>
      </section>

      <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <header className="border-b pb-8">
          <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-start">
            <div className="max-w-3xl min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  variant="secondary"
                  className={cn(
                    office.isOpen
                      ? "bg-success/20 text-success-foreground"
                      : "text-muted-foreground"
                  )}
                >
                  {office.isOpen ? "开放交换" : "暂未开放"}
                </Badge>
                {office.seriesCodes.map((code) => (
                  <SeriesBadge key={code} code={code} series={seriesMap} />
                ))}
              </div>
              <h1 className="mt-4 text-3xl font-semibold text-balance">
                {office.name}
              </h1>
              <p className="mt-4 max-w-2xl leading-7 text-muted-foreground">
                {office.intro || "事务所暂未填写介绍。"}
              </p>
            </div>
            <dl className="grid min-w-64 grid-cols-2 gap-x-6 gap-y-3 border-y py-4 text-sm lg:border-y-0 lg:border-l lg:py-1 lg:pl-6">
              <div>
                <dt className="flex items-center gap-1.5 text-muted-foreground">
                  <MapPinIcon className="size-3.5" aria-hidden="true" />
                  城市
                </dt>
                <dd className="mt-1 font-medium">{office.city}</dd>
              </div>
              <div>
                <dt className="flex items-center gap-1.5 text-muted-foreground">
                  <EyeIcon className="size-3.5" aria-hidden="true" />
                  访问
                </dt>
                <dd className="mt-1 font-medium">
                  {office.visitorCount.toLocaleString("zh-CN")}
                </dd>
              </div>
            </dl>
          </div>
        </header>

        <section className="pt-8" aria-labelledby="office-card-wall-title">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 id="office-card-wall-title" className="text-xl font-semibold">
                事务所名片墙
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {office.cards.length} 张公开名片
              </p>
            </div>
          </div>

          {office.cards.length ? (
            <Tabs defaultValue="wall" className="mt-5">
              <TabsList aria-label="名片墙视图">
                <TabsTrigger value="wall">
                  <LayoutGridIcon aria-hidden="true" />
                  墙面
                </TabsTrigger>
                <TabsTrigger value="list">
                  <ListIcon aria-hidden="true" />
                  列表
                </TabsTrigger>
              </TabsList>
              <TabsContent value="wall" className="mt-3">
                <PlacedCardWall cards={office.cards} />
              </TabsContent>
              <TabsContent value="list" className="mt-3">
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {office.cards.map((card) => (
                    <ExchangeCard
                      key={card.id}
                      card={card}
                      series={seriesMap}
                    />
                  ))}
                </div>
              </TabsContent>
            </Tabs>
          ) : (
            <Empty className="mt-5 min-h-64 border-y">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <LayoutGridIcon aria-hidden="true" />
                </EmptyMedia>
                <EmptyTitle>名片墙还是空的</EmptyTitle>
                <EmptyDescription>
                  已审核并放置到事务所的名片会显示在这里。
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </section>
      </div>
    </main>
  )
}
