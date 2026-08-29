import { readFile } from "node:fs/promises"
import { resolve } from "node:path"

import type { FilterSpecification } from "maplibre-gl"
import { describe, expect, it } from "vitest"

import {
  andFilter,
  chinaBoundaryDashFillLayer,
  chinaBoundaryDashLineLayer,
  CHINA_DASH_SOURCE_URL,
  chinaClaimBoundaryFilter,
  chinaClaimBoundaryLayer,
  taiwanProvinceLabelLayer,
  withoutDisputedChinaCountryBoundary,
  withoutForeignClaimOverChina,
  withoutTaiwanCountryLabel,
} from "~/pages/community/exchange/exchange-boundary-compliance"

type Properties = Record<string, string | number>

/**
 * 只实现本模块 filter 用到的算子，语义对齐 MapLibre 表达式：
 * 缺失属性求值为 null，`in` 对字符串做子串匹配，`coalesce` 取首个非 null。
 */
function evaluate(expression: unknown, properties: Properties): unknown {
  if (!Array.isArray(expression)) return expression
  const [operator, ...args] = expression as [string, ...unknown[]]

  switch (operator) {
    case "get":
      return properties[args[0] as string] ?? null
    case "has":
      return Object.hasOwn(properties, args[0] as string)
    case "all":
      return args.every((arg) => evaluate(arg, properties) === true)
    case "any":
      return args.some((arg) => evaluate(arg, properties) === true)
    case "!":
      return evaluate(args[0], properties) !== true
    case "==":
      return evaluate(args[0], properties) === evaluate(args[1], properties)
    case "!=":
      return evaluate(args[0], properties) !== evaluate(args[1], properties)
    case ">=":
      return (
        (evaluate(args[0], properties) as number) >=
        (evaluate(args[1], properties) as number)
      )
    case "<=":
      return (
        (evaluate(args[0], properties) as number) <=
        (evaluate(args[1], properties) as number)
      )
    case "in": {
      const needle = evaluate(args[0], properties)
      const haystack = evaluate(args[1], properties)
      if (typeof haystack === "string") {
        return haystack.includes(String(needle))
      }
      return Array.isArray(haystack) && haystack.includes(needle)
    }
    case "concat":
      return args.map((arg) => String(evaluate(arg, properties) ?? "")).join("")
    case "coalesce": {
      for (const arg of args) {
        const value = evaluate(arg, properties)
        if (value !== null && value !== undefined) return value
      }
      return null
    }
    default:
      throw new Error(`测试求值器不支持算子: ${operator}`)
  }
}

const matches = (filter: unknown, properties: Properties) =>
  evaluate(filter, properties) === true

/** 样式中 `boundary_2` 的原始 filter。 */
const originalBoundary2: FilterSpecification = [
  "all",
  ["==", ["get", "admin_level"], 2],
  ["!=", ["get", "maritime"], 1],
  ["!=", ["get", "disputed"], 1],
  ["!", ["has", "claimed_by"]],
]

/** 样式中 `boundary_disputed` 的原始 filter。 */
const originalBoundaryDisputed: FilterSpecification = [
  "all",
  ["!=", ["get", "maritime"], 1],
  ["==", ["get", "disputed"], 1],
]

/** 样式中 `label_country_2` 的原始 filter。 */
const originalCountryLabel: FilterSpecification = [
  "all",
  ["==", ["get", "class"], "country"],
  ["==", ["get", "rank"], 2],
]

/**
 * 以下属性组合全部来自实际解码 OpenFreeMap planet 瓦片
 * （20260802_080001_pt，z5/26/13 台海、z5/23/12 阿克赛钦、
 * z5/24/13 藏南、z5/26/14 南海），非构造数据。
 */
const observed = {
  taiwanStraitMaritime: {
    admin_level: 2,
    adm0_l: "TWN",
    adm0_r: "CHN",
    disputed: 0,
    maritime: 1,
  },
  matsuFragment: { admin_level: 2, adm0_r: "TWN", disputed: 0, maritime: 0 },
  japanMaritime: { admin_level: 2, adm0_r: "JPN", disputed: 0, maritime: 1 },
  chinaBhutanLand: {
    admin_level: 2,
    adm0_l: "CHN",
    adm0_r: "BTN",
    disputed: 0,
    maritime: 0,
  },
  indiaChinaLand: {
    admin_level: 2,
    adm0_l: "IND",
    adm0_r: "CHN",
    disputed: 0,
    maritime: 0,
  },
  chineseClaimArunachal: {
    admin_level: 2,
    disputed: 1,
    disputed_name: "ArunachalPradesh",
    claimed_by: "CN",
    maritime: 0,
  },
  indianClaimChinaIndia: {
    admin_level: 2,
    disputed: 1,
    disputed_name: "China-India",
    claimed_by: "IN",
    maritime: 0,
  },
  indianClaimLac: {
    admin_level: 2,
    disputed: 1,
    disputed_name: "China-IndiaLAC",
    claimed_by: "IN",
    maritime: 0,
  },
  unattributedLac: {
    admin_level: 2,
    disputed: 1,
    disputed_name: "LineofActualControl",
    maritime: 0,
  },
  southChinaSeaShared: {
    admin_level: 2,
    disputed: 1,
    claimed_by: "CN;PH;TW",
    maritime: 1,
  },
  taiwanCountryLabel: { class: "country", rank: 2, iso_a2: "TW", name: "臺灣" },
  chinaCountryLabel: { class: "country", rank: 1, iso_a2: "CN", name: "中国" },
  japanCountryLabel: { class: "country", rank: 2, iso_a2: "JP", name: "日本" },
  fujianStateLabel: { class: "state", rank: 2, name: "福建省" },
} satisfies Record<string, Properties>

describe("andFilter", () => {
  it("扩展既有 all 而不是嵌套包裹", () => {
    expect(andFilter(["all", ["==", 1, 1]], ["==", 2, 2])).toEqual([
      "all",
      ["==", 1, 1],
      ["==", 2, 2],
    ])
  })

  it("非 all 的 filter 整体包一层，保留原语义", () => {
    expect(andFilter(["==", 1, 1], ["==", 2, 2])).toEqual([
      "all",
      ["==", 1, 1],
      ["==", 2, 2],
    ])
  })

  it("缺省 filter 与空附加条件都安全", () => {
    expect(andFilter(undefined, ["==", 1, 1])).toEqual(["all", ["==", 1, 1]])
    expect(andFilter(undefined)).toEqual(["all"])
    expect(andFilter(["==", 1, 1])).toEqual(["==", 1, 1])
  })
})

describe("台湾按省级表示", () => {
  const filter = withoutTaiwanCountryLabel(originalCountryLabel)

  it("不再把台湾渲染为国家注记", () => {
    expect(matches(originalCountryLabel, observed.taiwanCountryLabel)).toBe(
      true
    )
    expect(matches(filter, observed.taiwanCountryLabel)).toBe(false)
  })

  it("其余国家注记不受影响", () => {
    expect(matches(filter, observed.japanCountryLabel)).toBe(true)
  })

  it("省级注记图层只命中台湾，且名称为台湾省", () => {
    const layer = taiwanProvinceLabelLayer()
    expect(matches(layer.filter, observed.taiwanCountryLabel)).toBe(true)
    expect(matches(layer.filter, observed.chinaCountryLabel)).toBe(false)
    expect(evaluate(layer.layout?.["text-field"], {})).toBe(
      "Taiwan Province\n台湾省"
    )
  })

  it("省级注记的层级与 label_state 一致（z5-8）", () => {
    const layer = taiwanProvinceLabelLayer()
    expect(layer.minzoom).toBe(5)
    expect(layer.maxzoom).toBe(8)
    expect(layer["source-layer"]).toBe("place")
  })
})

describe("国界实线修正", () => {
  const filter = withoutDisputedChinaCountryBoundary(originalBoundary2)

  it("清除马祖附近残留的台湾国界碎片", () => {
    expect(matches(originalBoundary2, observed.matsuFragment)).toBe(true)
    expect(matches(filter, observed.matsuFragment)).toBe(false)
  })

  it("台海主线本就因 maritime=1 不渲染，修正后仍不渲染", () => {
    expect(matches(originalBoundary2, observed.taiwanStraitMaritime)).toBe(
      false
    )
    expect(matches(filter, observed.taiwanStraitMaritime)).toBe(false)
  })

  it("不再按印度实控线绘制中印国界", () => {
    expect(matches(originalBoundary2, observed.indiaChinaLand)).toBe(true)
    expect(matches(filter, observed.indiaChinaLand)).toBe(false)
  })

  it("与台湾、中印无关的国界保持不变", () => {
    expect(matches(filter, observed.chinaBhutanLand)).toBe(true)
    expect(matches(filter, observed.japanMaritime)).toBe(false)
  })
})

describe("中国主张线以实线表示", () => {
  const filter = chinaClaimBoundaryFilter()

  it("命中 claimed_by=CN 的藏南段", () => {
    expect(matches(filter, observed.chineseClaimArunachal)).toBe(true)
  })

  it("不命中他国主张线", () => {
    expect(matches(filter, observed.indianClaimChinaIndia)).toBe(false)
    expect(matches(filter, observed.indianClaimLac)).toBe(false)
  })

  it("分号分隔的多国主张不会因子串误命中", () => {
    // claimed_by="CN;PH;TW" 含 CN，但该段为 maritime=1，不应进入陆地国界图层
    expect(matches(filter, observed.southChinaSeaShared)).toBe(false)
  })

  it("图层原生 paint 与样式中的 boundary_2 逐项一致，视觉不可区分", async () => {
    const raw = await readFile(
      resolve(process.cwd(), "public/maps/exchange-style.json"),
      "utf8"
    )
    const style = JSON.parse(raw) as {
      layers: Array<{ id: string; paint?: Record<string, unknown> }>
    }
    const boundary2 = style.layers.find((layer) => layer.id === "boundary_2")
    expect(boundary2?.paint).toBeDefined()
    expect(chinaClaimBoundaryLayer().paint).toEqual(boundary2?.paint)
  })
})

describe("南海断续线", () => {
  async function readDashAsset() {
    const raw = await readFile(
      resolve(process.cwd(), `public${CHINA_DASH_SOURCE_URL}`),
      "utf8"
    )
    return JSON.parse(raw) as {
      type: string
      features: Array<{
        properties: Record<string, unknown>
        geometry: { type: string; coordinates: number[][][][] }
      }>
    }
  }

  it("资产存在且为十段线", async () => {
    const asset = await readDashAsset()
    expect(asset.type).toBe("FeatureCollection")
    expect(asset.features).toHaveLength(1)
    const [feature] = asset.features
    expect(feature.properties.adcode).toBe("100000_JD")
    expect(feature.geometry.type).toBe("MultiPolygon")
    expect(feature.geometry.coordinates).toHaveLength(10)
  })

  it("南端绘至曾母暗沙以南", async () => {
    const asset = await readDashAsset()
    const latitudes = asset.features[0].geometry.coordinates.flatMap(
      (polygon) =>
        polygon.flatMap((ring) => ring.map(([, latitude]) => latitude))
    )
    // 曾母暗沙约 3.58°N；《公开地图内容表示规范》第五条要求中国全图南边绘出其以南。
    expect(Math.min(...latitudes)).toBeLessThan(3.58)
  })

  it("fill 与 outline 同源同色，线宽与国界一致", async () => {
    const fill = chinaBoundaryDashFillLayer()
    const line = chinaBoundaryDashLineLayer()
    expect(fill.source).toBe(line.source)
    expect(fill.paint?.["fill-color"]).toBe(line.paint?.["line-color"])

    const raw = await readFile(
      resolve(process.cwd(), "public/maps/exchange-style.json"),
      "utf8"
    )
    const style = JSON.parse(raw) as {
      layers: Array<{ id: string; paint?: Record<string, unknown> }>
    }
    const boundary2 = style.layers.find((layer) => layer.id === "boundary_2")
    expect(line.paint?.["line-width"]).toEqual(boundary2?.paint?.["line-width"])
  })

  it("资产路径为同源绝对路径", () => {
    expect(CHINA_DASH_SOURCE_URL.startsWith("/")).toBe(true)
    expect(CHINA_DASH_SOURCE_URL).not.toContain("//")
  })
})

describe("争议线图层排除重复与他国主张", () => {
  const filter = withoutForeignClaimOverChina(originalBoundaryDisputed)

  it("中国主张线不再重复绘制为虚线", () => {
    expect(
      matches(originalBoundaryDisputed, observed.chineseClaimArunachal)
    ).toBe(true)
    expect(matches(filter, observed.chineseClaimArunachal)).toBe(false)
  })

  it("印度主张线不再绘制", () => {
    expect(
      matches(originalBoundaryDisputed, observed.indianClaimChinaIndia)
    ).toBe(true)
    expect(matches(filter, observed.indianClaimChinaIndia)).toBe(false)
    expect(matches(filter, observed.indianClaimLac)).toBe(false)
  })

  it("无归属的实控线仍按争议虚线保留", () => {
    expect(matches(filter, observed.unattributedLac)).toBe(true)
  })
})
