import type {
  ProducerMapCommunity,
  ProducerMapRegion,
  ProducerMapSeries,
} from "~/shared/api"

export const provinceOptions = [
  "北京市",
  "天津市",
  "河北省",
  "山西省",
  "内蒙古自治区",
  "辽宁省",
  "吉林省",
  "黑龙江省",
  "上海市",
  "江苏省",
  "浙江省",
  "安徽省",
  "福建省",
  "江西省",
  "山东省",
  "河南省",
  "湖北省",
  "湖南省",
  "广东省",
  "广西壮族自治区",
  "海南省",
  "重庆市",
  "四川省",
  "贵州省",
  "云南省",
  "西藏自治区",
  "陕西省",
  "甘肃省",
  "青海省",
  "宁夏回族自治区",
  "新疆维吾尔自治区",
  "台湾省",
  "香港特别行政区",
  "澳门特别行政区",
] as const

export const seriesOptions: ReadonlyArray<{
  value: ProducerMapSeries
  label: string
}> = [
  { value: "all", label: "综合 / 不限系列" },
  { value: "765", label: "765PRO ALLSTARS" },
  { value: "cg", label: "灰姑娘女孩" },
  { value: "ml", label: "百万现场" },
  { value: "sidem", label: "SideM" },
  { value: "sc", label: "闪耀色彩" },
  { value: "gakuen", label: "学园偶像大师" },
]

function shortId(): string {
  return globalThis.crypto.randomUUID().slice(0, 8)
}

export function createRegion(province: string): ProducerMapRegion {
  return {
    id: `region-${shortId()}`,
    province,
    name: province,
    summary: "",
    contact: "",
    linkUrl: null,
    imageUrl: null,
    series: "all",
    enabled: true,
  }
}

export function createCommunity(): ProducerMapCommunity {
  return {
    id: `community-${shortId()}`,
    name: "",
    platform: "QQ",
    region: null,
    description: "",
    contact: "",
    linkUrl: null,
    imageUrl: null,
    series: "all",
    enabled: true,
  }
}

export function moveItem<T>(values: T[], index: number, offset: number): T[] {
  const target = index + offset
  if (target < 0 || target >= values.length) return values
  const next = [...values]
  const [item] = next.splice(index, 1)
  next.splice(target, 0, item)
  return next
}
