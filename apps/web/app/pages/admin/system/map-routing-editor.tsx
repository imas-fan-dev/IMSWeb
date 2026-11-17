import { useState } from "react"
import { Button } from "~/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "~/components/ui/field"
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "~/components/ui/select"
import type { FudabaMapDeliverySnapshot, FudabaMapRouting } from "~/lib/api"
import {
  preferredMapSource,
  mapSourcesForRegion,
} from "~/lib/maps/provider-catalog"
import type { MapRoutingRegion } from "~/lib/maps/provider-definition"

export function MapRoutingEditor({
  snapshot,
  saving,
  onSave,
}: {
  snapshot: FudabaMapDeliverySnapshot
  saving: boolean
  onSave: (
    fallbackSourceId: string,
    routing: FudabaMapRouting | null
  ) => Promise<void>
}) {
  const [mode, setMode] = useState(snapshot.routing ? "regional" : "single")
  const [fallback, setFallback] = useState(snapshot.activeSourceId)
  const [mainland, setMainland] = useState(
    snapshot.routing?.mainlandSourceId ??
      preferredMapSource(snapshot.sources, "mainland") ??
      ""
  )
  const [overseas, setOverseas] = useState(
    snapshot.routing?.overseasSourceId ??
      preferredMapSource(snapshot.sources, "overseas") ??
      ""
  )
  const selectSource = (
    id: string,
    label: string,
    value: string,
    set: (value: string) => void,
    region?: MapRoutingRegion
  ) => (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Select
        value={value}
        onValueChange={(next) => {
          if (next) set(next)
        }}
        disabled={saving}
      >
        <SelectTrigger id={id}>
          <SelectValue>
            {snapshot.sources.find((source) => source.id === value)?.name ??
              "请选择地图源"}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {(region
            ? mapSourcesForRegion(snapshot.sources, region)
            : snapshot.sources
          ).map((source) => (
            <SelectItem key={source.id} value={source.id}>
              {source.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  )
  return (
    <div className="space-y-5 border-b pb-5">
      <FieldGroup className="grid gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="map-routing-mode">地图分发方式</FieldLabel>
          <Select
            value={mode}
            onValueChange={(value) => {
              if (value) setMode(value)
            }}
            disabled={saving}
          >
            <SelectTrigger id="map-routing-mode">
              <SelectValue>
                {mode === "regional" ? "Mapbox 底图＋地区搜索" : "统一地图源"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="single">统一地图源</SelectItem>
              <SelectItem value="regional">Mapbox 底图＋地区搜索</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        {mode === "single"
          ? selectSource(
              "map-routing-fallback",
              "默认地图源",
              fallback,
              setFallback
            )
          : null}
        {mode === "regional" ? (
          <>
            {selectSource(
              "map-routing-mainland",
              "中国大陆搜索（高德）",
              mainland,
              setMainland,
              "mainland"
            )}
            {selectSource(
              "map-routing-overseas",
              "统一底图与海外搜索（Mapbox，含港澳台）",
              overseas,
              setOverseas,
              "overseas"
            )}
          </>
        ) : null}
      </FieldGroup>
      <FieldDescription>
        地图分发配置会选择公开地区模式引用的高德与 Mapbox 源。 地图底图固定使用
        Mapbox，不会因大陆／海外位置切换渲染器；搜索按提交时的地图中心
        选择高德（大陆）或 Mapbox（海外），候选结果按当前位置直线距离排序。
        无定位时明确回退为距地图中心排序。跨底图使用高德结果的许可需单独确认。
        保存后需重新加载地图。
      </FieldDescription>
      <Button
        type="button"
        variant="outline"
        disabled={
          saving ||
          (mode === "single" && !fallback) ||
          (mode === "regional" && (!mainland || !overseas))
        }
        onClick={() =>
          void onSave(
            mode === "regional" ? snapshot.activeSourceId : fallback,
            mode === "regional"
              ? { mainlandSourceId: mainland, overseasSourceId: overseas }
              : null
          )
        }
      >
        保存分发配置
      </Button>
    </div>
  )
}
