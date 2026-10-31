import { resolveMapTransportOrigin } from "~/lib/api"
import type { AMapConfig } from "~/lib/maps/providers/amap"
import type { MapPosition } from "~/lib/maps/map-engine"
import { MapDisplayError } from "~/lib/maps/map-errors"

export const AMAP_DOMAIN_DENIED_MESSAGE =
  "高德地图未授权当前网站，请联系管理员检查域名白名单。"

interface AMapLngLat {
  getLng(): number
  getLat(): number
}
export interface AMapMapEvent {
  lnglat?: AMapLngLat
  originEvent?: Event
}
export interface AMapNativeMap {
  on(event: string, listener: (event?: AMapMapEvent) => void): void
  off?(event: string, listener: (event?: AMapMapEvent) => void): void
  getBounds(): { getSouthWest(): AMapLngLat; getNorthEast(): AMapLngLat }
  getCenter(): AMapLngLat
  getZoom(): number
  getZooms(): MapPosition
  setZooms(zooms: MapPosition): void
  lngLatToContainer(position: MapPosition): { getX(): number; getY(): number }
  setZoomAndCenter(
    zoom: number,
    center: MapPosition,
    immediately?: boolean,
    duration?: number
  ): void
  panBy(x: number, y: number, duration?: number): void
  add(layer: AMapFlexibleLayer): void
  resize?(): void
  destroy(): void
}

export interface AMapFlexibleLayer {
  destroy(): void
}

export interface AMapDistrictLayer {
  setMap(map: AMapNativeMap | null): void
  setStyles(styles: {
    fill: string
    "nation-stroke": string
    "stroke-width": number
    "coastline-stroke": string
    "province-stroke": string
    "city-stroke": string
  }): void
}

export interface AMapFlexibleOptions {
  cacheSize: number
  opacity: number
  zIndex: number
  tileSize: 256
  dataZooms: [number, number]
  createTile(
    x: number,
    y: number,
    z: number,
    success: (tile: HTMLCanvasElement) => void,
    fail: () => void
  ): void
}

export interface AMapSdk {
  DistrictLayer?: {
    Country: new (options: {
      SOC: "CHN"
      depth: 0
      zIndex: number
      zooms: MapPosition
    }) => AMapDistrictLayer
  }
  DistrictSearch?: new (options: {
    level: "country" | "province"
    subdistrict: 0
    extensions: "all"
  }) => {
    search(
      keyword: string,
      callback: (status: string, result: unknown) => void
    ): void
  }
  TileLayer?: {
    Flexible: new (options: AMapFlexibleOptions) => AMapFlexibleLayer
  }
  plugin?(plugins: string[], callback: () => void): void
  Geocoder?: new (options: { radius: number; extensions: "all" }) => {
    getAddress(
      position: MapPosition,
      callback: (status: string, result: unknown) => void
    ): void
  }
  PlaceSearch?: new (options: {
    pageSize: number
    pageIndex: number
    city: string
    citylimit: boolean
    extensions: "base" | "all"
    type?: string
  }) => {
    search(
      query: string,
      callback: (status: string, result: unknown) => void
    ): void
    searchNearBy?(
      query: string,
      center: MapPosition,
      radius: number,
      callback: (status: string, result: unknown) => void
    ): void
    getDetails?(
      id: string,
      callback: (status: string, result: unknown) => void
    ): void
  }
  Map: new (
    container: HTMLDivElement,
    options: {
      center: MapPosition
      zoom: number
      mapStyle: string
      viewMode: "2D"
      rotateEnable: boolean
      pitchEnable: boolean
      keyboardEnable: boolean
      resizeEnable: boolean
      dragEnable?: boolean
      zoomEnable?: boolean
      scrollWheel?: boolean
      doubleClickZoom?: boolean
      animateEnable?: boolean
    }
  ) => AMapNativeMap
  Marker: new (options: {
    map: AMapNativeMap
    position: MapPosition
    content: HTMLElement
    anchor: string
    draggable?: boolean
  }) => {
    setMap(map: AMapNativeMap | null): void
    getPosition?(): AMapLngLat | null
    on?(event: string, listener: () => void): void
    off?(event: string, listener: () => void): void
  }
  convertFrom(
    positions: MapPosition[],
    type: "gps",
    callback: (
      status: string,
      result: { info?: string; locations?: AMapLngLat[] }
    ) => void
  ): void
}

type AMapWindow = Window & {
  AMap?: AMapSdk
  _AMapSecurityConfig?: { serviceHost: string }
}
let loaded: { identity: string; promise: Promise<AMapSdk> } | null = null
let ownedIdentity: string | null = null
let readySdk: AMapSdk | null = null
let attempt = 0

/** JS API credentials are process-global. Never silently reuse another key. */
export function loadAMapSdk(
  config: Pick<AMapConfig, "apiKey" | "securityProxyUrl">
): Promise<AMapSdk> {
  const serviceHost = new URL(
    config.securityProxyUrl,
    resolveMapTransportOrigin()
  ).href
  const identity = JSON.stringify([config.apiKey, serviceHost])
  if (ownedIdentity && ownedIdentity !== identity)
    return Promise.reject(
      new MapDisplayError(
        "reload-required",
        "高德 Key 或安全代理已变更，请刷新页面"
      )
    )
  if (readySdk) return Promise.resolve(readySdk)
  if (loaded) {
    return loaded.identity === identity
      ? loaded.promise
      : Promise.reject(
          new MapDisplayError(
            "reload-required",
            "高德 Key 或安全代理已变更，请刷新页面"
          )
        )
  }
  const target = window as AMapWindow
  if (target.AMap && !ownedIdentity)
    return Promise.reject(
      new MapDisplayError(
        "reload-required",
        "高德地图已被其他配置加载，请刷新页面"
      )
    )
  ownedIdentity = identity
  target._AMapSecurityConfig = { serviceHost }
  const script = document.createElement("script")
  script.async = true
  const callbackName = `__imsAMapReady${++attempt}`
  script.src = `https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(config.apiKey)}&callback=${callbackName}`
  const promise = new Promise<AMapSdk>((resolve, reject) => {
    let settled = false
    const finish = (error?: Error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      script.onload = null
      script.onerror = null
      if (error) {
        script.remove()
        loaded = null
        reject(error)
      } else if (readySdk) resolve(readySdk)
      else {
        script.remove()
        loaded = null
        reject(new Error("高德地图 SDK 无法初始化，请检查 Key 和安全代理"))
      }
    }
    const timer = setTimeout(
      () => finish(new Error("高德地图加载超时，请重试")),
      20000
    )
    Reflect.set(target, callbackName, (error?: unknown) => {
      Reflect.deleteProperty(target, callbackName)
      if (error) {
        const deniedDomain =
          typeof error === "object" &&
          "info" in error &&
          error.info === "INVALID_USER_DOMAIN"
        finish(
          deniedDomain
            ? new MapDisplayError("authorization", AMAP_DOMAIN_DENIED_MESSAGE)
            : new Error("高德地图 SDK 初始化失败，请检查 Key")
        )
        return
      }
      if (
        typeof target.AMap?.Map === "function" &&
        typeof target.AMap.Marker === "function" &&
        typeof target.AMap.convertFrom === "function"
      )
        readySdk = target.AMap
      finish()
    })
    script.onerror = () =>
      finish(new Error("高德地图加载失败，请检查网络后重试"))
    document.head.append(script)
  })
  loaded = { identity, promise }
  return promise
}
