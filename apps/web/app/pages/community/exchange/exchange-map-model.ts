import { MAPS_PATH_PREFIX } from "@imsweb/contracts/paths"
import type { SourceSpecification, StyleSpecification } from "maplibre-gl"

import type { FudabaMapBounds, FudabaMapOffice, FudabaSeries } from "~/lib/api"

export interface MapViewportBounds {
  west: number
  south: number
  east: number
  north: number
}

export interface ExchangeMapViewport {
  center: [number, number]
  zoom: number
}

export interface ExchangeMapFilters {
  city: string
  seriesCodes: string[]
  openOnly: boolean
}

export const EXCHANGE_MAP_MIN_ZOOM = 2.3
export const EXCHANGE_MAP_MAX_ZOOM = 11
export const DEFAULT_EXCHANGE_MAP_VIEWPORT: Readonly<ExchangeMapViewport> = {
  center: [127.1, 31.2],
  zoom: 4.05,
}

const exchangeMapSessionKey = "ims:community-exchange-map"
const exchangeMapFilterKeys = ["city", "series", "open"] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function readExchangeMapSessionState() {
  if (typeof window === "undefined") return {}
  try {
    const stored = window.sessionStorage.getItem(exchangeMapSessionKey)
    if (!stored) return {}
    const parsed: unknown = JSON.parse(stored)
    return isRecord(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function writeExchangeMapSessionState(update: Record<string, unknown>) {
  if (typeof window === "undefined") return
  try {
    window.sessionStorage.setItem(
      exchangeMapSessionKey,
      JSON.stringify({ ...readExchangeMapSessionState(), ...update })
    )
  } catch {
    // Storage is optional in hardened WebViews. The map remains usable without it.
  }
}

export function exchangeMapFilterDefaults(currentSearch: URLSearchParams) {
  if (exchangeMapFilterKeys.some((key) => currentSearch.has(key))) {
    return undefined
  }

  const stored = readExchangeMapSessionState().filters
  if (!isRecord(stored)) return undefined

  const city = typeof stored.city === "string" ? stored.city.trim() : ""
  const seriesCodes = Array.isArray(stored.seriesCodes)
    ? Array.from(
        new Set(
          stored.seriesCodes.filter(
            (value): value is string =>
              typeof value === "string" && Boolean(value.trim())
          )
        )
      )
        .map((value) => value.trim())
        .slice(0, 8)
    : []
  const openOnly = stored.openOnly === true
  const defaults = new URLSearchParams()
  if (city) defaults.set("city", city)
  for (const seriesCode of seriesCodes) defaults.append("series", seriesCode)
  if (openOnly) defaults.set("open", "true")
  return defaults.size ? defaults : undefined
}

export function rememberExchangeMapFilters(filters: ExchangeMapFilters) {
  writeExchangeMapSessionState({
    filters: {
      city: filters.city.trim(),
      seriesCodes: Array.from(
        new Set(
          filters.seriesCodes.map((value) => value.trim()).filter(Boolean)
        )
      ).slice(0, 8),
      openOnly: filters.openOnly,
    },
  })
}

function validExchangeMapViewport(
  value: unknown
): value is ExchangeMapViewport {
  if (!isRecord(value) || !Array.isArray(value.center)) return false
  const [longitude, latitude] = value.center
  return (
    value.center.length === 2 &&
    typeof longitude === "number" &&
    Number.isFinite(longitude) &&
    longitude >= -180 &&
    longitude <= 180 &&
    typeof latitude === "number" &&
    Number.isFinite(latitude) &&
    latitude >= -85.051129 &&
    latitude <= 85.051129 &&
    typeof value.zoom === "number" &&
    Number.isFinite(value.zoom) &&
    value.zoom >= EXCHANGE_MAP_MIN_ZOOM &&
    value.zoom <= EXCHANGE_MAP_MAX_ZOOM
  )
}

export function exchangeMapInitialViewport(): ExchangeMapViewport {
  const stored = readExchangeMapSessionState().viewport
  const viewport = validExchangeMapViewport(stored)
    ? stored
    : DEFAULT_EXCHANGE_MAP_VIEWPORT
  return { center: [...viewport.center], zoom: viewport.zoom }
}

export function rememberExchangeMapViewport(viewport: ExchangeMapViewport) {
  if (!validExchangeMapViewport(viewport)) return
  writeExchangeMapSessionState({
    viewport: {
      center: viewport.center.map(stableCoordinate),
      zoom: Number(viewport.zoom.toFixed(4)),
    },
  })
}

export interface FudabaMapOfficeGroup {
  key: string
  latitude: number
  longitude: number
  offices: FudabaMapOffice[]
  colors: string[]
}

const pmtilesProtocolPrefix = "pmtiles://"

/**
 * Delivery root the packaged exchange map sits under, and the asset subtree
 * that travels with it.
 *
 * `apps/web/public/maps/exchange-style.json` is served at
 * `/maps/exchange-style.json`, and every child that style names is
 * root-relative under `/maps/exchange/`. Both constants describe the
 * repository's own asset layout, not operator configuration: `/maps/` is the
 * prefix an operator replaces, and `exchange/` is the subtree that moves with
 * it. Sibling files in `public/maps/` — `china-provinces.json` and friends —
 * belong to the app bundle, sit outside that subtree, and never follow the
 * prefix.
 */
const bundledMapDeliveryPrefix = `${MAPS_PATH_PREFIX}/`
const bundledMapAssetRoot = `${bundledMapDeliveryPrefix}exchange/`

/**
 * Where map resources may be fetched from, with the base a relative URL
 * resolves against kept separate from the origins this client will load.
 *
 * Splitting the two matters: a resource resolved against `base` earns no trust
 * by having been resolved there, so a base whose origin is absent from
 * `trustedOrigins` produces a rejection rather than a load.
 */
export interface MapResourceScope {
  /** Base that a relative resource URL resolves against. Grants no trust. */
  base: string
  /** The only origins map resources may be loaded from, as bare origins. */
  trustedOrigins: readonly string[]
}

/** A resolved scope plus the delivery prefix the style URL is sitting under. */
export interface MapDeliveryContext {
  scope: MapResourceScope
  deliveryPrefix: string
}

function parseMapResourceUrl(value: string, base?: URL) {
  try {
    return new URL(value, base)
  } catch {
    throw new Error("地图资源地址格式无效")
  }
}

/**
 * Origin of a URL that is safe to name as a load target: `http(s)` only, and
 * free of embedded credentials. Anything else yields `null` and therefore
 * never enters a trusted set.
 */
function loadableHttpOrigin(value: string, base?: URL): string | null {
  let resource: URL
  try {
    resource = new URL(value, base)
  } catch {
    return null
  }
  if (resource.protocol !== "http:" && resource.protocol !== "https:") {
    return null
  }
  return resource.username || resource.password ? null : resource.origin
}

function trustedHttpResource(
  value: string,
  base: URL,
  trustedOrigins: readonly string[]
) {
  const resource = parseMapResourceUrl(value, base)
  const isHttp = ["http:", "https:"].includes(resource.protocol)
  const trusted = new Set(
    trustedOrigins
      .map((origin) => loadableHttpOrigin(origin))
      .filter((origin): origin is string => origin !== null)
  )
  if (
    !isHttp ||
    !trusted.has(resource.origin) ||
    resource.username ||
    resource.password
  ) {
    throw new Error("地图资源仅允许本站或地图样式来源的同源 HTTP(S) 地址")
  }
  return resource
}

/**
 * The delivery prefix a style URL already sits under: everything up to and
 * including its last `/`. `/maps/exchange-style.json` yields `/maps/`, and
 * `https://assets.example.com/exchange-map/v3/exchange-style.json` yields
 * `https://assets.example.com/exchange-map/v3/`.
 *
 * This is the whole of what the client needs to follow an operator's choice:
 * the one value the API already hands it carries both the host and the path.
 */
export function mapDeliveryPrefixFromStyleUrl(styleUrl: string): string {
  const location = styleUrl.split(/[?#]/)[0] ?? ""
  const lastSeparator = location.lastIndexOf("/")
  return lastSeparator < 0 ? "" : location.slice(0, lastSeparator + 1)
}

/**
 * Move one of the style's root-relative children onto the delivery prefix.
 *
 * MapLibre has no style-base concept — relative URLs in a style resolve
 * against `document.baseURI`, and `pmtiles://` fares worse still, since the
 * protocol handler strips the scheme and hands the bare string to the browser loader.
 * So the style keeps the root-relative children it has on disk and the client
 * rewrites them here instead.
 *
 * Only the bundled asset subtree moves: a child must be root-relative under
 * `/maps/exchange/`. The leading `/maps/` is replaced by the delivery prefix
 * and the `exchange/…` remainder is preserved, so a prefix that carries a path
 * lands the whole subtree beneath it. With nothing configured the prefix is
 * `/maps/` and this is the identity function.
 */
function rewriteOntoDeliveryPrefix(value: string, deliveryPrefix: string) {
  if (!deliveryPrefix || deliveryPrefix === bundledMapDeliveryPrefix) {
    return value
  }
  const scheme = value.toLowerCase().startsWith(pmtilesProtocolPrefix)
    ? value.slice(0, pmtilesProtocolPrefix.length)
    : ""
  const location = value.slice(scheme.length)
  if (!location.startsWith(bundledMapAssetRoot)) return value
  const remainder = location.slice(bundledMapDeliveryPrefix.length)
  return `${scheme}${deliveryPrefix}${remainder}`
}

/**
 * Derive the rewrite and trust context from the style URL already returned by
 * the API. `resolutionBase` resolves a root-relative style URL but grants no
 * trust by itself. The loadable set contains only the document origin and the
 * resolved style origin, so a configured style cannot pull children from a
 * third host.
 */
export function createMapDeliveryContext(
  resolutionBase: string,
  styleUrl: string,
  documentOrigin = resolutionBase
): MapDeliveryContext {
  const trustedOrigins = new Set<string>()
  const document = loadableHttpOrigin(documentOrigin)
  if (document) trustedOrigins.add(document)

  let base: URL | undefined
  try {
    base = new URL(resolutionBase)
  } catch {
    base = undefined
  }
  const style = loadableHttpOrigin(styleUrl, base)
  if (style) trustedOrigins.add(style)

  return {
    scope: { base: resolutionBase, trustedOrigins: [...trustedOrigins] },
    deliveryPrefix: mapDeliveryPrefixFromStyleUrl(styleUrl),
  }
}

export function resolveAllowedMapResourceUrl(
  value: string,
  scope: MapResourceScope
) {
  const base = parseMapResourceUrl(scope.base)
  if (value.toLowerCase().startsWith(pmtilesProtocolPrefix)) {
    const archive = trustedHttpResource(
      value.slice(pmtilesProtocolPrefix.length),
      base,
      scope.trustedOrigins
    )
    return `${pmtilesProtocolPrefix}${archive.href}`
  }
  return trustedHttpResource(value, base, scope.trustedOrigins).href
}

/**
 * Resolve the API-selected style before handing it to MapLibre.
 *
 * A packaged App has a local WebView origin, so its root-relative style URL
 * must be made absolute before MapLibre starts the initial style fetch.
 */
export function resolveMapStyleUrl(
  styleUrl: string,
  context: MapDeliveryContext
) {
  return resolveAllowedMapResourceUrl(styleUrl, context.scope)
}

type ResourceSource = SourceSpecification & {
  url?: string
  tiles?: string[]
}

/**
 * Move a style child onto the delivery prefix, then resolve it to an absolute
 * URL on a trusted origin.
 *
 * Resolution is what makes `sprite` usable: MapLibre rejects a relative sprite
 * URL outright (`must be absolute`), and this returns `URL.href`, so every
 * child reaches MapLibre absolute. The `{}` placeholders that `URL` percent-
 * encodes are restored afterwards so glyph and tile templates survive.
 */
function resolveMapStyleResourceUrl(
  value: string,
  context: MapDeliveryContext
) {
  return resolveAllowedMapResourceUrl(
    rewriteOntoDeliveryPrefix(value, context.deliveryPrefix),
    context.scope
  )
    .replaceAll("%7B", "{")
    .replaceAll("%7D", "}")
}

export function resolveMapStyleResourceUrls(
  style: StyleSpecification,
  context: MapDeliveryContext
): StyleSpecification {
  const sprite = Array.isArray(style.sprite)
    ? style.sprite.map((entry) => ({
        ...entry,
        url: resolveMapStyleResourceUrl(entry.url, context),
      }))
    : typeof style.sprite === "string"
      ? resolveMapStyleResourceUrl(style.sprite, context)
      : style.sprite

  const sources = Object.fromEntries(
    Object.entries(style.sources).map(([id, source]) => {
      const resourceSource: ResourceSource = { ...source }
      if (typeof resourceSource.url === "string") {
        resourceSource.url = resolveMapStyleResourceUrl(
          resourceSource.url,
          context
        )
      }
      if (resourceSource.tiles) {
        resourceSource.tiles = resourceSource.tiles.map((url) =>
          resolveMapStyleResourceUrl(url, context)
        )
      }
      return [id, resourceSource]
    })
  )

  return {
    ...style,
    sprite,
    glyphs:
      typeof style.glyphs === "string"
        ? resolveMapStyleResourceUrl(style.glyphs, context)
        : style.glyphs,
    sources,
  }
}

function normalizeLongitude(longitude: number) {
  const normalized = ((((longitude + 180) % 360) + 360) % 360) - 180
  return Object.is(normalized, -0) ? 0 : normalized
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value))
}

function stableCoordinate(value: number) {
  return Number(value.toFixed(6))
}

export function splitViewportBounds({
  west,
  south,
  east,
  north,
}: MapViewportBounds): FudabaMapBounds[] {
  if (![west, south, east, north].every(Number.isFinite)) return []

  const boundedSouth = stableCoordinate(clamp(south, -90, 90))
  const boundedNorth = stableCoordinate(clamp(north, -90, 90))
  if (boundedSouth >= boundedNorth) return []

  const span = east >= west ? east - west : east - west + 360
  if (span >= 360) {
    return [[-180, boundedSouth, 180, boundedNorth]]
  }

  const boundedWest = stableCoordinate(normalizeLongitude(west))
  let boundedEast = stableCoordinate(normalizeLongitude(east))
  if (boundedEast === -180 && east > west) boundedEast = 180

  if (boundedWest < boundedEast) {
    return [[boundedWest, boundedSouth, boundedEast, boundedNorth]]
  }
  if (boundedWest === boundedEast) return []

  const splitBounds: FudabaMapBounds[] = [
    [boundedWest, boundedSouth, 180, boundedNorth],
    [-180, boundedSouth, boundedEast, boundedNorth],
  ]
  return splitBounds.filter(
    ([requestWest, , requestEast]) => requestWest < requestEast
  )
}

export function mergeMapOfficeResponses(
  responses: ReadonlyArray<{
    items: FudabaMapOffice[]
    truncated: boolean
  }>
) {
  const offices = new Map<string, FudabaMapOffice>()
  let truncated = false

  for (const response of responses) {
    truncated ||= response.truncated
    for (const office of response.items) offices.set(office.id, office)
  }

  return { items: [...offices.values()], truncated }
}

export function groupMapOffices(
  offices: readonly FudabaMapOffice[],
  series: readonly FudabaSeries[] = []
): FudabaMapOfficeGroup[] {
  const groups = new Map<string, FudabaMapOfficeGroup>()
  const seriesColors = new Map(series.map((item) => [item.code, item.color]))

  for (const office of offices) {
    const { latitude, longitude } = office.location
    const key = `${latitude.toFixed(1)},${longitude.toFixed(1)}`
    const group = groups.get(key) ?? {
      key,
      latitude,
      longitude,
      offices: [],
      colors: [],
    }
    group.offices.push(office)

    for (const seriesCode of office.seriesCodes) {
      const color = seriesColors.get(seriesCode)
      if (color && !group.colors.includes(color)) group.colors.push(color)
    }
    if (!group.colors.length && !group.colors.includes(office.accent)) {
      group.colors.push(office.accent)
    }
    groups.set(key, group)
  }

  return [...groups.values()]
}
