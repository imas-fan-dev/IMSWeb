import { mapsPath } from "@imsweb/contracts/paths"
import type {
  FillLayerSpecification,
  FilterSpecification,
  LineLayerSpecification,
  Map as MapLibreMap,
  SymbolLayerSpecification,
} from "maplibre-gl"

/**
 * 依据《公开地图内容表示规范》（自然资规〔2023〕2 号）修正 OpenMapTiles 底图的
 * 边界表达。上游数据来自 OpenStreetMap，把台湾标注为国家（place 层
 * `class=country` / `iso_a2=TW`），并按印度实控线绘制中印边界；两者都不符合规范。
 *
 * 本模块只在运行时改写图层 filter 并追加图层，不修改 `public/maps/exchange-style.json`，
 * 因此 `docs/governance/assets.md` 记录的样式 SHA-256 保持有效。
 *
 * 实现依据为实际解码 OpenFreeMap 矢量瓦片得到的字段取值，而非推测：
 * - place 层：`class=country, rank=2, iso_a2=TW, name=臺灣`；中国各省为 `class=state`。
 * - boundary 层：`admin_level`、`adm0_l`/`adm0_r`（ISO3）、`disputed`、`claimed_by`、`maritime`。
 * - 台海 TWN/CHN 界线为 `maritime=1`，已被 `boundary_2` 的既有过滤器排除；
 *   仅马祖附近残留一段 `adm0_r=TWN, maritime=0` 的碎片需要清除。
 */

/** 台湾在 place 层 `iso_a2` 中的取值。 */
const TAIWAN_COUNTRY_CODE = "TW"

/** 台湾在 boundary 层 `adm0_l`/`adm0_r` 中的取值。 */
const TAIWAN_BOUNDARY_CODE = "TWN"

const CHINA_BOUNDARY_CODE = "CHN"
const INDIA_BOUNDARY_CODE = "IND"

/** 样式中渲染国家级注记的图层，全部需要排除台湾。 */
const COUNTRY_LABEL_LAYER_IDS = [
  "label_country_1",
  "label_country_2",
  "label_country_3",
] as const

export const TAIWAN_PROVINCE_LABEL_LAYER_ID = "label_state_taiwan"
export const CHINA_CLAIM_BOUNDARY_LAYER_ID = "boundary_china_claim"
const CHINA_DASH_SOURCE_ID = "china-boundary-dashes"
export const CHINA_DASH_FILL_LAYER_ID = "boundary_china_dash_fill"
export const CHINA_DASH_LINE_LAYER_ID = "boundary_china_dash_line"

/** 南海断续线资产路径，必须同源。 */
export const CHINA_DASH_SOURCE_URL = mapsPath(
  "/china-boundary-dashes.json",
)

/** 台湾省级注记插入位置：与其余注记同层级，位于国家注记之下。 */
const TAIWAN_LABEL_ANCHOR_LAYER_ID = "label_country_3"

/** 中国主张国界线插入位置：紧邻既有争议线，保持在注记之下。 */
const CHINA_CLAIM_ANCHOR_LAYER_ID = "boundary_disputed"

/**
 * `Map.getFilter` 在 maplibre-gl v6 中的返回类型是 `FilterSpecification | void`，
 * 因此接受该联合类型，由本模块统一归一化。
 */
export type SourceFilter = FilterSpecification | undefined | void

/**
 * 把附加条件并入既有 filter。上游 filter 已是 `all` 时就地扩展，
 * 否则整体包一层，避免破坏原有语义。
 */
export function andFilter(
  base: SourceFilter,
  ...extra: FilterSpecification[]
): FilterSpecification {
  if (!extra.length) return (base ?? ["all"]) as FilterSpecification
  if (!base) return ["all", ...extra] as FilterSpecification
  if (Array.isArray(base) && base[0] === "all") {
    return ["all", ...base.slice(1), ...extra] as FilterSpecification
  }
  return ["all", base, ...extra] as FilterSpecification
}

/**
 * 排除台湾的国家级注记。台湾改由 {@link taiwanProvinceLabelLayer} 按省级表示。
 */
export function withoutTaiwanCountryLabel(
  base: SourceFilter
): FilterSpecification {
  return andFilter(base, [
    "!=",
    ["get", "iso_a2"],
    TAIWAN_COUNTRY_CODE,
  ] as FilterSpecification)
}

/**
 * 从实线国界中排除两类线段：
 * 1. 任何一侧为台湾的界线（马祖附近的 `maritime=0` 碎片）；
 * 2. 中印之间按印度实控线绘制的界线，改由中国主张线表示。
 */
export function withoutDisputedChinaCountryBoundary(
  base: SourceFilter
): FilterSpecification {
  const sideIsTaiwan = [
    "any",
    ["==", ["get", "adm0_l"], TAIWAN_BOUNDARY_CODE],
    ["==", ["get", "adm0_r"], TAIWAN_BOUNDARY_CODE],
  ] as FilterSpecification
  const isIndiaChinaLine = [
    "all",
    [
      "any",
      ["==", ["get", "adm0_l"], INDIA_BOUNDARY_CODE],
      ["==", ["get", "adm0_r"], INDIA_BOUNDARY_CODE],
    ],
    [
      "any",
      ["==", ["get", "adm0_l"], CHINA_BOUNDARY_CODE],
      ["==", ["get", "adm0_r"], CHINA_BOUNDARY_CODE],
    ],
  ] as FilterSpecification
  return andFilter(
    base,
    ["!", sideIsTaiwan] as FilterSpecification,
    ["!", isIndiaChinaLine] as FilterSpecification
  )
}

/**
 * `claimed_by` 是分号分隔的 ISO2 列表（实测取值如 `CN`、`IN`、`CN;PH;TW`），
 * 因此用分隔符包裹后做子串匹配，避免 `IN` 误命中 `CHN` 之类的值。
 */
function claimedBy(code: string): FilterSpecification {
  return [
    "in",
    `;${code};`,
    ["concat", ";", ["coalesce", ["get", "claimed_by"], ""], ";"],
  ] as FilterSpecification
}

/**
 * 中国主张国界线：按规范以实线表示，与其余国界同级。
 */
export function chinaClaimBoundaryFilter(): FilterSpecification {
  return [
    "all",
    ["==", ["get", "admin_level"], 2],
    ["!=", ["get", "maritime"], 1],
    claimedBy("CN"),
  ] as FilterSpecification
}

/**
 * 争议线图层需要排除两类要素：
 * 1. 中国主张线，已由 {@link chinaClaimBoundaryFilter} 以实线绘制，避免重复；
 * 2. 他国对中国领土的主张线（如 `claimed_by=IN` 的中印段）。
 */
export function withoutForeignClaimOverChina(
  base: SourceFilter
): FilterSpecification {
  return andFilter(
    base,
    ["!", claimedBy("CN")] as FilterSpecification,
    ["!", claimedBy("IN")] as FilterSpecification
  )
}

/**
 * 台湾省级注记。layout、paint 均复制自 `label_state`，使台湾与其余省级行政
 * 单位视觉同级（同受 `applyPortalMapPalette` 覆盖）；名称按规范固定为
 * 「台湾省」，不使用上游的 `臺灣`。
 */
export function taiwanProvinceLabelLayer(): SymbolLayerSpecification {
  return {
    id: TAIWAN_PROVINCE_LABEL_LAYER_ID,
    type: "symbol",
    source: "openmaptiles",
    "source-layer": "place",
    minzoom: 5,
    maxzoom: 8,
    filter: [
      "all",
      ["==", ["get", "class"], "country"],
      ["==", ["get", "iso_a2"], TAIWAN_COUNTRY_CODE],
    ],
    layout: {
      "text-field": ["concat", "Taiwan Province", "\n", "台湾省"],
      "text-font": ["Noto Sans Italic"],
      "text-letter-spacing": 0.2,
      "text-max-width": 9,
      "text-size": ["interpolate", ["linear"], ["zoom"], 5, 10, 8, 14],
      "text-transform": "uppercase",
    },
    paint: {
      "text-color": "#333",
      "text-halo-blur": 1,
      "text-halo-color": "#fff",
      "text-halo-width": 1,
    },
  }
}

/**
 * 中国主张国界线图层。paint 沿用样式中 `boundary_2` 的原生取值，
 * 随后由 `applyPortalMapPalette` 统一改色，避免门户配色出现第二份。
 */
export function chinaClaimBoundaryLayer(): LineLayerSpecification {
  return {
    id: CHINA_CLAIM_BOUNDARY_LAYER_ID,
    type: "line",
    source: "openmaptiles",
    "source-layer": "boundary",
    filter: chinaClaimBoundaryFilter(),
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": "hsl(248,7%,66%)",
      "line-opacity": ["interpolate", ["linear"], ["zoom"], 0, 0.4, 4, 1],
      "line-width": ["interpolate", ["linear"], ["zoom"], 3, 1, 5, 1.2, 12, 3],
    },
  }
}

/**
 * 南海断续线。上游把每一段断续线存为宽约 0.02 度的细长面（描边转面，
 * 圆头端帽），而非线。该宽度在本地图默认视角（z4 量级）不足 0.5 像素，
 * 单用 fill 会过淡，因此叠一层同色 outline：低缩放靠 outline 保证可见，
 * 高缩放靠 fill 填实。线宽与 `boundary_2` 一致，因为断续线属于国界符号。
 */
export function chinaBoundaryDashFillLayer(): FillLayerSpecification {
  return {
    id: CHINA_DASH_FILL_LAYER_ID,
    type: "fill",
    source: CHINA_DASH_SOURCE_ID,
    paint: { "fill-color": "hsl(248,7%,66%)", "fill-opacity": 1 },
  }
}

export function chinaBoundaryDashLineLayer(): LineLayerSpecification {
  return {
    id: CHINA_DASH_LINE_LAYER_ID,
    type: "line",
    source: CHINA_DASH_SOURCE_ID,
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": "hsl(248,7%,66%)",
      "line-opacity": ["interpolate", ["linear"], ["zoom"], 0, 0.4, 4, 1],
      "line-width": ["interpolate", ["linear"], ["zoom"], 3, 1, 5, 1.2, 12, 3],
    },
  }
}

/**
 * 在样式加载完成后应用全部边界修正。必须在 `applyPortalMapPalette` 之前调用，
 * 使新增图层一同受门户配色覆盖。
 */
export function applyChinaBoundaryCompliance(
  map: MapLibreMap,
  dashSourceUrl: string = CHINA_DASH_SOURCE_URL
) {
  for (const layerId of COUNTRY_LABEL_LAYER_IDS) {
    if (!map.getLayer(layerId)) continue
    map.setFilter(layerId, withoutTaiwanCountryLabel(map.getFilter(layerId)))
  }

  if (map.getLayer("boundary_2")) {
    map.setFilter(
      "boundary_2",
      withoutDisputedChinaCountryBoundary(map.getFilter("boundary_2"))
    )
  }

  if (map.getLayer("boundary_disputed")) {
    map.setFilter(
      "boundary_disputed",
      withoutForeignClaimOverChina(map.getFilter("boundary_disputed"))
    )
  }

  if (!map.getLayer(CHINA_CLAIM_BOUNDARY_LAYER_ID)) {
    map.addLayer(
      chinaClaimBoundaryLayer(),
      map.getLayer(CHINA_CLAIM_ANCHOR_LAYER_ID)
        ? CHINA_CLAIM_ANCHOR_LAYER_ID
        : undefined
    )
  }

  if (!map.getSource(CHINA_DASH_SOURCE_ID)) {
    map.addSource(CHINA_DASH_SOURCE_ID, {
      type: "geojson",
      data: dashSourceUrl,
    })
  }
  const dashAnchor = map.getLayer(CHINA_CLAIM_ANCHOR_LAYER_ID)
    ? CHINA_CLAIM_ANCHOR_LAYER_ID
    : undefined
  if (!map.getLayer(CHINA_DASH_FILL_LAYER_ID)) {
    map.addLayer(chinaBoundaryDashFillLayer(), dashAnchor)
  }
  if (!map.getLayer(CHINA_DASH_LINE_LAYER_ID)) {
    map.addLayer(chinaBoundaryDashLineLayer(), dashAnchor)
  }

  if (!map.getLayer(TAIWAN_PROVINCE_LABEL_LAYER_ID)) {
    map.addLayer(
      taiwanProvinceLabelLayer(),
      map.getLayer(TAIWAN_LABEL_ANCHOR_LAYER_ID)
        ? TAIWAN_LABEL_ANCHOR_LAYER_ID
        : undefined
    )
  }
}
