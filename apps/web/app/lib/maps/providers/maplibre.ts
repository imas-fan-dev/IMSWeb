import {
  defineMapProvider,
  mapDraftValue,
  type MapConfig,
} from "../provider-definition"

export type MapLibreConfig = Extract<MapConfig, { provider: "maplibre" }>

export const mapLibreProvider = defineMapProvider<MapLibreConfig>({
  id: "maplibre",
  label: "OpenFreeMap / MapLibre",
  shortLabel: "MapLibre",
  preference: {},
  matches: (config): config is MapLibreConfig => config.provider === "maplibre",
  defaults: { styleUrl: "" },
  fields: [
    {
      key: "styleUrl",
      id: "map-source-style-url",
      label: "地图样式地址",
      description: "完整 HTTP(S) 地址或站点根路径。",
      maxLength: 2048,
      required: true,
    },
  ],
  readDraft: (config) => ({ styleUrl: config.styleUrl }),
  toConfig: (draft) => ({
    provider: "maplibre",
    styleUrl: mapDraftValue(draft, "styleUrl"),
  }),
  describe: (config) => config.styleUrl,
})
