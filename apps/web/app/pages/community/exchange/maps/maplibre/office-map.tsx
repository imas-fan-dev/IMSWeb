import { cameraChangeSource } from "~/lib/maps/map-camera-change"
import "maplibre-gl/dist/maplibre-gl.css"

import { LoaderCircleIcon, LocateFixedIcon } from "lucide-react"
import {
  addProtocol,
  GeoJSONSource,
  Map as MapLibreMap,
  type MapSourceDataEvent,
  type MapMouseEvent,
  Marker,
  setWorkerUrl,
  type StyleSpecification,
} from "maplibre-gl"
import maplibreWorkerUrl from "maplibre-gl/dist/maplibre-gl-csp-worker.js?url"
import { Protocol } from "pmtiles"
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react"

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
import { GeolocationFailure, getCurrentCoordinates } from "~/lib/geolocation"
import { useNativeGlassControl } from "~/lib/native-glass-controls"
import { awaitMapSearch } from "~/lib/maps/map-search-abort"
import { createMapPickingEvents } from "~/lib/maps/map-picking-events"
import { cn } from "~/lib/utils"
import { createUserLocationMarker } from "~/pages/community/exchange/maps/user-location-marker"
import { createPointPickerMarker } from "../point-picker-marker"

import {
  applyChinaBoundaryCompliance,
  CHINA_CLAIM_BOUNDARY_LAYER_ID,
  CHINA_DASH_FILL_LAYER_ID,
  CHINA_DASH_LINE_LAYER_ID,
  TAIWAN_PROVINCE_LABEL_LAYER_ID,
} from "./boundary-compliance"
import {
  parseMapAttribution,
  type ExchangeMapAttribution,
} from "~/pages/community/exchange/maps/exchange-map-attribution"
import type { FudabaMapOfficeGroup } from "~/pages/community/exchange/maps/exchange-map-model"
import type { ExchangeMapInteractionProps } from "~/pages/community/exchange/maps/exchange-map-provider"
import { exchangeMapColors as palette } from "~/lib/maps/map-theme"
import {
  createClusterMarker,
  createOfficeGroupMarker,
} from "~/pages/community/exchange/maps/exchange-map-markers"
import {
  createMapDeliveryContext,
  DEFAULT_EXCHANGE_MAP_VIEWPORT,
  exchangeMapInitialViewport,
  EXCHANGE_MAP_FLOATING_GROUP,
  EXCHANGE_MAP_CLUSTER_MAX_ZOOM,
  EXCHANGE_MAP_MIN_ZOOM,
  EXCHANGE_MAP_SEARCH_ZOOM,
  rememberExchangeMapViewport,
  resolveAllowedMapResourceUrl,
  resolveMapStyleResourceUrls,
  resolveMapStyleUrl,
  splitViewportBounds,
  type ExchangeMapViewport,
  type MapViewportBounds,
} from "~/pages/community/exchange/maps/exchange-map-model"

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
  background: { "background-color": palette.background },
  "landcover-glacier": { "fill-color": palette.glacier },
  "landuse-residential": { "fill-color": palette.residential },
  "landuse-suburb": { "fill-color": palette.suburb },
  "landuse-commercial": { "fill-color": palette.commercial },
  "landuse-industrial": { "fill-color": palette.industrial },
  "landuse-cemetery": { "fill-color": palette.cemetery },
  "landuse-hospital": { "fill-color": palette.hospital },
  "landuse-school": { "fill-color": palette.school },
  "landuse-railway": { "fill-color": palette.railwayLand },
  park: { "fill-color": palette.park, "fill-opacity": 0.86 },
  "landcover-wood": { "fill-color": palette.wood, "fill-opacity": 0.78 },
  "landcover-grass": { "fill-color": palette.grass, "fill-opacity": 0.9 },
  "landcover-grass-park": {
    "fill-color": palette.parkGrass,
    "fill-opacity": 0.9,
  },
  "landcover-sand": { "fill-color": palette.sand },
  water: { "fill-color": palette.water },
  "water-intermittent": { "fill-color": palette.intermittentWater },
  building: {
    "fill-color": palette.building,
    "fill-outline-color": palette.buildingOutline,
  },
  "building-top": {
    "fill-color": palette.buildingTop,
    "fill-outline-color": palette.buildingTopOutline,
  },
  boundary_2: { "line-color": palette.boundary, "line-opacity": 0.68 },
  // 中国主张国界线与其余国界同色，视觉上不可区分。
  [CHINA_CLAIM_BOUNDARY_LAYER_ID]: {
    "line-color": palette.boundary,
    "line-opacity": 0.68,
  },
  // 南海断续线：fill 填实，outline 保证低缩放下仍可见，两者同色。
  [CHINA_DASH_FILL_LAYER_ID]: {
    "fill-color": palette.boundary,
    "fill-opacity": 0.68,
  },
  [CHINA_DASH_LINE_LAYER_ID]: {
    "line-color": palette.boundary,
    "line-opacity": 0.68,
  },
  boundary_3: { "line-color": palette.regionalBoundary, "line-opacity": 0.58 },
  boundary_disputed: {
    "line-color": palette.disputedBoundary,
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

export interface ExchangeOfficeMapProps extends ExchangeMapInteractionProps {
  styleUrl: string
}

function mapError(error: unknown) {
  return error instanceof Error ? error : new Error("地图渲染失败")
}

/**
 * The attribution notice is a licence obligation, so it is read from the
 * authoritative place MapLibre already holds: the loaded style's sources. A
 * style may carry several sources; the first non-empty notice wins.
 */
function styleAttributionSource(
  style: StyleSpecification | undefined
): string | null {
  if (!style?.sources) return null
  for (const source of Object.values(style.sources)) {
    const attribution = (source as { attribution?: unknown }).attribution
    if (typeof attribution === "string" && attribution.trim()) {
      return attribution
    }
  }
  return null
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
      "line-color": palette.waterway,
      "line-opacity": 0.84,
    })
  }
  if (roadCasingLayerIds.includes(layerId)) {
    Object.assign(paint, {
      "line-color": palette.roadCasing,
      "line-opacity": 0.58,
    })
  }
  if (minorRoadLayerIds.includes(layerId)) {
    Object.assign(paint, {
      "line-color": palette.minorRoad,
      "line-opacity": 0.88,
    })
  }
  if (collectorRoadLayerIds.includes(layerId)) {
    Object.assign(paint, {
      "line-color": palette.collectorRoad,
      "line-opacity": 0.94,
    })
  }
  if (arterialRoadLayerIds.includes(layerId)) {
    Object.assign(paint, {
      "line-color": palette.arterialRoad,
      "line-opacity": 0.96,
    })
  }
  if (motorwayLayerIds.includes(layerId)) {
    Object.assign(paint, {
      "line-color": palette.motorway,
      "line-opacity": 0.96,
    })
  }
  if (railwayLayerIds.includes(layerId)) {
    Object.assign(paint, {
      "line-color": palette.railway,
      "line-opacity": 0.5,
    })
  }
  if (labelLayerIds.includes(layerId)) {
    Object.assign(paint, {
      "text-color": palette.label,
      "text-halo-color": palette.labelHalo,
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
      "text-color": palette.cityLabel,
      "text-halo-color": palette.labelHalo,
      "text-halo-width": 1.6,
      "text-opacity": 0.94,
    })
  }
  if (waterLabelLayerIds.includes(layerId)) {
    Object.assign(paint, {
      "text-color": palette.waterLabel,
      "text-halo-color": palette.waterLabelHalo,
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

function geolocationErrorMessage(error: unknown) {
  if (!(error instanceof GeolocationFailure)) {
    return "暂时无法获取您的位置"
  }
  if (error.kind === "permission-denied") return "未获得位置权限"
  if (error.kind === "timeout") return "获取位置超时，请重试"
  if (error.kind === "unsupported") return "当前设备不支持位置服务"
  return "暂时无法获取您的位置"
}

export function ExchangeOfficeMap({
  styleUrl,
  initialViewport: suppliedViewport,
  persistViewport = true,
  onCameraChange,
  onDevicePosition,
  groups,
  selectedGroupKey,
  groupFocus,
  selectedPlace,
  pointPicker,
  occlusion,
  claimInitialLocation,
  onSelectGroup,
  onViewportChange,
  onFatalError,
  onAttributionChange,
}: ExchangeOfficeMapProps) {
  const deviceCallback = useRef(onDevicePosition)
  useEffect(() => {
    deviceCallback.current = onDevicePosition
  }, [onDevicePosition])
  const cameraCallback = useRef(onCameraChange)
  useEffect(() => {
    cameraCallback.current = onCameraChange
  }, [onCameraChange])
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const pickingRef = useRef<ReturnType<typeof createMapPickingEvents> | null>(
    null
  )
  const pointPickerRef = useRef(pointPicker)
  useLayoutEffect(() => {
    pointPickerRef.current = pointPicker
  }, [pointPicker])
  const markersRef = useRef(new Map<string, RenderedMarker>())
  const groupsRef = useRef(groups)
  const selectedGroupKeyRef = useRef(selectedGroupKey)
  const onSelectGroupRef = useRef(onSelectGroup)
  const onViewportChangeRef = useRef(onViewportChange)
  const onFatalErrorRef = useRef(onFatalError)
  const onAttributionChangeRef = useRef(onAttributionChange)
  const attributionSignatureRef = useRef<string | null>(null)
  const refreshMarkersRef = useRef<() => void>(() => undefined)
  const userLocationMarkerRef = useRef<Marker | null>(null)
  const userLocationContentRef = useRef<ReturnType<
    typeof createUserLocationMarker
  > | null>(null)
  const searchMarkerRef = useRef<Marker | null>(null)
  const occlusionRef = useRef(occlusion)
  const webSelectedGroupKey = IS_APP_TARGET ? null : selectedGroupKey
  useEffect(() => {
    occlusionRef.current = occlusion
  }, [occlusion])
  const locationRequestRef = useRef(0)
  const fatalErrorSentRef = useRef(false)
  const [locationState, setLocationState] = useState<{
    phase: "idle" | "locating" | "success" | "error"
    message: string
  }>({ phase: "idle", message: "" })
  const [mapSize, setMapSize] = useState({ width: 0, height: 0 })
  const [mapReady, setMapReady] = useState(false)
  useEffect(() => {
    const element = containerRef.current
    if (!element) return
    const measure = () =>
      setMapSize({ width: element.clientWidth, height: element.clientHeight })
    measure()
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure)
    observer?.observe(element)
    window.addEventListener("resize", measure)
    return () => {
      observer?.disconnect()
      window.removeEventListener("resize", measure)
    }
  }, [])

  const locateUser = useCallback(
    async (initialSignal?: AbortSignal) => {
      const map = mapRef.current
      if (!map) return

      if (!initialSignal) claimInitialLocation?.()
      const request = ++locationRequestRef.current
      userLocationContentRef.current?.dismissHint()
      setLocationState({
        phase: "locating",
        message: initialSignal ? "" : "正在获取您的位置",
      })
      try {
        const coordinates = await (initialSignal
          ? awaitMapSearch(getCurrentCoordinates(), initialSignal)
          : getCurrentCoordinates())
        if (locationRequestRef.current !== request || mapRef.current !== map) {
          return
        }
        if (initialSignal?.aborted) {
          setLocationState({ phase: "idle", message: "" })
          return
        }

        const center: [number, number] = [
          coordinates.longitude,
          coordinates.latitude,
        ]
        deviceCallback.current?.(center)
        let marker = userLocationMarkerRef.current
        if (!marker) {
          const content = createUserLocationMarker()
          userLocationContentRef.current = content
          marker = new Marker({
            element: content.element,
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
        setLocationState({
          phase: "success",
          message: initialSignal ? "" : "定位完成",
        })
        if (!initialSignal) userLocationContentRef.current?.showHint()
      } catch (error) {
        if (locationRequestRef.current !== request || mapRef.current !== map) {
          return
        }
        setLocationState({
          phase: initialSignal ? "idle" : "error",
          message: initialSignal ? "" : geolocationErrorMessage(error),
        })
      }
    },
    [claimInitialLocation]
  )

  const { controlRef: locateControlRef, refreshGeometry } =
    useNativeGlassControl(
      persistViewport === false ? "office-picker-locate" : "locate",
      {
        kind: "icon-button",
        icon:
          locationState.phase === "locating" ? "loader-circle" : "locate-fixed",
        label: "回到我的位置",
        group:
          persistViewport === false
            ? "office-picker"
            : EXCHANGE_MAP_FLOATING_GROUP,
        disabled: locationState.phase === "locating",
      },
      () => {
        void locateUser()
      }
    )

  useLayoutEffect(() => {
    refreshGeometry()
  }, [
    refreshGeometry,
    occlusion?.x,
    occlusion?.y,
    occlusion?.width,
    occlusion?.height,
    mapSize.width,
    mapSize.height,
  ])

  useEffect(() => {
    groupsRef.current = groups
    selectedGroupKeyRef.current = selectedGroupKey
    onSelectGroupRef.current = onSelectGroup
    onViewportChangeRef.current = onViewportChange
    onFatalErrorRef.current = onFatalError
    onAttributionChangeRef.current = onAttributionChange
  }, [
    groups,
    onAttributionChange,
    onFatalError,
    onSelectGroup,
    onViewportChange,
    selectedGroupKey,
  ])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    setLocationState({ phase: "idle", message: "" })
    setMapReady(false)
    container.dataset.mapState = "loading"
    // `styledata` fires repeatedly for one style (source and layer edits), so
    // the notice is deduplicated by content and only crosses the page boundary
    // when it actually changes.
    const emitAttribution = (value: ExchangeMapAttribution | null) => {
      const signature = value ? JSON.stringify(value) : ""
      if (attributionSignatureRef.current === signature) return
      attributionSignatureRef.current = signature
      onAttributionChangeRef.current?.(value)
    }
    const deliveryContext = createMapDeliveryContext(
      resolveMapTransportOrigin(),
      styleUrl
    )
    const resolvedStyleUrl = resolveMapStyleUrl(styleUrl, deliveryContext)
    const webglProbe = document.createElement("canvas")
    if (!webglProbe.getContext("webgl2") && !webglProbe.getContext("webgl")) {
      container.dataset.mapState = "error"
      emitAttribution(null)
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
      setMapReady(false)
      emitAttribution(null)
      onFatalErrorRef.current(mapError(error))
    }

    const initialViewport =
      suppliedViewport ??
      (IS_APP_TARGET
        ? exchangeMapInitialViewport()
        : DEFAULT_EXCHANGE_MAP_VIEWPORT)

    try {
      map = new MapLibreMap({
        container,
        center: initialViewport.center,
        zoom: initialViewport.zoom,
        minZoom: EXCHANGE_MAP_MIN_ZOOM,
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
    const picking = createMapPickingEvents(container)
    pickingRef.current = picking
    map.touchZoomRotate.disableRotation()
    map.keyboard.disableRotation()

    const readAttribution = () => {
      const style = map.getStyle()
      if (!style) return
      emitAttribution(parseMapAttribution(styleAttributionSource(style)))
    }
    const handleStyleData = () => readAttribution()
    map.on("styledata", handleStyleData)
    map.on("style.load", handleStyleData)
    // The style can already be attached before the listeners are registered.
    readAttribution()

    const clearMarkers = () => {
      for (const { marker } of markersRef.current.values()) marker.remove()
      markersRef.current.clear()
    }

    let renderedGroups: readonly FudabaMapOfficeGroup[] | null = null
    const refreshMarkers = () => {
      const source = map.getSource(officeSourceId)
      if (!source) return
      if (!groupsRef.current.length) {
        clearMarkers()
        renderedGroups = groupsRef.current
        return
      }
      const features = map.querySourceFeatures(officeSourceId)
      // Worker tiles can briefly disappear during a pan. Keep the committed
      // representation until features or actual office data change.
      if (
        !features.length &&
        renderedGroups === groupsRef.current &&
        markersRef.current.size &&
        (IS_APP_TARGET ||
          !selectedGroupKeyRef.current ||
          markersRef.current.has(selectedGroupKeyRef.current))
      )
        return

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

      for (const feature of features) {
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

      if (!IS_APP_TARGET && selectedGroupKeyRef.current) {
        const selected = groupsByKey.get(selectedGroupKeyRef.current)
        if (selected) renderOfficeGroupMarker(selected)
      }

      for (const [key, { marker }] of markersRef.current) {
        if (seen.has(key)) continue
        marker.remove()
        markersRef.current.delete(key)
      }
      renderedGroups = groupsRef.current
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
          "区域事务所地图。使用方向键移动地图，使用双指捏合、双击或键盘加号减号缩放。"
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
          clusterMaxZoom: EXCHANGE_MAP_CLUSTER_MAX_ZOOM,
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
        const center = map.getCenter()
        cameraCallback.current?.([center.lng, center.lat], {
          origin: "programmatic",
        })
        container.dataset.mapState = "ready"
        setMapReady(true)
        scheduleMarkerRefresh()
        const initialSignal = claimInitialLocation?.()
        if (initialSignal && !initialSignal.aborted)
          void locateUser(initialSignal)
      } catch (error) {
        if (!disposed) reportFatalError(error)
      }
    }

    const handleMoveEnd = (event?: { originalEvent?: unknown }) => {
      const center = map.getCenter()
      cameraCallback.current?.(
        [center.lng, center.lat],
        cameraChangeSource(event)
      )
      if (IS_APP_TARGET && persistViewport) {
        rememberExchangeMapViewport(currentSessionViewport(map))
      }
      queryViewport()
      scheduleMarkerRefresh()
    }
    const handleError = (event: { error: Error }) =>
      reportFatalError(event.error)
    const handlePick = (event: MapMouseEvent) => {
      const picker = pointPickerRef.current
      if (
        !disposed &&
        container.dataset.mapState === "ready" &&
        picker &&
        !picker.disabled &&
        picking.shouldPick(event.originalEvent)
      )
        picker.onPick(
          { kind: "wgs84", position: [event.lngLat.lng, event.lngLat.lat] },
          "click"
        )
    }

    map.on("load", handleLoad)
    map.on("moveend", handleMoveEnd)
    map.on("error", handleError)
    map.on("click", handlePick)

    try {
      map.setStyle(resolvedStyleUrl, {
        transformStyle: (_previousStyle, nextStyle) =>
          applyPortalMapStyle(
            resolveMapStyleResourceUrls(nextStyle, deliveryContext)
          ),
      })
    } catch (error) {
      reportFatalError(error)
      picking.dispose()
      pickingRef.current = null
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
      userLocationContentRef.current?.dismissHint()
      userLocationContentRef.current = null
      userLocationMarkerRef.current?.remove()
      userLocationMarkerRef.current = null
      clearMarkers()
      map.off("load", handleLoad)
      map.off("sourcedata", handleOfficeSourceData)
      map.off("moveend", handleMoveEnd)
      map.off("error", handleError)
      map.off("click", handlePick)
      map.off("styledata", handleStyleData)
      map.off("style.load", handleStyleData)
      emitAttribution(null)
      picking.dispose()
      pickingRef.current = null
      if (IS_APP_TARGET && persistViewport) {
        rememberExchangeMapViewport(currentSessionViewport(map))
      }
      map.remove()
      mapRef.current = null
      refreshMarkersRef.current = () => undefined
    }
  }, [
    styleUrl,
    claimInitialLocation,
    locateUser,
    suppliedViewport,
    persistViewport,
  ])

  const pickerEnabled = Boolean(pointPicker)
  useEffect(() => {
    const map = mapRef.current
    searchMarkerRef.current?.remove()
    searchMarkerRef.current = null
    if (!map || !selectedPlace) return
    if (selectedPlace.target.kind !== "wgs84") return
    const center = selectedPlace.target.position
    const element = document.createElement("div")
    element.className =
      "size-5 rounded-full border-3 border-background bg-primary shadow-md"
    element.setAttribute("role", "img")
    element.setAttribute("aria-label", `搜索地点：${selectedPlace.label}`)
    if (!pickerEnabled)
      searchMarkerRef.current = new Marker({ element, anchor: "center" })
        .setLngLat(center)
        .addTo(map)
    map.easeTo({
      center,
      zoom: selectedPlace.zoom ?? EXCHANGE_MAP_SEARCH_ZOOM,
      padding: occlusionRef.current
        ? occlusionRef.current.width <
          (containerRef.current?.clientWidth ?? 0) * 0.65
          ? {
              left: occlusionRef.current.x + occlusionRef.current.width + 12,
              right: 12,
              top: 12,
              bottom: 12,
            }
          : {
              left: 12,
              right: 12,
              top: 12,
              bottom: Math.max(
                12,
                (containerRef.current?.clientHeight ?? 0) -
                  occlusionRef.current.y +
                  12
              ),
            }
        : { left: 0, right: 0, top: 0, bottom: 0 },
      duration:
        !persistViewport ||
        window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
          ? 0
          : 900,
      essential: false,
    })
    return () => {
      searchMarkerRef.current?.remove()
      searchMarkerRef.current = null
    }
  }, [selectedPlace, styleUrl, persistViewport, pickerEnabled])

  const pickerTarget = pointPicker?.target
  const pickerDisabled = pointPicker?.disabled ?? true
  useEffect(() => {
    const map = mapRef.current
    const picking = pickingRef.current
    if (
      !mapReady ||
      !map ||
      !picking ||
      !pickerTarget ||
      pickerTarget.kind !== "wgs84"
    )
      return
    let disposed = false
    let dragging = false
    const marker = new Marker({
      element: createPointPickerMarker(pickerDisabled),
      anchor: "bottom",
      draggable: !pickerDisabled,
    })
      .setLngLat(pickerTarget.position)
      .addTo(map)
    const activePicker = () => {
      const picker = pointPickerRef.current
      return !disposed && mapRef.current === map && picker && !picker.disabled
        ? picker
        : null
    }
    const start = () => {
      if (!activePicker()) return
      dragging = true
      picking.startDrag()
      activePicker()?.onPickStart?.()
    }
    const end = () => {
      if (disposed) return
      dragging = false
      picking.endDrag()
      const position = marker.getLngLat()
      activePicker()?.onPick(
        { kind: "wgs84", position: [position.lng, position.lat] },
        "drag"
      )
    }
    if (!pickerDisabled) {
      marker.on("dragstart", start)
      marker.on("dragend", end)
    }
    return () => {
      disposed = true
      if (dragging) picking.endDrag()
      marker.off("dragstart", start)
      marker.off("dragend", end)
      marker.remove()
    }
  }, [pickerTarget, pickerDisabled, styleUrl, mapReady])

  useEffect(() => {
    const map = mapRef.current
    const source = map?.getSource(officeSourceId)
    if (!map || !(source instanceof GeoJSONSource)) return
    source.setData(
      featureCollection(
        webSelectedGroupKey
          ? groups.filter((group) => group.key !== webSelectedGroupKey)
          : groups
      )
    )
  }, [groups, webSelectedGroupKey])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !groupFocus || groupFocus.key !== selectedGroupKey) return
    const group = groupsRef.current.find((item) => item.key === groupFocus.key)
    if (!group) return
    map.easeTo({
      center: [group.longitude, group.latitude],
      duration:
        !persistViewport ||
        window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
          ? 0
          : 900,
      essential: false,
    })
  }, [groupFocus, selectedGroupKey, persistViewport])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (!IS_APP_TARGET) refreshMarkersRef.current()
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

  // Both pill segments share one size and one inline offset: the native capsule
  // spans the union of the two frames, so any difference would leave a segment
  // off-centre inside its own glass.
  const locationControlOffset = IS_APP_TARGET
    ? "right-3 bottom-[calc(var(--app-floating-bottom)+3rem)] size-12 md:right-2.5 md:bottom-[calc(var(--app-floating-bottom)+2.5rem)] md:size-10"
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

      <div
        className={
          occlusion
            ? cn(
                "exchange-map-side-controls",
                IS_APP_TARGET && "exchange-map-app-surface"
              )
            : "contents"
        }
        data-exchange-side-controls={occlusion ? "" : undefined}
        style={
          occlusion
            ? {
                bottom:
                  occlusion.width < mapSize.width * 0.65
                    ? 12
                    : Math.max(12, mapSize.height - occlusion.y + 12),
              }
            : undefined
        }
      >
        <div data-exchange-refresh-anchor />
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  ref={locateControlRef}
                  type="button"
                  variant="outline"
                  size="icon"
                  className={cn(
                    "absolute z-10",
                    IS_APP_TARGET
                      ? "exchange-map-app-control exchange-map-app-surface exchange-map-app-pill-top"
                      : "bg-background/95 shadow-sm backdrop-blur-sm",
                    locationControlOffset
                  )}
                  aria-label="回到我的位置"
                  data-native-glass-control="locate"
                  aria-busy={locationState.phase === "locating"}
                  disabled={locationState.phase === "locating"}
                  onClick={() => void locateUser()}
                >
                  {locationState.phase === "locating" ? (
                    <LoaderCircleIcon
                      className="size-5 animate-spin motion-reduce:animate-none"
                      aria-hidden="true"
                    />
                  ) : (
                    <LocateFixedIcon className="size-5" aria-hidden="true" />
                  )}
                </Button>
              }
            />
            <TooltipContent side="left">回到我的位置</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      <div
        className={cn(
          "pointer-events-none absolute z-10 max-w-56",
          IS_APP_TARGET
            ? "right-16 bottom-[calc(var(--app-floating-bottom)+3rem)] md:right-12 md:bottom-[calc(var(--app-floating-bottom)+2.5rem)]"
            : "right-12 bottom-20"
        )}
        aria-live="polite"
        style={
          occlusion
            ? {
                bottom:
                  occlusion.width < mapSize.width * 0.65
                    ? 12
                    : Math.max(12, mapSize.height - occlusion.y + 12),
                right: 64,
              }
            : undefined
        }
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
