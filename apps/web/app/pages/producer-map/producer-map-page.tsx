import { useRequest } from "alova/client"
import {
  ExternalLinkIcon,
  ImageIcon,
  LoaderCircleIcon,
  RefreshCwIcon,
  SearchIcon,
  UsersRoundIcon,
  XIcon,
} from "lucide-react"
import { lazy, Suspense, useMemo, useState } from "react"

import { SeriesAccentStrip } from "~/components/shared/series-accent-strip"
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert"
import { Button } from "~/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog"
import {
  getProducerMapContent,
  getProducerMapGeometry,
  type ProducerMapCommunity,
  type ProducerMapRegion,
  type ProducerMapSeries,
} from "~/lib/api"

const chinaCommunityMapModule =
  import("~/pages/producer-map/components/china-community-map")
const ChinaCommunityMap = lazy(async () => {
  const module = await chinaCommunityMapModule
  return { default: module.ChinaCommunityMap }
})

const seriesBorder: Record<ProducerMapSeries, string> = {
  all: "border-t-foreground/25",
  "765": "border-t-franchise-765",
  cg: "border-t-franchise-cg",
  ml: "border-t-franchise-ml",
  sidem: "border-t-franchise-sidem",
  sc: "border-t-franchise-sc",
  gakuen: "border-t-franchise-gk",
}

type DialogImageLayout = "community" | "region"

function DialogImageViewport({
  src,
  alt,
  layout,
}: {
  src: string
  alt: string
  layout: DialogImageLayout
}) {
  const [state, setState] = useState<"loading" | "loaded" | "error">("loading")

  return (
    <div
      className={
        layout === "region"
          ? "relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-md bg-muted"
          : "relative flex h-[min(60svh,36rem)] min-h-64 w-full items-center justify-center overflow-hidden rounded-md border bg-muted"
      }
      data-image-state={state}
      aria-label={`${alt}加载区域`}
    >
      <img
        src={src}
        alt={alt}
        onLoad={() => setState("loaded")}
        onError={() => setState("error")}
        className={`max-h-full max-w-full object-contain transition-[opacity,transform] duration-300 ease-out motion-reduce:transition-none ${
          state === "loaded"
            ? "scale-100 opacity-100"
            : "scale-[0.985] opacity-0"
        }`}
      />
      <div
        className={`pointer-events-none absolute inset-0 flex items-center justify-center transition-opacity duration-200 motion-reduce:transition-none ${
          state === "loaded" ? "opacity-0" : "opacity-100"
        }`}
        aria-live="polite"
      >
        {state === "error" ? (
          <>
            <ImageIcon
              className="size-7 text-muted-foreground"
              aria-hidden="true"
            />
            <span className="sr-only">图片加载失败</span>
          </>
        ) : (
          <>
            <LoaderCircleIcon
              className="size-5 animate-spin text-muted-foreground"
              aria-hidden="true"
            />
            <span className="sr-only">正在加载图片</span>
          </>
        )}
      </div>
    </div>
  )
}

export function meta() {
  return [{ title: "制作人社群地图 | IMSWeb" }]
}

function LoadingState() {
  return (
    <main
      id="main-content"
      className="flex min-h-[65svh] items-center justify-center px-4 py-16"
    >
      <p className="inline-flex items-center gap-2 text-sm text-muted-foreground">
        <LoaderCircleIcon className="size-4 animate-spin" aria-hidden="true" />
        正在读取制作人地图
      </p>
    </main>
  )
}

function MapLoadingState() {
  return (
    <div className="flex aspect-4/3 min-h-80 items-center justify-center border-y bg-muted/30 px-6 text-sm text-muted-foreground sm:aspect-16/10 lg:aspect-auto lg:h-168">
      <LoaderCircleIcon className="size-4 animate-spin" aria-hidden="true" />
      <span className="ml-2">正在读取地图边界</span>
    </div>
  )
}

function MapUnavailableState() {
  return (
    <div className="flex aspect-4/3 min-h-80 items-center justify-center border-y bg-muted/30 px-6 text-center text-sm text-muted-foreground sm:aspect-16/10 lg:aspect-auto lg:h-168">
      地图边界暂时无法加载，地区与社群名录仍可正常浏览。
    </div>
  )
}

function CommunityImageDialog({
  community,
  onOpenChange,
}: {
  community: ProducerMapCommunity | null
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={Boolean(community)} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{community?.name}</DialogTitle>
          <DialogDescription>
            {community?.platform}
            {community?.region ? ` · ${community.region}` : ""}
          </DialogDescription>
        </DialogHeader>
        {community?.imageUrl ? (
          <DialogImageViewport
            key={community.imageUrl}
            src={community.imageUrl}
            alt={`${community.name}联络图片`}
            layout="community"
          />
        ) : null}
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>关闭</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function RegionImageDialog({
  region,
  onOpenChange,
}: {
  region: ProducerMapRegion | null
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={Boolean(region)} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        overlayClassName="bg-black/70 supports-backdrop-filter:backdrop-blur-sm"
        className="max-h-[calc(100svh-2rem)] max-w-[calc(100%-2rem)] gap-3 overflow-hidden bg-background p-3 sm:max-w-6xl"
      >
        <DialogHeader className="flex-row items-center gap-3 px-1">
          <div className="min-w-0 flex-1">
            <DialogTitle className="truncate">{region?.name}</DialogTitle>
            <DialogDescription className="sr-only">
              {region?.name}地区资料大图
            </DialogDescription>
          </div>
          <DialogClose
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="关闭地区资料"
                title="关闭"
              />
            }
          >
            <XIcon />
          </DialogClose>
        </DialogHeader>
        {region?.imageUrl ? (
          <DialogImageViewport
            key={region.imageUrl}
            src={region.imageUrl}
            alt={`${region.name}地区资料`}
            layout="region"
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function CommunityCard({
  community,
  onShowImage,
}: {
  community: ProducerMapCommunity
  onShowImage: (community: ProducerMapCommunity) => void
}) {
  return (
    <article
      className={`flex min-h-52 flex-col rounded-lg border border-t-4 bg-card p-5 ${seriesBorder[community.series]}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-muted-foreground">
            {community.platform}
            {community.region ? ` · ${community.region}` : " · 全国"}
          </p>
          <h3 className="mt-2 text-base font-semibold wrap-break-word">
            {community.name}
          </h3>
        </div>
        <UsersRoundIcon
          className="size-5 shrink-0 text-muted-foreground"
          aria-hidden="true"
        />
      </div>
      <p className="mt-4 text-sm/6 wrap-break-word text-muted-foreground">
        {community.description || "由制作人共同维护的交流社群。"}
      </p>
      {community.contact ? (
        <p className="mt-3 text-sm/6 font-medium wrap-break-word">
          {community.contact}
        </p>
      ) : null}
      {community.imageUrl || community.linkUrl ? (
        <div className="mt-auto flex flex-wrap gap-2 pt-5">
          {community.imageUrl ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onShowImage(community)}
            >
              <ImageIcon data-icon="inline-start" />
              查看联络图片
            </Button>
          ) : null}
          {community.linkUrl ? (
            <Button
              variant="outline"
              size="sm"
              render={
                <a href={community.linkUrl} target="_blank" rel="noreferrer" />
              }
              nativeButton={false}
            >
              <ExternalLinkIcon data-icon="inline-start" />
              访问社群入口
            </Button>
          ) : null}
        </div>
      ) : null}
    </article>
  )
}

export default function ProducerMapPage() {
  const {
    data,
    loading,
    error,
    send: refreshContent,
    onError: onContentError,
  } = useRequest(getProducerMapContent(), {
    force: ({ args }) => args[0] === true,
  })
  const {
    data: geometry,
    loading: geometryLoading,
    error: geometryError,
    send: refreshGeometry,
    onError: onGeometryError,
  } = useRequest(getProducerMapGeometry(), {
    force: ({ args }) => args[0] === true,
  })
  const [imageRegion, setImageRegion] = useState<ProducerMapRegion | null>(null)
  const [regionFilter, setRegionFilter] = useState("all")
  const [query, setQuery] = useState("")
  const [imageCommunity, setImageCommunity] =
    useState<ProducerMapCommunity | null>(null)
  onContentError(() => undefined)
  onGeometryError(() => undefined)

  async function forceRefresh() {
    await Promise.allSettled([refreshContent(true), refreshGeometry(true)])
  }

  const enabledRegions = useMemo(
    () => data?.regions.filter((region) => region.enabled) ?? [],
    [data]
  )
  const enabledCommunities = useMemo(
    () => data?.communities.filter((community) => community.enabled) ?? [],
    [data]
  )
  const visibleCommunities = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("zh-CN")
    return enabledCommunities.filter((community) => {
      const matchesRegion =
        regionFilter === "all" || community.region === regionFilter
      const matchesQuery =
        !normalizedQuery ||
        [
          community.name,
          community.platform,
          community.region || "全国",
          community.description,
          community.contact,
        ].some((value) =>
          value.toLocaleLowerCase("zh-CN").includes(normalizedQuery)
        )
      return matchesRegion && matchesQuery
    })
  }, [enabledCommunities, query, regionFilter])

  if (loading && !data) return <LoadingState />

  if (error || !data) {
    return (
      <main
        id="main-content"
        className="mx-auto flex min-h-[65svh] w-full max-w-3xl items-center px-4 py-16 sm:px-6"
      >
        <Alert variant="destructive">
          <AlertTitle>制作人地图暂时无法显示</AlertTitle>
          <AlertDescription className="mt-2 flex flex-col items-start gap-4">
            <span>{error?.message || "未能读取制作人地图配置。"}</span>
            <Button
              type="button"
              variant="outline"
              onClick={() => void forceRefresh()}
            >
              <RefreshCwIcon data-icon="inline-start" />
              重新加载
            </Button>
          </AlertDescription>
        </Alert>
      </main>
    )
  }

  return (
    <main id="main-content" className="relative isolate overflow-clip">
      <div className="relative z-10">
        <section className="border-b">
          <div className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
            <div className="max-w-3xl">
              <h1 className="text-3xl/tight font-semibold sm:text-5xl">
                {data.title}
              </h1>
              {data.subtitle ? (
                <p className="mt-3 text-sm font-semibold text-muted-foreground sm:text-base">
                  {data.subtitle}
                </p>
              ) : null}
              <p className="mt-6 max-w-2xl text-base/7 text-muted-foreground sm:text-lg">
                {data.introduction}
              </p>
            </div>
          </div>
          <SeriesAccentStrip className="h-1.5" />
        </section>

        <section className="border-b" aria-label="地区社群地图">
          <div className="mx-auto w-full max-w-7xl">
            {geometry ? (
              <Suspense fallback={<MapLoadingState />}>
                <ChinaCommunityMap
                  geometry={geometry}
                  regions={enabledRegions}
                  detailsOpen={Boolean(imageRegion)}
                  onSelect={(province) => {
                    const region = enabledRegions.find(
                      (item) => item.province === province
                    )
                    if (region?.imageUrl) setImageRegion(region)
                  }}
                />
              </Suspense>
            ) : geometryLoading ? (
              <MapLoadingState />
            ) : geometryError ? (
              <MapUnavailableState />
            ) : null}
          </div>
        </section>

        <section className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
          <div className="flex flex-col gap-6 border-b pb-8 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="text-2xl font-semibold">{data.directoryTitle}</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {visibleCommunities.length} 个公开条目
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:w-136">
              <label className="relative">
                <span className="sr-only">搜索社群</span>
                <SearchIcon
                  className="pointer-events-none absolute top-3 left-3 size-4 text-muted-foreground"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  className="h-10 w-full rounded-lg border bg-background pr-3 pl-9 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
                  placeholder="搜索社群"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </label>
              <label>
                <span className="sr-only">按地区筛选</span>
                <select
                  className="h-10 w-full rounded-lg border bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
                  value={regionFilter}
                  onChange={(event) => setRegionFilter(event.target.value)}
                >
                  <option value="all">全部地区</option>
                  {enabledRegions.map((region) => (
                    <option key={region.id} value={region.province}>
                      {region.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          {visibleCommunities.length ? (
            <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {visibleCommunities.map((community) => (
                <CommunityCard
                  key={community.id}
                  community={community}
                  onShowImage={setImageCommunity}
                />
              ))}
            </div>
          ) : (
            <p className="mt-10 border-y py-12 text-center text-sm text-muted-foreground">
              当前筛选条件下没有公开社群。
            </p>
          )}

          <div className="mt-10 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              地图来源：{" "}
              <a
                href={data.mapSourceUrl}
                target="_blank"
                rel="noreferrer"
                className="underline decoration-border underline-offset-4 hover:text-foreground"
              >
                {data.mapSourceLabel}
              </a>
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={loading || geometryLoading}
              onClick={() => void forceRefresh()}
              aria-label="强制刷新地图数据"
              title="强制刷新地图数据"
            >
              <RefreshCwIcon
                data-icon="inline-start"
                className={loading || geometryLoading ? "animate-spin" : ""}
              />
              刷新数据
            </Button>
          </div>
        </section>
      </div>

      <CommunityImageDialog
        community={imageCommunity}
        onOpenChange={(open) => {
          if (!open) setImageCommunity(null)
        }}
      />
      <RegionImageDialog
        region={imageRegion}
        onOpenChange={(open) => {
          if (!open) setImageRegion(null)
        }}
      />
    </main>
  )
}
