import {
  defineMapProvider,
  mapDraftValue,
  type MapConfig,
} from "../provider-definition"

export type AMapConfig = Extract<MapConfig, { provider: "amap" }>
export const DEFAULT_EXCHANGE_AMAP_STYLE = "amap://styles/whitesmoke"

// The official SDK exposes stock themes and published custom-style URIs.
export function exchangeAMapStyle(style: string): string {
  return style === "amap://styles/normal" ? DEFAULT_EXCHANGE_AMAP_STYLE : style
}

export const amapProvider = defineMapProvider<AMapConfig>({
  id: "amap",
  label: "高德地图",
  shortLabel: "高德地图",
  preference: { mainland: 100 },
  matches: (config): config is AMapConfig => config.provider === "amap",
  defaults: {
    apiKey: "",
    securityProxyUrl: "/_AMapService",
    mapStyle: DEFAULT_EXCHANGE_AMAP_STYLE,
  },
  fields: [
    {
      key: "apiKey",
      id: "map-source-key",
      label: "高德 JS API Key",
      description:
        "填写 Web 端（JS API）Key，用于底图和地图内地点搜索，并配置允许的域名。",
      maxLength: 128,
    },
    {
      key: "securityProxyUrl",
      id: "map-source-proxy",
      label: "高德安全代理地址",
      description:
        "HTTPS 地址或站点根路径，以 /_AMapService 结尾。安全密钥仅配置在代理服务器。",
      maxLength: 2048,
    },
    {
      key: "mapStyle",
      id: "map-source-amap-style",
      label: "高德地图样式",
      description:
        "默认使用 amap://styles/whitesmoke 浅色主题，与站点地图风格接近。normal 也按此主题显示；已发布的自定义样式地址按原样使用。",
      maxLength: 160,
    },
  ],
  readDraft: ({ apiKey, securityProxyUrl, mapStyle }) => ({
    apiKey,
    securityProxyUrl,
    mapStyle,
  }),
  toConfig: (draft) => ({
    provider: "amap",
    apiKey: mapDraftValue(draft, "apiKey"),
    securityProxyUrl: mapDraftValue(draft, "securityProxyUrl"),
    mapStyle: mapDraftValue(draft, "mapStyle"),
  }),
  describe: (config) => `高德地图 · ${config.mapStyle}`,
})
