import { useRequest } from "alova/client"
import {
  ExternalLinkIcon,
  ImageIcon,
  LoaderCircleIcon,
  MapPinIcon,
  RefreshCwIcon,
  SearchIcon,
  UsersRoundIcon,
} from "lucide-react"
import { useMemo, useState } from "react"

import { SeriesIconBackground } from "~/components/shared/series-icon-background"
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
import { ChinaCommunityMap } from "~/pages/producer-map/components/china-community-map"
import {
  getProducerMapContent,
  type ProducerMapCommunity,
  type ProducerMapSeries,
} from "~/shared/api"

const seriesBorder: Record<ProducerMapSeries, string> = {
  all: "border-t-foreground/25",
  "765": "border-t-franchise-765",
  cg: "border-t-franchise-cg",
  ml: "border-t-franchise-ml",
  sidem: "border-t-franchise-sidem",
  sc: "border-t-franchise-sc",
  gakuen: "border-t-franchise-gk",
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
          <img
            src={community.imageUrl}
            alt={`${community.name}联络图片`}
            className="mx-auto max-h-[60svh] w-auto rounded-md border object-contain"
          />
        ) : null}
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>关闭</DialogClose>
        </DialogFooter>
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
          <h3 className="mt-2 text-base font-semibold break-words">
            {community.name}
          </h3>
        </div>
        <UsersRoundIcon
          className="size-5 shrink-0 text-muted-foreground"
          aria-hidden="true"
        />
      </div>
      <p className="mt-4 text-sm leading-6 break-words text-muted-foreground">
        {community.description || "由制作人共同维护的交流社群。"}
      </p>
      {community.contact ? (
        <p className="mt-3 text-sm leading-6 font-medium break-words">
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
    send: refresh,
    onError,
  } = useRequest(getProducerMapContent())
  const [selectedProvince, setSelectedProvince] = useState<string | null>(null)
  const [regionFilter, setRegionFilter] = useState("all")
  const [query, setQuery] = useState("")
  const [imageCommunity, setImageCommunity] =
    useState<ProducerMapCommunity | null>(null)
  onError(() => undefined)

  const enabledRegions = useMemo(
    () => data?.regions.filter((region) => region.enabled) ?? [],
    [data]
  )
  const enabledCommunities = useMemo(
    () => data?.communities.filter((community) => community.enabled) ?? [],
    [data]
  )
  const selectedRegion = enabledRegions.find(
    (region) => region.province === selectedProvince
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
            <Button type="button" variant="outline" onClick={() => refresh()}>
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
      <SeriesIconBackground />
      <div className="relative z-10 bg-background/88">
        <section className="border-b">
          <div className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
            <div className="max-w-3xl">
              <h1 className="text-3xl leading-tight font-semibold sm:text-5xl">
                {data.title}
              </h1>
              {data.subtitle ? (
                <p className="mt-3 text-sm font-semibold text-muted-foreground sm:text-base">
                  {data.subtitle}
                </p>
              ) : null}
              <p className="mt-6 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
                {data.introduction}
              </p>
            </div>
          </div>
          <div className="grid h-1.5 grid-cols-6" aria-hidden="true">
            <span className="bg-franchise-765" />
            <span className="bg-franchise-cg" />
            <span className="bg-franchise-ml" />
            <span className="bg-franchise-sidem" />
            <span className="bg-franchise-sc" />
            <span className="bg-franchise-gk" />
          </div>
        </section>

        <section className="border-b" aria-label="地区社群地图">
          <div className="mx-auto grid w-full max-w-7xl lg:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
            <div className="min-w-0 border-b lg:border-r lg:border-b-0">
              <ChinaCommunityMap
                regions={enabledRegions}
                selectedProvince={selectedProvince}
                onSelect={setSelectedProvince}
              />
            </div>
            <aside className="flex min-h-72 flex-col p-5 sm:p-7 lg:min-h-0 lg:p-8">
              <label
                htmlFor="producer-map-region"
                className="text-xs font-semibold text-muted-foreground"
              >
                地区资料
              </label>
              <select
                id="producer-map-region"
                className="mt-2 h-10 w-full rounded-lg border bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
                value={selectedProvince || ""}
                onChange={(event) =>
                  setSelectedProvince(event.target.value || null)
                }
              >
                <option value="">全国概览</option>
                {enabledRegions.map((region) => (
                  <option key={region.id} value={region.province}>
                    {region.name}
                  </option>
                ))}
              </select>
              <div className="mt-8">
                <MapPinIcon
                  className="size-6 text-primary"
                  aria-hidden="true"
                />
                <h2 className="mt-4 text-xl font-semibold">
                  {selectedProvince
                    ? selectedRegion?.name || selectedProvince
                    : "全国制作人社群"}
                </h2>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">
                  {selectedRegion?.summary ||
                    (selectedProvince
                      ? "该地区资料尚未收录。"
                      : `当前收录 ${enabledRegions.length} 个地区、${enabledCommunities.length} 个社群。`)}
                </p>
                {selectedRegion?.imageUrl ? (
                  <img
                    src={selectedRegion.imageUrl}
                    alt={`${selectedRegion.name}地区资料`}
                    className="mt-5 max-h-56 w-full rounded-md border object-contain"
                    loading="lazy"
                    decoding="async"
                  />
                ) : null}
                {selectedRegion?.contact ? (
                  <p className="mt-4 text-sm leading-6 font-medium break-words">
                    {selectedRegion.contact}
                  </p>
                ) : null}
              </div>
              {selectedRegion?.linkUrl ? (
                <Button
                  className="mt-auto self-start"
                  variant="outline"
                  render={
                    <a
                      href={selectedRegion.linkUrl}
                      target="_blank"
                      rel="noreferrer"
                    />
                  }
                  nativeButton={false}
                >
                  <ExternalLinkIcon data-icon="inline-start" />
                  访问地区入口
                </Button>
              ) : null}
            </aside>
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
            <div className="grid gap-3 sm:grid-cols-2 lg:w-[34rem]">
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

          <p className="mt-10 text-xs text-muted-foreground">
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
        </section>
      </div>

      <CommunityImageDialog
        community={imageCommunity}
        onOpenChange={(open) => {
          if (!open) setImageCommunity(null)
        }}
      />
    </main>
  )
}
