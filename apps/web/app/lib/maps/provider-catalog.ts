import type { FudabaMapSource } from "~/lib/api"
import type {
  MapConfig,
  MapProviderDefinition,
  MapRoutingRegion,
} from "./provider-definition"
import { mapLibreProvider } from "./providers/maplibre"
import { amapProvider } from "./providers/amap"
import { mapboxProvider } from "./providers/mapbox"

/** Composition only: provider modules own fields, defaults and presentation. */
export const mapProviderCatalog: readonly MapProviderDefinition[] = [
  mapLibreProvider,
  amapProvider,
  mapboxProvider,
]
export const defaultMapProvider: MapProviderDefinition = mapLibreProvider

export function mapProviderById(id: string): MapProviderDefinition {
  const provider = mapProviderCatalog.find((entry) => entry.id === id)
  if (!provider) throw new Error("当前地图服务商尚未注册")
  return provider
}

export function mapProviderFor(config: MapConfig): MapProviderDefinition {
  const provider = mapProviderCatalog.find((entry) => entry.matches(config))
  if (!provider) throw new Error("当前地图服务商尚未注册")
  return provider
}

export function preferredMapSource(
  sources: readonly FudabaMapSource[],
  region: MapRoutingRegion
): string | undefined {
  let preferred: string | undefined
  let priority = 0
  for (const source of sources) {
    const next = mapProviderFor(source).preference[region] ?? 0
    if (next > priority) {
      preferred = source.id
      priority = next
    }
  }
  return preferred
}

export function mapSourcesForRegion(
  sources: readonly FudabaMapSource[],
  region: MapRoutingRegion
): FudabaMapSource[] {
  return sources.filter(
    (source) => (mapProviderFor(source).preference[region] ?? 0) > 0
  )
}
