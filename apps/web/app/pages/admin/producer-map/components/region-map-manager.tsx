import {
  ImageIcon,
  ListOrderedIcon,
  LoaderCircleIcon,
  MapIcon,
  PencilIcon,
  PlusIcon,
  RefreshCwIcon,
  Trash2Icon,
} from "lucide-react"
import { lazy, Suspense, useMemo, useState } from "react"

import { SeriesAccentStrip } from "~/components/shared/series-accent-strip"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select"
import { ToggleGroup, ToggleGroupItem } from "~/components/ui/toggle-group"
import type { ProducerMapGeometry, ProducerMapRegion } from "~/lib/api"
import { SortableList } from "~/components/admin/sortable-list"
import {
  AdminEmptyState,
  AdminField,
  AdminPanel,
} from "~/components/admin/admin-ui"
import {
  provinceOptions,
  seriesOptions,
} from "~/pages/admin/producer-map/producer-map-model"

const chinaCommunityMapModule =
  import("~/components/producer-map/china-community-map")
const ChinaCommunityMap = lazy(async () => {
  const module = await chinaCommunityMapModule
  return { default: module.ChinaCommunityMap }
})

type RegionView = "map" | "order"

const provinceItems = provinceOptions.map((province) => ({
  label: province,
  value: province,
}))

function seriesLabel(value: ProducerMapRegion["series"]): string {
  return seriesOptions.find((option) => option.value === value)?.label ?? value
}

function RegionThumbnail({ region }: { region: ProducerMapRegion }) {
  const [failed, setFailed] = useState(false)

  return (
    <div className="flex aspect-16/10 w-full items-center justify-center overflow-hidden rounded-md border bg-muted/25 text-muted-foreground">
      {region.imageUrl && !failed ? (
        <img
          src={region.imageUrl}
          alt={`${region.name}地点资料预览`}
          className="size-full object-contain"
          onError={() => setFailed(true)}
        />
      ) : (
        <ImageIcon aria-hidden="true" />
      )}
    </div>
  )
}

function RegionOrderThumbnail({ region }: { region: ProducerMapRegion }) {
  const [failed, setFailed] = useState(false)

  return (
    <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted/25 text-muted-foreground">
      {region.imageUrl && !failed ? (
        <img
          src={region.imageUrl}
          alt=""
          className="size-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <ImageIcon aria-hidden="true" />
      )}
    </div>
  )
}

function RegionOrderRow({
  region,
  disabled,
  onEdit,
  onDelete,
}: {
  region: ProducerMapRegion
  disabled: boolean
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <div className="flex min-h-18 min-w-0 items-center gap-3 py-3">
      <RegionOrderThumbnail key={region.imageUrl ?? "empty"} region={region} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate font-medium">{region.name}</p>
          <Badge variant={region.enabled ? "secondary" : "outline"}>
            {region.enabled ? "公开" : "隐藏"}
          </Badge>
        </div>
        <p className="mt-1 truncate text-xs text-muted-foreground">
          {region.province} · {seriesLabel(region.series)}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          disabled={disabled}
          aria-label={`编辑${region.name}`}
          title="编辑"
          onClick={onEdit}
        >
          <PencilIcon aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          disabled={disabled}
          aria-label={`删除${region.name}`}
          title="删除"
          onClick={onDelete}
        >
          <Trash2Icon aria-hidden="true" />
        </Button>
      </div>
    </div>
  )
}

function MapLoadingState() {
  return (
    <div className="flex aspect-4/3 min-h-80 items-center justify-center bg-muted/20 px-6 text-sm text-muted-foreground sm:aspect-16/10 lg:aspect-auto lg:h-144">
      <LoaderCircleIcon className="size-4 animate-spin" aria-hidden="true" />
      <span className="ml-2">正在读取地图边界</span>
    </div>
  )
}

function MapUnavailableState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex aspect-4/3 min-h-80 flex-col items-center justify-center gap-4 bg-muted/20 px-6 text-center text-sm text-muted-foreground sm:aspect-16/10 lg:aspect-auto lg:h-144">
      <p>地图边界暂时无法加载。</p>
      <Button type="button" variant="outline" size="sm" onClick={onRetry}>
        <RefreshCwIcon data-icon="inline-start" />
        重新加载地图
      </Button>
    </div>
  )
}

function MapLegend() {
  return (
    <div
      className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t px-4 py-3 text-xs text-muted-foreground"
      aria-label="地图状态图例"
    >
      <span className="inline-flex items-center gap-2">
        <SeriesAccentStrip className="h-2.5 w-8 overflow-hidden rounded-sm" />
        公开地点
      </span>
      <span className="inline-flex items-center gap-2">
        <span className="size-2.5 rounded-xs bg-muted-foreground" />
        隐藏地点
      </span>
      <span className="inline-flex items-center gap-2">
        <span className="size-2.5 rounded-xs border bg-muted" />
        未配置
      </span>
      <span className="inline-flex items-center gap-2">
        <span className="size-2.5 rounded-xs border-2 border-primary bg-background" />
        当前选择
      </span>
    </div>
  )
}

export function RegionMapManager({
  geometry,
  geometryLoading,
  geometryError,
  regions,
  disabled,
  onCreate,
  onEdit,
  onDelete,
  onReorder,
  onRetryGeometry,
}: {
  geometry: ProducerMapGeometry | undefined
  geometryLoading: boolean
  geometryError: Error | null | undefined
  regions: ProducerMapRegion[]
  disabled: boolean
  onCreate: (province: string) => void
  onEdit: (region: ProducerMapRegion) => void
  onDelete: (region: ProducerMapRegion) => void
  onReorder: (regions: ProducerMapRegion[]) => void
  onRetryGeometry: () => void
}) {
  const [view, setView] = useState<RegionView>("map")
  const [selectedProvince, setSelectedProvince] = useState(
    regions[0]?.province ?? provinceOptions[0]
  )
  const regionsByProvince = useMemo(
    () => new Map(regions.map((region) => [region.province, region])),
    [regions]
  )
  const selectedRegion = regionsByProvince.get(selectedProvince)

  function activateProvince(province: string) {
    if (!provinceOptions.some((option) => option === province)) return
    setSelectedProvince(province)
    if (disabled) return
    document.getElementById("producer-map-region-selection")?.focus()
    const region = regionsByProvince.get(province)
    if (region) onEdit(region)
    else onCreate(province)
  }

  return (
    <AdminPanel
      title="地图地点"
      description={`${regions.length} / ${provinceOptions.length} 个地点`}
      icon={MapIcon}
      action={
        <ToggleGroup
          value={[view]}
          variant="outline"
          spacing={0}
          size="sm"
          aria-label="地点管理视图"
          onValueChange={(values) => {
            const nextView = values[0] as RegionView | undefined
            if (nextView) setView(nextView)
          }}
        >
          <ToggleGroupItem value="map">
            <MapIcon data-icon="inline-start" />
            地图编辑
          </ToggleGroupItem>
          <ToggleGroupItem value="order">
            <ListOrderedIcon data-icon="inline-start" />
            公开顺序
          </ToggleGroupItem>
        </ToggleGroup>
      }
      contentClassName="p-0"
    >
      {view === "map" ? (
        <div className="grid min-w-0 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="min-w-0 bg-muted/10">
            {geometry ? (
              <Suspense fallback={<MapLoadingState />}>
                <ChinaCommunityMap
                  geometry={geometry}
                  regions={regions}
                  mode="admin"
                  selectedProvince={selectedProvince}
                  ariaLabel="中国省级行政区地点配置地图"
                  className="aspect-4/3 min-h-80 w-full sm:aspect-16/10 lg:aspect-auto lg:h-144"
                  onSelect={activateProvince}
                />
              </Suspense>
            ) : geometryLoading ? (
              <MapLoadingState />
            ) : geometryError ? (
              <MapUnavailableState onRetry={onRetryGeometry} />
            ) : (
              <MapLoadingState />
            )}
            <MapLegend />
          </div>

          <aside className="flex min-w-0 flex-col gap-5 border-t p-4 lg:border-t-0 lg:border-l">
            <AdminField label="行政区" htmlFor="producer-map-region-selection">
              <Select
                items={provinceItems}
                value={selectedProvince}
                onValueChange={(value) => {
                  if (value) setSelectedProvince(String(value))
                }}
              >
                <SelectTrigger
                  id="producer-map-region-selection"
                  className="w-full"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="start" alignItemWithTrigger={false}>
                  <SelectGroup>
                    {provinceItems.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </AdminField>

            {selectedRegion ? (
              <div className="flex min-w-0 flex-col gap-4" aria-live="polite">
                <RegionThumbnail
                  key={selectedRegion.imageUrl ?? "empty"}
                  region={selectedRegion}
                />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate text-sm font-semibold">
                      {selectedRegion.name}
                    </h3>
                    <Badge
                      variant={selectedRegion.enabled ? "secondary" : "outline"}
                    >
                      {selectedRegion.enabled ? "公开" : "隐藏"}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {seriesLabel(selectedRegion.series)}
                  </p>
                  {selectedRegion.summary ? (
                    <p className="mt-3 line-clamp-4 text-sm/6 text-muted-foreground">
                      {selectedRegion.summary}
                    </p>
                  ) : null}
                </div>
                <div className="mt-auto flex items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    className="flex-1"
                    disabled={disabled}
                    onClick={() => onEdit(selectedRegion)}
                  >
                    <PencilIcon data-icon="inline-start" />
                    编辑地点
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    disabled={disabled}
                    aria-label={`删除${selectedRegion.name}`}
                    title="删除"
                    onClick={() => onDelete(selectedRegion)}
                  >
                    <Trash2Icon aria-hidden="true" />
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-1 flex-col justify-between gap-5 border-t pt-5">
                <div>
                  <Badge variant="outline">未配置</Badge>
                  <h3 className="mt-3 text-sm font-semibold">
                    {selectedProvince}
                  </h3>
                </div>
                <Button
                  type="button"
                  size="sm"
                  disabled={disabled}
                  onClick={() => onCreate(selectedProvince)}
                >
                  <PlusIcon data-icon="inline-start" />
                  新增地点
                </Button>
              </div>
            )}
          </aside>
        </div>
      ) : regions.length ? (
        <SortableList
          items={regions}
          disabled={disabled}
          className="border-y-0"
          getLabel={(region) => region.name}
          renderItem={(region) => (
            <RegionOrderRow
              region={region}
              disabled={disabled}
              onEdit={() => onEdit(region)}
              onDelete={() => onDelete(region)}
            />
          )}
          onReorder={onReorder}
        />
      ) : (
        <div className="p-4">
          <AdminEmptyState
            icon={MapIcon}
            title="还没有地图地点"
            description="请切换到地图编辑并选择行政区。"
          />
        </div>
      )}
    </AdminPanel>
  )
}
