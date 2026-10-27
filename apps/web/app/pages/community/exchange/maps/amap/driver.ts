import { IS_APP_TARGET } from "~/lib/app-target"
import type {
  MapDriver,
  MapView,
  MapFocusOptions,
  MapPosition,
  MapMarkerOptions,
} from "~/lib/maps/map-engine"
import { mapSearchPosition } from "~/lib/maps/map-search"
import { assertMapActive, createMapLifecycle } from "~/lib/maps/map-lifecycle"
import { createMapPickingEvents } from "~/lib/maps/map-picking-events"
import { exchangeAMapStyle, type AMapConfig } from "~/lib/maps/providers/amap"
import { loadAMapSdk, type AMapSdk, type AMapNativeMap } from "./sdk"
import { amapQueryBounds, convertAMapPositions } from "./coordinates"
import { installAMapPortalTheme } from "./theme"
import {
  exchangeMapProviderViewport,
  rememberExchangeMapProviderViewport,
} from "~/pages/community/exchange/maps/exchange-map-model"

export function createAMapDriver(
  config: AMapConfig,
  presentation?: {
    zoomOffset: number
    install(sdk: AMapSdk, map: AMapNativeMap): () => void
  }
): MapDriver {
  const zoomOffset = presentation?.zoomOffset ?? 0
  return {
    id: "amap",
    containerClassName:
      "[&_.amap-copyright]:bottom-[calc(var(--map-attribution-bottom)+24px)]! [&_.amap-copyright]:left-(--map-attribution-left)! [&_.amap-logo]:bottom-(--map-attribution-bottom)! [&_.amap-logo]:left-(--map-attribution-left)!",
    async open(container, options) {
      assertMapActive(options.signal)
      const sdk = await loadAMapSdk(config)
      assertMapActive(options.signal)
      const retained =
        IS_APP_TARGET && !options.initialTarget
          ? exchangeMapProviderViewport("amap")
          : null
      const center = options.initialTarget
        ? options.initialTarget.kind === "native" &&
          options.initialTarget.provider === "amap"
          ? options.initialTarget.position
          : (
              await convertAMapPositions(sdk, [options.initialTarget.position])
            )[0]!
        : (retained?.center ??
          (await convertAMapPositions(sdk, [options.viewport.center]))[0]!)
      assertMapActive(options.signal)
      const map = new sdk.Map(container, {
        center,
        zoom: retained?.zoom ?? options.viewport.zoom + zoomOffset,
        mapStyle: exchangeAMapStyle(config.mapStyle),
        viewMode: "2D",
        rotateEnable: false,
        pitchEnable: false,
        keyboardEnable: true,
        dragEnable: true,
        // Keep both programmatic and user zoom enabled in the sole map engine.
        zoomEnable: true,
        scrollWheel: true,
        doubleClickZoom: true,
        resizeEnable: true,
      })
      const picking = options.onMapClick
        ? createMapPickingEvents(container)
        : null
      let searchViewport = false
      const retain = () => {
        if (
          !IS_APP_TARGET ||
          options.persistViewport === false ||
          searchViewport
        )
          return
        const point = map.getCenter()
        rememberExchangeMapProviderViewport("amap", {
          center: [point.getLng(), point.getLat()],
          zoom: map.getZoom(),
        })
      }
      let initialized = false
      let removeLayers: (() => void) | undefined
      const lifecycle = createMapLifecycle(options.signal, () => {
        if (initialized) retain()
        picking?.dispose()
        try {
          removeLayers?.()
        } finally {
          map.destroy()
        }
      })
      try {
        map.setZooms([options.minZoom + zoomOffset, map.getZooms()[1]])
        const removeTheme = installAMapPortalTheme(sdk, map)
        removeLayers = removeTheme
        const removePresentation = presentation?.install(sdk, map)
        removeLayers = () => {
          try {
            removePresentation?.()
          } finally {
            removeTheme()
          }
        }
        let focusRequest = 0
        const focusTarget = async (
          resolve: () => Promise<MapPosition>,
          { zoom, duration, signal }: MapFocusOptions,
          fromSearch = false
        ) => {
          lifecycle.assertActive()
          if (signal?.aborted) return false as const
          const request = ++focusRequest
          const point = await resolve()
          lifecycle.assertActive()
          if (signal?.aborted || request !== focusRequest) return false as const
          searchViewport = fromSearch
          map.setZoomAndCenter(
            zoom + zoomOffset,
            point,
            duration === 0,
            duration
          )
        }
        const change = () => {
          if (!lifecycle.active || !initialized) return
          retain()
          options.onChange()
        }
        map.on("complete", () => {
          if (!lifecycle.active) return
          initialized = true
          lifecycle.complete()
        })
        map.on("moveend", change)
        map.on("zoomend", change)
        map.on("click", (event) => {
          const point = event?.lnglat
          if (
            lifecycle.active &&
            initialized &&
            point &&
            picking?.shouldPick(event?.originEvent)
          )
            options.onMapClick?.({
              kind: "native",
              provider: "amap",
              position: [point.getLng(), point.getLat()],
            })
        })
        map.on("movestart", () => {
          focusRequest++
        })
        map.on("zoomstart", () => {
          focusRequest++
        })
        map.on("error", () => {
          if (lifecycle.active) options.onResourceError()
        })
        const addNativeMarker = (
          position: MapPosition,
          markerOptions: MapMarkerOptions
        ) => {
          const { element, anchor, draggable, onDragStart, onDragEnd } =
            markerOptions
          lifecycle.assertActive()
          const marker = new sdk.Marker({
            map,
            position,
            content: element,
            anchor: anchor === "bottom" ? "bottom-center" : "center",
            draggable,
          })
          let dragging = false
          let removed = false
          const start = () => {
            if (!lifecycle.active || removed) return
            dragging = true
            picking?.startDrag()
            onDragStart?.()
          }
          const end = () => {
            if (!lifecycle.active || removed) return
            dragging = false
            picking?.endDrag()
            const point = marker.getPosition?.()
            if (point)
              onDragEnd?.({
                kind: "native",
                provider: "amap",
                position: [point.getLng(), point.getLat()],
              })
          }
          if (draggable) {
            marker.on?.("dragstart", start)
            marker.on?.("dragend", end)
          }
          return lifecycle.ownMarker(() => {
            removed = true
            if (dragging) picking?.endDrag()
            if (draggable) {
              marker.off?.("dragstart", start)
              marker.off?.("dragend", end)
            }
            marker.setMap(null)
          })
        }
        const view: MapView = {
          readCamera() {
            lifecycle.assertActive()
            const point = map.getCenter()
            return {
              target: {
                kind: "native",
                provider: "amap",
                position: [point.getLng(), point.getLat()],
              },
              zoom: map.getZoom() - zoomOffset,
            }
          },
          read() {
            lifecycle.assertActive()
            const bounds = map.getBounds()
            const sw = bounds.getSouthWest(),
              ne = bounds.getNorthEast()
            return {
              zoom: map.getZoom() - zoomOffset,
              bounds: amapQueryBounds({
                west: sw.getLng(),
                south: sw.getLat(),
                east: ne.getLng(),
                north: ne.getLat(),
              }),
            }
          },
          async project(positions) {
            lifecycle.assertActive()
            const points = await convertAMapPositions(sdk, positions)
            lifecycle.assertActive()
            return points.map((point) => {
              const pixel = map.lngLatToContainer(point)
              return { x: pixel.getX(), y: pixel.getY() }
            })
          },
          async addMarker({ position, ...markerOptions }) {
            lifecycle.assertActive()
            const [point] = await convertAMapPositions(sdk, [position])
            lifecycle.assertActive()
            return addNativeMarker(point!, markerOptions)
          },
          focus(position, options) {
            return focusTarget(
              async () => (await convertAMapPositions(sdk, [position]))[0]!,
              options
            )
          },
          async addSearchMarker({ target, ...markerOptions }) {
            if (target.kind === "wgs84")
              return view.addMarker({
                position: target.position,
                ...markerOptions,
              })
            lifecycle.assertActive()
            return addNativeMarker(
              mapSearchPosition(target, "amap"),
              markerOptions
            )
          },
          focusSearch(target, options) {
            return focusTarget(
              async () =>
                target.kind === "wgs84"
                  ? (await convertAMapPositions(sdk, [target.position]))[0]!
                  : mapSearchPosition(target, "amap"),
              options,
              true
            )
          },
          panBy({ x, y }, duration) {
            lifecycle.assertActive()
            map.panBy(x, y, duration)
          },
          resize() {
            if (lifecycle.active) map.resize?.()
          },
          destroy: lifecycle.close,
        }
        await lifecycle.ready
        return view
      } catch (error) {
        lifecycle.close()
        throw error
      }
    },
  }
}
