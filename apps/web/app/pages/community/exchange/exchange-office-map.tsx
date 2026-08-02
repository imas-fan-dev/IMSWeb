import "maplibre-gl/dist/maplibre-gl.css"

import {
  GeoJSONSource,
  Map as MapLibreMap,
  Marker,
  NavigationControl,
  setWorkerUrl,
} from "maplibre-gl"
import maplibreWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url"
import { useEffect, useRef } from "react"

import type { FudabaMapOfficeGroup } from "./exchange-map-model"
import {
  resolveSameOriginMapResourceUrl,
  splitViewportBounds,
  type MapViewportBounds,
} from "./exchange-map-model"

const officeSourceId = "fudaba-regional-offices"
const officeSourceLayerId = "fudaba-regional-offices-hit-area"

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
  const fatalErrorSentRef = useRef(false)

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

    const webglProbe = document.createElement("canvas")
    if (!webglProbe.getContext("webgl2")) {
      onFatalErrorRef.current(new Error("当前浏览器不支持 WebGL 2 地图"))
      return
    }

    let map: MapLibreMap
    const reportFatalError = (error: unknown) => {
      if (fatalErrorSentRef.current) return
      fatalErrorSentRef.current = true
      onFatalErrorRef.current(mapError(error))
    }

    try {
      map = new MapLibreMap({
        container,
        style: styleUrl,
        center: [104, 35],
        zoom: container.clientWidth < 640 ? 2.2 : 3.2,
        minZoom: 2,
        maxZoom: 14,
        cooperativeGestures: true,
        transformRequest: (url) => ({
          url: resolveSameOriginMapResourceUrl(url, window.location.origin),
        }),
      })
    } catch (error) {
      reportFatalError(error)
      return
    }

    mapRef.current = map
    map.addControl(new NavigationControl({ showCompass: false }), "top-right")

    const clearMarkers = () => {
      for (const { marker } of markersRef.current.values()) marker.remove()
      markersRef.current.clear()
    }

    const refreshMarkers = () => {
      const source = map.getSource(officeSourceId)
      if (!(source instanceof GeoJSONSource)) return

      const groupsByKey = new Map(
        groupsRef.current.map((group) => [group.key, group])
      )
      const seen = new Set<string>()

      for (const feature of map.querySourceFeatures(officeSourceId)) {
        if (feature.geometry.type !== "Point") continue
        const [longitude, latitude] = feature.geometry.coordinates
        if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) continue

        const isCluster = Boolean(feature.properties?.cluster)
        if (isCluster) {
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
        if (!group || seen.has(groupKey)) continue
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

      for (const [key, { marker }] of markersRef.current) {
        if (seen.has(key)) continue
        marker.remove()
        markersRef.current.delete(key)
      }
    }
    refreshMarkersRef.current = refreshMarkers

    const queryViewport = () => {
      const bounds = splitViewportBounds(currentViewport(map))
      if (bounds.length) onViewportChangeRef.current(bounds)
    }

    const handleLoad = () => {
      const canvas = map.getCanvas()
      canvas.setAttribute(
        "aria-label",
        "区域事务所地图。使用方向键移动地图，使用加减按钮缩放。"
      )
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
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 2, 8, 10, 12],
          "circle-opacity": 0.24,
          "circle-stroke-color": "#ffffff",
          "circle-stroke-opacity": 0.9,
          "circle-stroke-width": 2,
        },
      })
      queryViewport()
      map.once("idle", refreshMarkers)
    }

    const handleMoveEnd = () => {
      queryViewport()
      map.once("idle", refreshMarkers)
    }
    const handleError = (event: { error: Error }) =>
      reportFatalError(event.error)

    map.on("load", handleLoad)
    map.on("moveend", handleMoveEnd)
    map.on("error", handleError)

    const resizeObserver = new ResizeObserver(() => map.resize())
    resizeObserver.observe(container)

    return () => {
      resizeObserver.disconnect()
      clearMarkers()
      map.off("load", handleLoad)
      map.off("moveend", handleMoveEnd)
      map.off("error", handleError)
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
    map.once("idle", () => refreshMarkersRef.current())
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

  return (
    <div
      ref={containerRef}
      className="size-full bg-muted/35"
      aria-label="区域事务所地图工作面"
    />
  )
}
