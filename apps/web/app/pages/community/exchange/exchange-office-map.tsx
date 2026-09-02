import "maplibre-gl/dist/maplibre-gl.css"

import { LoaderCircleIcon, LocateFixedIcon } from "lucide-react"
import {
  addProtocol,
  AttributionControl,
  GeoJSONSource,
  Map as MapLibreMap,
  type MapSourceDataEvent,
  Marker,
  NavigationControl,
  setWorkerUrl,
  type StyleSpecification,
} from "maplibre-gl"
import maplibreWorkerUrl from "maplibre-gl/dist/maplibre-gl-csp-worker.js?url"
import { Protocol } from "pmtiles"
import { useCallback, useEffect, useRef, useState } from "react"

import { Button } from "~/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "~/components/ui/tooltip"
import {
  getFudabaChinaBoundaryDashSource,
  resolveMapTransportOrigin,
} from "~/lib/api"
import { IS_APP_TARGET } from "~/lib/app-target"
import { cn } from "~/lib/utils"

import {
  applyChinaBoundaryCompliance,
  CHINA_CLAIM_BOUNDARY_LAYER_ID,
  CHINA_DASH_FILL_LAYER_ID,
  CHINA_DASH_LINE_LAYER_ID,
  TAIWAN_PROVINCE_LABEL_LAYER_ID,
} from "./exchange-boundary-compliance"
import type { FudabaMapOfficeGroup } from "./exchange-map-model"
import {
  createMapDeliveryContext,
  DEFAULT_EXCHANGE_MAP_VIEWPORT,
  exchangeMapInitialViewport,
  EXCHANGE_MAP_MAX_ZOOM,
  EXCHANGE_MAP_MIN_ZOOM,
  rememberExchangeMapViewport,
  resolveAllowedMapResourceUrl,
  resolveMapStyleResourceUrls,
  resolveMapStyleUrl,
  splitViewportBounds,
  type ExchangeMapViewport,
  type MapViewportBounds,
} from "./exchange-map-model"

const officeSourceId = "fudaba-regional-offices"
const officeSourceLayerId = "fudaba-regional-offices-hit-area"
const pmtilesProtocol = new Protocol()
let pmtilesProtocolRegistered = false
const localIdeographFontFamily =
  "'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif"

function ensurePmtilesProtocol() {
  if (pmtilesProtocolRegistered) return
  addProtocol("pmtiles", pmtilesProtocol.tile)
  pmtilesProtocolRegistered = true
}
type PaintPropertyName = Parameters<MapLibreMap["setPaintProperty"]>[1]
type PaintPropertyValue = Parameters<MapLibreMap["setPaintProperty"]>[2]

const portalMapLayerPaint: Readonly<
  Record<string, Readonly<Record<string, unknown>>>
> = {
  background: { "background-color": "#edf3f8" },
  "landcover-glacier": { "fill-color": "#f9fbfd" },
  "landuse-residential": { "fill-color": "#f5f8fb" },
  "landuse-suburb": { "fill-color": "#f3f7fa" },
  "landuse-commercial": { "fill-color": "#f6f2f7" },
  "landuse-industrial": { "fill-color": "#f0f2f7" },
  "landuse-cemetery": { "fill-color": "#e2efe9" },
  "landuse-hospital": { "fill-color": "#f8eef3" },
  "landuse-school": { "fill-color": "#f7f4e8" },
  "landuse-railway": { "fill-color": "#edf1f5" },
  park: { "fill-color": "#e0f0e7", "fill-opacity": 0.86 },
  "landcover-wood": { "fill-color": "#d9ece3", "fill-opacity": 0.78 },
  "landcover-grass": { "fill-color": "#e4f2e9", "fill-opacity": 0.9 },
  "landcover-grass-park": {
    "fill-color": "#deeee5",
    "fill-opacity": 0.9,
  },
  "landcover-sand": { "fill-color": "#f5efd9" },
  water: { "fill-color": "#d9ecf8" },
  "water-intermittent": { "fill-color": "#e5f3fb" },
  building: {
    "fill-color": "#e9eef4",
    "fill-outline-color": "#dbe4ed",
  },
  "building-top": {
    "fill-color": "#eef2f6",
    "fill-outline-color": "#dde6ef",
  },
  boundary_2: { "line-color": "#afbed0", "line-opacity": 0.68 },
  // 中国主张国界线与其余国界同色，视觉上不可区分。
  [CHINA_CLAIM_BOUNDARY_LAYER_ID]: {
    "line-color": "#afbed0",
    "line-opacity": 0.68,
  },
  // 南海断续线：fill 填实，outline 保证低缩放下仍可见，两者同色。
  [CHINA_DASH_FILL_LAYER_ID]: {
    "fill-color": "#afbed0",
    "fill-opacity": 0.68,
  },
  [CHINA_DASH_LINE_LAYER_ID]: {
    "line-color": "#afbed0",
    "line-opacity": 0.68,
  },
  boundary_3: { "line-color": "#c5d1df", "line-opacity": 0.58 },
  boundary_disputed: {
    "line-color": "#b7c3d1",
    "line-opacity": 0.54,
  },
}

const waterwayLayerIds = [
  "waterway_tunnel",
  "waterway-other",
  "waterway-other-intermittent",
  "waterway-stream-canal",
  "waterway-stream-canal-intermittent",
  "waterway-river",
  "waterway-river-intermittent",
  "ferry",
]

const minorRoadLayerIds = [
  "tunnel-service-track",
  "tunnel-link",
  "tunnel-minor",
  "highway-path",
  "highway-link",
  "highway-minor",
  "bridge-path",
  "bridge-link",
  "bridge-minor",
]

const collectorRoadLayerIds = [
  "tunnel-secondary-tertiary",
  "highway-secondary-tertiary",
  "bridge-secondary-tertiary",
]

const arterialRoadLayerIds = [
  "tunnel-trunk-primary",
  "highway-primary",
  "highway-trunk",
  "bridge-trunk-primary",
]

const motorwayLayerIds = [
  "tunnel-motorway-link",
  "tunnel-motorway",
  "highway-motorway-link",
  "highway-motorway",
  "bridge-motorway-link",
  "bridge-motorway",
]

const roadCasingLayerIds = [
  "tunnel-service-track-casing",
  "tunnel-motorway-link-casing",
  "tunnel-minor-casing",
  "tunnel-link-casing",
  "tunnel-secondary-tertiary-casing",
  "tunnel-trunk-primary-casing",
  "tunnel-motorway-casing",
  "highway-motorway-link-casing",
  "highway-link-casing",
  "highway-minor-casing",
  "highway-secondary-tertiary-casing",
  "highway-primary-casing",
  "highway-trunk-casing",
  "highway-motorway-casing",
  "bridge-motorway-link-casing",
  "bridge-link-casing",
  "bridge-secondary-tertiary-casing",
  "bridge-trunk-primary-casing",
  "bridge-motorway-casing",
  "bridge-minor-casing",
  "bridge-path-casing",
]

const labelLayerIds = [
  "waterway_line_label",
  "water_name_point_label",
  "water_name_line_label",
  "poi_r20",
  "poi_r7",
  "poi_r1",
  "poi_transit",
  "highway-name-path",
  "highway-name-minor",
  "highway-name-major",
  "airport",
  "label_other",
  "label_village",
  "label_town",
  "label_state",
  TAIWAN_PROVINCE_LABEL_LAYER_ID,
  "label_city",
  "label_city_capital",
  "label_country_3",
  "label_country_2",
  "label_country_1",
]

setWorkerUrl(maplibreWorkerUrl)

interface RenderedMarker {
  marker: Marker
  signature: string
}

export interface ExchangeOfficeMapProps {
  styleUrl: string
  groups: FudabaMapOfficeGroup[]
  selectedGroupKey: string | null
  onSelectGroup: (groupKey: string) => void
  onViewportChange: (bounds: ReturnType<typeof splitViewportBounds>) => void
  onFatalError: (error: Error) => void
}

function mapError(error: unknown) {
  return error instanceof Error ? error : new Error("地图渲染失败")
}

function featureCollection(groups: readonly FudabaMapOfficeGroup[]) {
  return {
    type: "FeatureCollection" as const,
    features: groups.map((group) => ({
      type: "Feature" as const,
      id: group.key,
      geometry: {
        type: "Point" as const,
        coordinates: [group.longitude, group.latitude],
      },
      properties: {
        groupKey: group.key,
        officeCount: group.offices.length,
        accent: group.offices[0]?.accent ?? "#f34e6c",
      },
    })),
  }
}

function createClusterMarker(count: number) {
  const marker = document.createElement("button")
  marker.type = "button"
  marker.className =
    "z-1 flex size-11 items-center justify-center rounded-full border-2 border-background bg-primary text-sm font-semibold text-primary-foreground shadow-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
  marker.setAttribute("aria-label", `${count} 个区域点，放大查看`)
  marker.textContent = String(count)
  return marker
}

function createOfficeGroupMarker(
  group: FudabaMapOfficeGroup,
  selected: boolean
) {
  const marker = document.createElement("button")
  marker.type = "button"
  marker.className =
    "z-1 flex h-11 min-w-11 items-center justify-center overflow-hidden rounded-lg border-2 border-background bg-background px-2 text-sm font-semibold text-foreground shadow-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
  marker.dataset.mapOfficeGroup = group.key
  marker.setAttribute("aria-pressed", String(selected))
  marker.setAttribute(
    "aria-label",
    `${group.offices.map((office) => office.name).join("、")}，${group.offices.length} 个事务所`
  )
  if (selected) marker.classList.add("ring-3", "ring-primary/60")

  const count = document.createElement("span")
  count.textContent = String(group.offices.length)
  marker.append(count)

  const strip = document.createElement("span")
  strip.className = "absolute inset-x-0 bottom-0 flex h-1"
  strip.setAttribute("aria-hidden", "true")
  for (const color of group.colors.slice(0, 6)) {
    const segment = document.createElement("span")
    segment.className = "h-full flex-1"
    segment.style.backgroundColor = color
    strip.append(segment)
  }
  marker.append(strip)
  return marker
}

function currentViewport(map: MapLibreMap): MapViewportBounds {
  const bounds = map.getBounds()
  return {
    west: bounds.getWest(),
    south: bounds.getSouth(),
    east: bounds.getEast(),
    north: bounds.getNorth(),
  }
}

function currentSessionViewport(map: MapLibreMap): ExchangeMapViewport {
  const center = map.getCenter()
  return {
    center: [center.lng, center.lat],
    zoom: map.getZoom(),
  }
}

function setPaintProperties(
  map: MapLibreMap,
  layerId: string,
  paint: Readonly<Record<string, unknown>>
) {
  if (!map.getLayer(layerId)) return
  for (const [property, value] of Object.entries(paint)) {
    map.setPaintProperty(
      layerId,
      property as PaintPropertyName,
      value as PaintPropertyValue
    )
  }
}

const railwayLayerIds = [
  "railway-transit",
  "railway-service",
  "railway",
  "bridge-railway",
  "tunnel-railway",
]
const poiLabelLayerIds = ["poi_r20", "poi_r7", "poi_r1", "poi_transit"]
const highwayLabelLayerIds = [
  "highway-name-path",
  "highway-name-minor",
  "highway-name-major",
]
const cityLabelLayerIds = [
  "label_city",
  "label_city_capital",
  "label_country_1",
  "label_country_2",
  "label_country_3",
]
const waterLabelLayerIds = [
  "water_name_point_label",
  "water_name_line_label",
  "waterway_line_label",
]
const portalStyledLayerIds = [
  ...new Set([
    ...Object.keys(portalMapLayerPaint),
    ...waterwayLayerIds,
    ...roadCasingLayerIds,
    ...minorRoadLayerIds,
    ...collectorRoadLayerIds,
    ...arterialRoadLayerIds,
    ...motorwayLayerIds,
    ...railwayLayerIds,
    ...labelLayerIds,
  ]),
]

function portalPaintForLayer(layerId: string) {
  const paint: Record<string, unknown> = {
    ...portalMapLayerPaint[layerId],
  }
  if (waterwayLayerIds.includes(layerId)) {
    Object.assign(paint, {
      "line-color": "#a8d6ed",
      "line-opacity": 0.84,
    })
  }
  if (roadCasingLayerIds.includes(layerId)) {
    Object.assign(paint, {
      "line-color": "#c7d4e2",
      "line-opacity": 0.58,
    })
  }
  if (minorRoadLayerIds.includes(layerId)) {
    Object.assign(paint, {
      "line-color": "#ffffff",
      "line-opacity": 0.88,
    })
  }
  if (collectorRoadLayerIds.includes(layerId)) {
    Object.assign(paint, {
      "line-color": "#edf3f9",
      "line-opacity": 0.94,
    })
  }
  if (arterialRoadLayerIds.includes(layerId)) {
    Object.assign(paint, {
      "line-color": "#d6dff0",
      "line-opacity": 0.96,
    })
  }
  if (motorwayLayerIds.includes(layerId)) {
    Object.assign(paint, {
      "line-color": "#adcbea",
      "line-opacity": 0.96,
    })
  }
  if (railwayLayerIds.includes(layerId)) {
    Object.assign(paint, {
      "line-color": "#bdc8d5",
      "line-opacity": 0.5,
    })
  }
  if (labelLayerIds.includes(layerId)) {
    Object.assign(paint, {
      "text-color": "#687489",
      "text-halo-color": "#f7faff",
      "text-halo-width": 1.35,
      "text-opacity": 0.86,
    })
  }
  if (poiLabelLayerIds.includes(layerId)) {
    Object.assign(paint, { "text-opacity": 0.56 })
  }
  if (highwayLabelLayerIds.includes(layerId)) {
    Object.assign(paint, { "text-opacity": 0.66 })
  }
  if (cityLabelLayerIds.includes(layerId)) {
    Object.assign(paint, {
      "text-color": "#3d485b",
      "text-halo-color": "#f7faff",
      "text-halo-width": 1.6,
      "text-opacity": 0.94,
    })
  }
  if (waterLabelLayerIds.includes(layerId)) {
    Object.assign(paint, {
      "text-color": "#5b89a5",
      "text-halo-color": "#e8f5fb",
      "text-halo-width": 1.2,
      "text-opacity": 0.88,
    })
  }
  return Object.keys(paint).length ? paint : null
}

function applyPortalMapStyle(style: StyleSpecification): StyleSpecification {
  return {
    ...style,
    layers: style.layers.map((layer) => {
      const portalPaint = portalPaintForLayer(layer.id)
      if (!portalPaint) return layer
      const currentPaint = "paint" in layer ? (layer.paint ?? {}) : {}
      return {
        ...layer,
        paint: { ...currentPaint, ...portalPaint },
      } as StyleSpecification["layers"][number]
    }),
  }
}

function applyPortalMapPalette(map: MapLibreMap) {
  for (const layerId of portalStyledLayerIds) {
    const paint = portalPaintForLayer(layerId)
    if (paint) setPaintProperties(map, layerId, paint)
  }
}

function createUserLocationElement() {
  const element = document.createElement("span")
  element.className =
    "block size-4 rounded-full border-[3px] border-white bg-primary shadow-[0_2px_8px_rgb(23_29_38/35%)] ring-2 ring-primary/30"
  element.setAttribute("role", "img")
  element.setAttribute("aria-label", "您的当前位置")
  return element
}

function geolocationErrorMessage(error: GeolocationPositionError) {
  if (error.code === error.PERMISSION_DENIED) return "未获得位置权限"
  if (error.code === error.TIMEOUT) return "获取位置超时，请重试"
  return "暂时无法获取您的位置"
}

export function ExchangeOfficeMap({
  styleUrl,
  groups,
  selectedGroupKey,
  onSelectGroup,
  onViewportChange,
  onFatalError,
}: ExchangeOfficeMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const markersRef = useRef(new Map<string, RenderedMarker>())
  const groupsRef = useRef(groups)
  const selectedGroupKeyRef = useRef(selectedGroupKey)
  const onSelectGroupRef = useRef(onSelectGroup)
  const onViewportChangeRef = useRef(onViewportChange)
  const onFatalErrorRef = useRef(onFatalError)
  const refreshMarkersRef = useRef<() => void>(() => undefined)
  const userLocationMarkerRef = useRef<Marker | null>(null)
  const locationRequestRef = useRef(0)
  const fatalErrorSentRef = useRef(false)
  const [locationState, setLocationState] = useState<{
    phase: "idle" | "locating" | "success" | "error"
    message: string
  }>({ phase: "idle", message: "" })

  const locateUser = useCallback(() => {
    const map = mapRef.current
    if (!map) return
    if (!navigator.geolocation) {
      setLocationState({
        phase: "error",
        message: "当前设备不支持位置服务",
      })
      return
    }

    const request = ++locationRequestRef.current
    setLocationState({ phase: "locating", message: "正在获取您的位置" })
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        if (locationRequestRef.current !== request || mapRef.current !== map) {
          return
        }
        const center: [number, number] = [coords.longitude, coords.latitude]
        let marker = userLocationMarkerRef.current
        if (!marker) {
          marker = new Marker({
            element: createUserLocationElement(),
            anchor: "center",
          })
            .setLngLat(center)
            .addTo(map)
          userLocationMarkerRef.current = marker
        }
        marker.setLngLat(center)
        const reducedMotion = window.matchMedia?.(
          "(prefers-reduced-motion: reduce)"
        ).matches
        map.easeTo({
          center,
          zoom: Math.max(map.getZoom(), 8),
          duration: reducedMotion ? 0 : 900,
          essential: false,
        })
        setLocationState({ phase: "success", message: "已回到您的位置" })
      },
      (error) => {
        if (locationRequestRef.current !== request) return
        setLocationState({
          phase: "error",
          message: geolocationErrorMessage(error),
        })
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 30_000 }
    )
  }, [])

  useEffect(() => {
    groupsRef.current = groups
    selectedGroupKeyRef.current = selectedGroupKey
    onSelectGroupRef.current = onSelectGroup
    onViewportChangeRef.current = onViewportChange
    onFatalErrorRef.current = onFatalError
  }, [groups, onFatalError, onSelectGroup, onViewportChange, selectedGroupKey])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    container.dataset.mapState = "loading"
    const deliveryContext = createMapDeliveryContext(
      resolveMapTransportOrigin(),
      styleUrl
    )
    const resolvedStyleUrl = resolveMapStyleUrl(styleUrl, deliveryContext)
    const webglProbe = document.createElement("canvas")
    if (!webglProbe.getContext("webgl2") && !webglProbe.getContext("webgl")) {
      container.dataset.mapState = "error"
      onFatalErrorRef.current(new Error("当前浏览器不支持 WebGL 地图"))
      return
    }

    // 协议是 MapLibre 进程级单例；在应用生命周期中只注册一次，
    // 路由重挂载时继续复用 PMTiles header 与目录缓存。
    ensurePmtilesProtocol()

    let map: MapLibreMap
    const reportFatalError = (error: unknown) => {
      if (fatalErrorSentRef.current) return
      fatalErrorSentRef.current = true
      container.dataset.mapState = "error"
      onFatalErrorRef.current(mapError(error))
    }

    const initialViewport = IS_APP_TARGET
      ? exchangeMapInitialViewport()
      : DEFAULT_EXCHANGE_MAP_VIEWPORT

    try {
      map = new MapLibreMap({
        container,
        center: initialViewport.center,
        zoom: initialViewport.zoom,
        minZoom: EXCHANGE_MAP_MIN_ZOOM,
        // 公开点为 0.1 度网格（约 11 km），再放大既无信息增益，也会让
        // 区域位置在视觉上退化为近似精确位置，违反区域投影的隐私合同。
        maxZoom: EXCHANGE_MAP_MAX_ZOOM,
        bearing: 0,
        pitch: 0,
        roll: 0,
        minPitch: 0,
        maxPitch: 0,
        dragRotate: false,
        touchPitch: false,
        pitchWithRotate: false,
        rollEnabled: false,
        attributionControl: false,
        cooperativeGestures: false,
        localIdeographFontFamily,
        transformRequest: (url) => ({
          url: resolveAllowedMapResourceUrl(url, deliveryContext.scope),
        }),
      })
    } catch (error) {
      reportFatalError(error)
      return
    }

    mapRef.current = map
    map.touchZoomRotate.disableRotation()
    map.keyboard.disableRotation()
    map.addControl(new AttributionControl({ compact: true }), "bottom-left")
    container
      .querySelector<HTMLElement>(".maplibregl-ctrl-attrib-button")
      ?.click()
    map.addControl(
      new NavigationControl({ showCompass: false, showZoom: true }),
      "bottom-right"
    )

    const clearMarkers = () => {
      for (const { marker } of markersRef.current.values()) marker.remove()
      markersRef.current.clear()
    }

    const refreshMarkers = () => {
      const source = map.getSource(officeSourceId)
      if (!source) return

      const groupsByKey = new Map(
        groupsRef.current.map((group) => [group.key, group])
      )
      const seen = new Set<string>()
      const renderOfficeGroupMarker = (group: FudabaMapOfficeGroup) => {
        const groupKey = group.key
        if (seen.has(groupKey)) return
        seen.add(groupKey)
        const signature = JSON.stringify({
          offices: group.offices.map(({ id, name }) => [id, name]),
          colors: group.colors,
        })
        let rendered = markersRef.current.get(groupKey)
        if (!rendered || rendered.signature !== signature) {
          rendered?.marker.remove()
          const element = createOfficeGroupMarker(
            group,
            selectedGroupKeyRef.current === groupKey
          )
          element.addEventListener("click", () =>
            onSelectGroupRef.current(groupKey)
          )
          rendered = {
            marker: new Marker({ element, anchor: "bottom" })
              .setLngLat([group.longitude, group.latitude])
              .addTo(map),
            signature,
          }
          markersRef.current.set(groupKey, rendered)
        }
        rendered.marker.setLngLat([group.longitude, group.latitude])
      }

      for (const feature of map.querySourceFeatures(officeSourceId)) {
        if (feature.geometry.type !== "Point") continue
        const [longitude, latitude] = feature.geometry.coordinates
        if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) continue

        const isCluster = Boolean(feature.properties?.cluster)
        if (isCluster) {
          if (!(source instanceof GeoJSONSource)) continue
          const clusterId = Number(feature.properties?.cluster_id)
          const count = Number(
            feature.properties?.officeCount ?? feature.properties?.point_count
          )
          const key = `cluster:${clusterId}`
          if (!Number.isInteger(clusterId) || seen.has(key)) continue
          seen.add(key)

          const signature = `cluster:${count}`
          let rendered = markersRef.current.get(key)
          if (!rendered || rendered.signature !== signature) {
            rendered?.marker.remove()
            const element = createClusterMarker(count)
            element.addEventListener("click", () => {
              void source.getClusterExpansionZoom(clusterId).then((zoom) => {
                map.easeTo({ center: [longitude, latitude], zoom })
              })
            })
            rendered = {
              marker: new Marker({ element, anchor: "bottom" })
                .setLngLat([longitude, latitude])
                .addTo(map),
              signature,
            }
            markersRef.current.set(key, rendered)
          }
          rendered.marker.setLngLat([longitude, latitude])
          continue
        }

        const groupKey = String(feature.properties?.groupKey ?? "")
        const group = groupsByKey.get(groupKey)
        if (group) renderOfficeGroupMarker(group)
      }

      // A source can be ready to accept data before its worker tile is exposed
      // to querySourceFeatures. Keep the public locations visible in that gap.
      if (seen.size === 0) {
        for (const group of groupsRef.current) renderOfficeGroupMarker(group)
      }

      for (const [key, { marker }] of markersRef.current) {
        if (seen.has(key)) continue
        marker.remove()
        markersRef.current.delete(key)
      }
    }
    refreshMarkersRef.current = refreshMarkers
    let markerRefreshFrame: number | null = null
    const scheduleMarkerRefresh = () => {
      if (markerRefreshFrame !== null) {
        cancelAnimationFrame(markerRefreshFrame)
      }
      markerRefreshFrame = requestAnimationFrame(() => {
        markerRefreshFrame = null
        refreshMarkers()
      })
    }
    const handleOfficeSourceData = (event: MapSourceDataEvent) => {
      if (event.sourceId === officeSourceId) scheduleMarkerRefresh()
    }

    const queryViewport = () => {
      const bounds = splitViewportBounds(currentViewport(map))
      if (bounds.length) onViewportChangeRef.current(bounds)
    }

    let disposed = false
    const handleLoad = async () => {
      try {
        const chinaBoundaryDashSource =
          await getFudabaChinaBoundaryDashSource().send()
        if (disposed) return
        const canvas = map.getCanvas()
        canvas.setAttribute(
          "aria-label",
          "区域事务所地图。使用方向键移动地图，使用加减按钮缩放。"
        )
        // 基础底图在 transformStyle 阶段已经完成配色。边界合规图层需要
        // 等样式加载后创建，再重用同一套配置补齐新增图层。
        applyChinaBoundaryCompliance(map, chinaBoundaryDashSource)
        applyPortalMapPalette(map)
        // Do not wait for global `idle`: a PMTiles base map can keep loading
        // while the office source is already ready to render on iOS.
        map.on("sourcedata", handleOfficeSourceData)
        map.addSource(officeSourceId, {
          type: "geojson",
          data: featureCollection(groupsRef.current),
          cluster: true,
          clusterRadius: 56,
          clusterMaxZoom: 10,
          clusterProperties: {
            officeCount: ["+", ["get", "officeCount"]],
          },
        })
        map.addLayer({
          id: officeSourceLayerId,
          type: "circle",
          source: officeSourceId,
          paint: {
            "circle-color": ["coalesce", ["get", "accent"], "#f34e6c"],
            "circle-radius": [
              "interpolate",
              ["linear"],
              ["zoom"],
              2,
              8,
              10,
              12,
            ],
            "circle-opacity": 0.24,
            "circle-stroke-color": "#ffffff",
            "circle-stroke-opacity": 0.9,
            "circle-stroke-width": 2,
          },
        })
        queryViewport()
        container.dataset.mapState = "ready"
        scheduleMarkerRefresh()
      } catch (error) {
        if (!disposed) reportFatalError(error)
      }
    }

    const handleMoveEnd = () => {
      if (IS_APP_TARGET) {
        rememberExchangeMapViewport(currentSessionViewport(map))
      }
      queryViewport()
      scheduleMarkerRefresh()
    }
    const handleError = (event: { error: Error }) =>
      reportFatalError(event.error)

    map.on("load", handleLoad)
    map.on("moveend", handleMoveEnd)
    map.on("error", handleError)

    try {
      map.setStyle(resolvedStyleUrl, {
        transformStyle: (_previousStyle, nextStyle) =>
          applyPortalMapStyle(
            resolveMapStyleResourceUrls(nextStyle, deliveryContext)
          ),
      })
    } catch (error) {
      reportFatalError(error)
      map.remove()
      mapRef.current = null
      return
    }

    let resizeFrame: number | null = null
    const resizeMap = () => {
      if (resizeFrame !== null) cancelAnimationFrame(resizeFrame)
      resizeFrame = requestAnimationFrame(() => {
        resizeFrame = null
        map.resize()
      })
    }
    const resizeObserver = new ResizeObserver(resizeMap)
    resizeObserver.observe(container)
    window.addEventListener("resize", resizeMap, { passive: true })
    window.visualViewport?.addEventListener("resize", resizeMap, {
      passive: true,
    })
    resizeMap()

    return () => {
      disposed = true
      resizeObserver.disconnect()
      window.removeEventListener("resize", resizeMap)
      window.visualViewport?.removeEventListener("resize", resizeMap)
      if (resizeFrame !== null) cancelAnimationFrame(resizeFrame)
      if (markerRefreshFrame !== null) cancelAnimationFrame(markerRefreshFrame)
      locationRequestRef.current += 1
      userLocationMarkerRef.current?.remove()
      userLocationMarkerRef.current = null
      clearMarkers()
      map.off("load", handleLoad)
      map.off("sourcedata", handleOfficeSourceData)
      map.off("moveend", handleMoveEnd)
      map.off("error", handleError)
      if (IS_APP_TARGET) {
        rememberExchangeMapViewport(currentSessionViewport(map))
      }
      map.remove()
      mapRef.current = null
      refreshMarkersRef.current = () => undefined
    }
  }, [styleUrl])

  useEffect(() => {
    const map = mapRef.current
    const source = map?.getSource(officeSourceId)
    if (!map || !(source instanceof GeoJSONSource)) return
    source.setData(featureCollection(groups))
  }, [groups])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    for (const { marker } of markersRef.current.values()) {
      const element = marker.getElement()
      const groupKey = element.dataset.mapOfficeGroup
      if (!groupKey) continue
      const selected = groupKey === selectedGroupKey
      element.setAttribute("aria-pressed", String(selected))
      element.classList.toggle("ring-3", selected)
      element.classList.toggle("ring-primary/60", selected)
    }
  }, [selectedGroupKey])

  const locationControlOffset = IS_APP_TARGET
    ? "right-3 bottom-[calc(var(--app-floating-bottom)+8.75rem)] size-10 md:right-2.5 md:bottom-20 md:size-8"
    : "right-2.5 bottom-20"

  return (
    <div className="relative size-full min-h-0 bg-[#e8f2f4]">
      <div
        ref={containerRef}
        className="size-full min-h-0"
        data-exchange-office-map
        data-app-target={IS_APP_TARGET ? "" : undefined}
        data-map-state="loading"
        aria-label="区域事务所地图工作面"
      />

      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                variant="outline"
                size="icon"
                className={cn(
                  "absolute z-10 bg-background/95 shadow-sm backdrop-blur-sm",
                  IS_APP_TARGET && "exchange-map-app-control",
                  locationControlOffset
                )}
                aria-label="回到我的位置"
                aria-busy={locationState.phase === "locating"}
                disabled={locationState.phase === "locating"}
                onClick={locateUser}
              >
                {locationState.phase === "locating" ? (
                  <LoaderCircleIcon
                    className="animate-spin motion-reduce:animate-none"
                    aria-hidden="true"
                  />
                ) : (
                  <LocateFixedIcon aria-hidden="true" />
                )}
              </Button>
            }
          />
          <TooltipContent side="left">回到我的位置</TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <div
        className={cn(
          "pointer-events-none absolute z-10 max-w-56",
          IS_APP_TARGET
            ? "right-16 bottom-[calc(var(--app-floating-bottom)+8.75rem)] md:right-12 md:bottom-20"
            : "right-12 bottom-20"
        )}
        aria-live="polite"
      >
        {locationState.phase === "error" ? (
          <p className="rounded-md border bg-background/95 px-2.5 py-2 text-xs text-foreground shadow-sm backdrop-blur-sm">
            {locationState.message}
          </p>
        ) : (
          <span className="sr-only">{locationState.message}</span>
        )}
      </div>
    </div>
  )
}
