import "mapbox-gl/dist/mapbox-gl.css"
import mapboxgl from "mapbox-gl"
import { IS_APP_TARGET } from "~/lib/app-target"
import type {
  MapDriver,
  MapView,
  MapFocusOptions,
  MapPosition,
} from "~/lib/maps/map-engine"
import { mapSearchPosition } from "~/lib/maps/map-search"
import { assertMapActive, createMapLifecycle } from "~/lib/maps/map-lifecycle"
import type { MapboxConfig } from "~/lib/maps/providers/mapbox"
import { rememberExchangeMapViewport } from "./exchange-map-model"
import { applyMapboxPortalTheme } from "./mapbox-map-theme"
import {
  applyMapboxLocalLabels,
  MAPBOX_LOCAL_LANGUAGE,
} from "./mapbox-map-language"

export function createMapboxDriver(config: MapboxConfig): MapDriver {
  return {
    id: "mapbox",
    containerClassName:
      "[&_.mapboxgl-ctrl-bottom-left]:bottom-(--map-attribution-bottom)! [&_.mapboxgl-ctrl-bottom-left]:left-(--map-attribution-left)! [&_.mapboxgl-ctrl-bottom-right]:bottom-(--map-attribution-bottom)! [&_.mapboxgl-ctrl-bottom-right]:right-(--map-attribution-right)!",
    async open(container, options) {
      assertMapActive(options.signal)
      const map = new mapboxgl.Map({
        container,
        accessToken: config.accessToken,
        style: config.styleUrl,
        center: options.initialTarget?.position ?? options.viewport.center,
        zoom: options.viewport.zoom,
        minZoom: options.minZoom,
        projection: "mercator",
        bearing: 0,
        pitch: 0,
        maxPitch: 0,
        dragRotate: false,
        touchPitch: false,
        pitchWithRotate: false,
        trackResize: true,
        keyboard: true,
        attributionControl: false,
        logoPosition: "bottom-left",
        language: MAPBOX_LOCAL_LANGUAGE,
        // A falsy value uses the style's published glyphs, including CJK fonts.
        localIdeographFontFamily: "",
      })
      let searchViewport = false
      const retain = () => {
        // Temporary geocoding coordinates must not enter sessionStorage either.
        if (
          !IS_APP_TARGET ||
          options.persistViewport === false ||
          searchViewport
        )
          return
        const center = map.getCenter()
        rememberExchangeMapViewport({
          center: [center.lng, center.lat],
          zoom: map.getZoom(),
        })
      }
      let initialized = false
      const lifecycle = createMapLifecycle(options.signal, () => {
        if (initialized) retain()
        map.remove()
      })
      try {
        if (mapboxgl.getRTLTextPluginStatus() === "unavailable") {
          mapboxgl.setRTLTextPlugin(
            "https://api.mapbox.com/mapbox-gl-js/plugins/mapbox-gl-rtl-text/v0.4.0/mapbox-gl-rtl-text.js",
            (error) => {
              if (error && lifecycle.active) options.onResourceError()
            },
            true
          )
        }
        const change = () => {
          if (!lifecycle.active || !initialized) return
          retain()
          options.onChange()
        }
        const focus = async (
          position: MapPosition,
          { zoom, duration, signal }: MapFocusOptions,
          fromSearch = false
        ) => {
          lifecycle.assertActive()
          if (signal?.aborted) return
          searchViewport = fromSearch
          map.easeTo({ zoom, center: position, duration, essential: false })
        }
        map.on("style.load", () => {
          if (!lifecycle.active) return
          applyMapboxPortalTheme(map, config.styleUrl)
          applyMapboxLocalLabels(map)
        })
        map.on("load", () => {
          if (!lifecycle.active) return
          initialized = true
          lifecycle.complete()
        })
        map.on("moveend", change)
        map.on("zoomend", change)
        map.on("error", () => {
          if (lifecycle.active) options.onResourceError()
        })
        map.touchZoomRotate.disableRotation()
        map.keyboard.disableRotation()
        const view: MapView = {
          readCamera() {
            lifecycle.assertActive()
            const center = map.getCenter()
            return {
              target: { kind: "wgs84", position: [center.lng, center.lat] },
              zoom: map.getZoom(),
            }
          },
          read() {
            lifecycle.assertActive()
            const bounds = map.getBounds()
            if (!bounds) throw new Error("Mapbox 地图范围尚未就绪")
            return {
              zoom: map.getZoom(),
              bounds: {
                west: bounds.getWest(),
                south: bounds.getSouth(),
                east: bounds.getEast(),
                north: bounds.getNorth(),
              },
            }
          },
          async project(positions) {
            lifecycle.assertActive()
            return positions.map((position) => {
              const point = map.project(position)
              return { x: point.x, y: point.y }
            })
          },
          async addMarker({ position, element, anchor }) {
            lifecycle.assertActive()
            // Mapbox otherwise gives supplied native buttons an image role.
            if (element.tagName === "BUTTON" && !element.hasAttribute("role"))
              element.setAttribute("role", "button")
            const marker = new mapboxgl.Marker({ element, anchor })
              .setLngLat(position)
              .addTo(map)
            return lifecycle.ownMarker(() => marker.remove())
          },
          focus,
          async addSearchMarker({ target, element, anchor }) {
            return view.addMarker({
              position: mapSearchPosition(target),
              element,
              anchor,
            })
          },
          async focusSearch(target, options) {
            return focus(mapSearchPosition(target), options, true)
          },
          panBy({ x, y }, duration) {
            lifecycle.assertActive()
            map.panBy([-x, -y], { duration })
          },
          resize() {
            if (lifecycle.active) map.resize()
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
