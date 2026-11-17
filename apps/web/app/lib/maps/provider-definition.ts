import type { FudabaMapProviderConfig } from "~/lib/api"

export type MapConfig = FudabaMapProviderConfig
export type MapProviderId = MapConfig["provider"]
export type MapProviderDraft = Record<string, string>
export type MapRoutingRegion = "mainland" | "overseas"

export interface MapProviderField {
  key: string
  id: string
  label: string
  description: string
  maxLength: number
  required?: boolean
}

export interface MapProviderDefinition<C extends MapConfig = MapConfig> {
  id: MapProviderId
  label: string
  shortLabel: string
  fields: readonly MapProviderField[]
  preference: Partial<Record<MapRoutingRegion, number>>
  matches(config: MapConfig): config is C
  createDraft(config?: MapConfig): MapProviderDraft
  toConfig(draft: MapProviderDraft): C
  describe(config: MapConfig): string
}

export function defineMapProvider<C extends MapConfig>(input: {
  id: MapProviderId
  label: string
  shortLabel: string
  fields: readonly MapProviderField[]
  preference: Partial<Record<MapRoutingRegion, number>>
  matches(config: MapConfig): config is C
  defaults: MapProviderDraft
  readDraft(config: C): MapProviderDraft
  toConfig(draft: MapProviderDraft): C
  describe(config: C): string
}): MapProviderDefinition<C> {
  return {
    ...input,
    createDraft: (config) =>
      config && input.matches(config)
        ? input.readDraft(config)
        : { ...input.defaults },
    describe(config) {
      if (!input.matches(config)) throw new Error("地图配置与适配器不匹配")
      return input.describe(config)
    },
  }
}

export const mapDraftValue = (draft: MapProviderDraft, key: string) =>
  (draft[key] ?? "").trim()
