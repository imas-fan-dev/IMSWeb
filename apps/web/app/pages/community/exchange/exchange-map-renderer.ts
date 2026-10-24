import type { ComponentType } from "react"
import type { FudabaMapConfig } from "~/lib/api"
import type {
  MapConfig,
  MapProviderDefinition,
} from "~/lib/maps/provider-definition"
import { mapLibreProvider } from "~/lib/maps/providers/maplibre"
import { amapProvider } from "~/lib/maps/providers/amap"
import { mapboxProvider } from "~/lib/maps/providers/mapbox"
import { MapDisplayError } from "~/lib/maps/map-errors"
import type { ExchangeMapInteractionProps } from "./exchange-map-provider"

export type ExchangeMapRenderer = ComponentType<ExchangeMapInteractionProps>

export interface MapRendererRegistration<Config> {
  matches(config: Config): boolean
  load(config: Config): Promise<ExchangeMapRenderer>
}

export function createMapRendererRegistry<Config>(
  registrations: readonly MapRendererRegistration<Config>[]
) {
  return async (config: Config): Promise<ExchangeMapRenderer> => {
    const matching = registrations.filter((registration) =>
      registration.matches(config)
    )
    if (matching.length !== 1)
      throw new MapDisplayError(
        "unsupported-provider",
        "当前地图服务商尚未正确注册。"
      )
    return matching[0]!.load(config)
  }
}

function register<C extends MapConfig>(
  provider: MapProviderDefinition<C>,
  load: () => Promise<{ createMapRenderer(config: C): ExchangeMapRenderer }>
): MapRendererRegistration<FudabaMapConfig> {
  return {
    matches: (config) =>
      config.provider !== "regional" && provider.matches(config),
    async load(config) {
      if (config.provider === "regional" || !provider.matches(config))
        throw new Error("地图配置与适配器不匹配")
      return (await load()).createMapRenderer(config)
    },
  }
}

// Trusted composition point. Exactly one renderer owns the map at a time.
export const loadExchangeMapRenderer = createMapRendererRegistry<FudabaMapConfig>([
  register(mapLibreProvider, () => import("./map-providers/maplibre")),
  register(amapProvider, () => import("./map-providers/amap")),
  register(mapboxProvider, () => import("./map-providers/mapbox")),
  {
    matches: (config) => config.provider === "regional",
    async load(config) {
      if (config.provider !== "regional") throw new Error("地区地图配置无效")
      return (await import("./map-providers/regional")).createMapRenderer(config)
    },
  },
])
