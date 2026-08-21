import type { SourceSpecification, StyleSpecification } from "maplibre-gl"

import type { FudabaMapBounds, FudabaMapOffice, FudabaSeries } from "~/lib/api"

export interface MapViewportBounds {
  west: number
  south: number
  east: number
  north: number
}

export interface FudabaMapOfficeGroup {
  key: string
  latitude: number
  longitude: number
  offices: FudabaMapOffice[]
  colors: string[]
}

const pmtilesProtocolPrefix = "pmtiles://"

function parseMapResourceUrl(value: string, base?: URL) {
  try {
    return new URL(value, base)
  } catch {
    throw new Error("地图资源地址格式无效")
  }
}

function sameOriginHttpResource(value: string, currentSite: URL) {
  const resource = parseMapResourceUrl(value, currentSite)
  const isHttp = ["http:", "https:"].includes(resource.protocol)
  if (
    !isHttp ||
    resource.origin !== currentSite.origin ||
    resource.username ||
    resource.password
  ) {
    throw new Error("地图资源仅允许当前站点的同源 HTTP(S) 地址")
  }
  return resource
}

export function resolveAllowedMapResourceUrl(
  value: string,
  siteOrigin: string
) {
  const currentSite = parseMapResourceUrl(siteOrigin)
  if (value.toLowerCase().startsWith(pmtilesProtocolPrefix)) {
    const archive = sameOriginHttpResource(
      value.slice(pmtilesProtocolPrefix.length),
      currentSite
    )
    return `${pmtilesProtocolPrefix}${archive.href}`
  }
  return sameOriginHttpResource(value, currentSite).href
}

type ResourceSource = SourceSpecification & {
  url?: string
  tiles?: string[]
}

function resolveMapStyleResourceUrl(value: string, siteOrigin: string) {
  return resolveAllowedMapResourceUrl(value, siteOrigin)
    .replaceAll("%7B", "{")
    .replaceAll("%7D", "}")
}

export function resolveMapStyleResourceUrls(
  style: StyleSpecification,
  siteOrigin: string
): StyleSpecification {
  const sprite = Array.isArray(style.sprite)
    ? style.sprite.map((entry) => ({
        ...entry,
        url: resolveMapStyleResourceUrl(entry.url, siteOrigin),
      }))
    : typeof style.sprite === "string"
      ? resolveMapStyleResourceUrl(style.sprite, siteOrigin)
      : style.sprite

  const sources = Object.fromEntries(
    Object.entries(style.sources).map(([id, source]) => {
      const resourceSource: ResourceSource = { ...source }
      if (typeof resourceSource.url === "string") {
        resourceSource.url = resolveMapStyleResourceUrl(
          resourceSource.url,
          siteOrigin
        )
      }
      if (resourceSource.tiles) {
        resourceSource.tiles = resourceSource.tiles.map((url) =>
          resolveMapStyleResourceUrl(url, siteOrigin)
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
        ? resolveMapStyleResourceUrl(style.glyphs, siteOrigin)
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
