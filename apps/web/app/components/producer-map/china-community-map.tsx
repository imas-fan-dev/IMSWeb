import { MapChart } from "echarts/charts"
import { TooltipComponent } from "echarts/components"
import * as echarts from "echarts/core"
import { CanvasRenderer } from "echarts/renderers"
import { useEffect, useRef, useState } from "react"

import type {
  ProducerMapGeometry,
  ProducerMapRegion,
  ProducerMapSeries,
} from "~/lib/api"
import { cn } from "~/lib/utils"

echarts.use([MapChart, TooltipComponent, CanvasRenderer])

const mapName = "imsweb-producer-map"

const chinaProvinceNames = [
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

const chinaProvinceNameSet = new Set<string>(chinaProvinceNames)

const adminSeriesAreaColor: Record<ProducerMapSeries, string> = {
  all: "#ead6dd",
  "765": "#f7c5ce",
  cg: "#bdd8eb",
  ml: "#fae6a0",
  sidem: "#bae8dc",
  sc: "#d2e2f8",
  gakuen: "#f5d6a5",
}

const adminUnconfiguredAreaColor = "#f1f2f4"
const adminHiddenAreaColor = "#d1d2d6"
const adminBorderColor = "#b4b6bd"
const adminSelectedBorderColor = "#9f1f51"

const defaultPublicAriaLabel =
  "中国省级行政区制作人社群地图，选择省份查看地区资料"
const defaultAdminAriaLabel =
  "中国省级行政区制作人社群配置地图，选择省份编辑地区配置"

type MapGeoJson = Parameters<typeof echarts.registerMap>[1]
type ChinaProvinceName = (typeof chinaProvinceNames)[number]
type ChinaCommunityMapMode = "public" | "admin"

export interface ChinaCommunityMapProps {
  geometry: ProducerMapGeometry
  regions: ProducerMapRegion[]
  detailsOpen?: boolean
  onSelect: (province: string) => void
  mode?: ChinaCommunityMapMode
  selectedProvince?: string | null
  className?: string
  ariaLabel?: string
}

function toChinaProvinceName(value: unknown): ChinaProvinceName | null {
  return typeof value === "string" && chinaProvinceNameSet.has(value)
    ? (value as ChinaProvinceName)
    : null
}

function createAdminMapData(
  regions: ProducerMapRegion[],
  selectedProvince: string | null
) {
  const regionsByProvince = new Map<ChinaProvinceName, ProducerMapRegion>()

  for (const region of regions) {
    const province = toChinaProvinceName(region.province)
    if (province) regionsByProvince.set(province, region)
  }

  return chinaProvinceNames.map((province) => {
    const region = regionsByProvince.get(province)
    const selected = province === selectedProvince
    const areaColor = region
      ? region.enabled
        ? adminSeriesAreaColor[region.series]
        : adminHiddenAreaColor
      : adminUnconfiguredAreaColor

    return {
      name: province,
      itemStyle: {
        areaColor,
        borderColor: selected ? adminSelectedBorderColor : adminBorderColor,
        borderWidth: selected ? 2.5 : 0.75,
      },
      emphasis: {
        itemStyle: {
          areaColor,
          borderColor: selected ? adminSelectedBorderColor : "#747780",
          borderWidth: selected ? 3 : 1.5,
          shadowBlur: selected ? 14 : 8,
          shadowColor: selected
            ? "rgba(159, 31, 81, 0.28)"
            : "rgba(23, 23, 26, 0.16)",
        },
      },
    }
  })
}

function createAdminStatusByProvince(regions: ProducerMapRegion[]) {
  const statusByProvince = new Map<ChinaProvinceName, string>()

  for (const province of chinaProvinceNames) {
    statusByProvince.set(province, "未配置")
  }
  for (const region of regions) {
    const province = toChinaProvinceName(region.province)
    if (province) {
      statusByProvince.set(province, region.enabled ? "已公开" : "已隐藏")
    }
  }

  return statusByProvince
}

function applyMapOptions(
  chart: echarts.ECharts,
  regions: ProducerMapRegion[],
  mode: ChinaCommunityMapMode,
  selectedProvince: string | null
) {
  const adminStatusByProvince = createAdminStatusByProvince(regions)

  chart.setOption(
    {
      animationDuration: 260,
      tooltip: {
        trigger: "item",
        formatter: (params: { name?: string }) => {
          const province = toChinaProvinceName(params.name)
          if (!province) return ""

          const safeProvince = echarts.format.encodeHTML(province)
          if (mode === "public") return safeProvince

          return `${safeProvince}<br>${adminStatusByProvince.get(province)}`
        },
        backgroundColor: "rgba(20, 20, 24, 0.92)",
        borderWidth: 0,
        textStyle: { color: "#ffffff", fontSize: 12 },
      },
      series: [
        {
          type: "map",
          map: mapName,
          roam: false,
          selectedMode: false,
          layoutCenter: ["50%", "50%"],
          layoutSize: "88%",
          label: { show: false },
          itemStyle:
            mode === "public"
              ? {
                  areaColor: "#d9dade",
                  borderColor: "#9b9da4",
                  borderWidth: 0.75,
                }
              : {
                  areaColor: adminUnconfiguredAreaColor,
                  borderColor: adminBorderColor,
                  borderWidth: 0.75,
                },
          emphasis:
            mode === "public"
              ? {
                  scale: true,
                  focus: "self",
                  label: { show: true, color: "#17171a", fontSize: 11 },
                  itemStyle: {
                    areaColor: "#e67c9c",
                    borderColor: "#9f1f51",
                    borderWidth: 2,
                    shadowBlur: 18,
                    shadowColor: "rgba(181, 45, 96, 0.38)",
                  },
                }
              : {
                  scale: true,
                  focus: "self",
                  label: { show: true, color: "#17171a", fontSize: 11 },
                },
          data:
            mode === "public"
              ? regions.map((region) => ({ name: region.province }))
              : createAdminMapData(regions, selectedProvince),
        },
      ],
    },
    { notMerge: true }
  )
}

export function ChinaCommunityMap({
  geometry,
  regions,
  detailsOpen = false,
  onSelect,
  mode = "public",
  selectedProvince = null,
  className,
  ariaLabel,
}: ChinaCommunityMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<echarts.ECharts | null>(null)
  const onSelectRef = useRef(onSelect)
  const regionsRef = useRef(regions)
  const modeRef = useRef(mode)
  const selectedProvinceRef = useRef(selectedProvince)
  const [loadError, setLoadError] = useState(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    onSelectRef.current = onSelect
  }, [onSelect])

  useEffect(() => {
    regionsRef.current = regions
    modeRef.current = mode
    selectedProvinceRef.current = selectedProvince
  }, [mode, regions, selectedProvince])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const mapContainer = container

    let active = true
    let chart: echarts.ECharts | null = null
    let resizeObserver: ResizeObserver | undefined

    function mountChart() {
      try {
        const geoJson = geometry as MapGeoJson
        if (!active) return
        echarts.registerMap(mapName, geoJson)
        const mountedChart = echarts.init(mapContainer, undefined, {
          renderer: "canvas",
        })
        chart = mountedChart
        chartRef.current = mountedChart
        mountedChart.on("click", (params) => {
          const province = toChinaProvinceName(params.name)
          if (province) onSelectRef.current(province)
        })
        applyMapOptions(
          mountedChart,
          regionsRef.current,
          modeRef.current,
          selectedProvinceRef.current
        )
        resizeObserver = new ResizeObserver(() => mountedChart.resize())
        resizeObserver.observe(mapContainer)
        setLoadError(false)
        setReady(true)
      } catch {
        resizeObserver?.disconnect()
        chart?.dispose()
        if (chartRef.current === chart) chartRef.current = null
        if (active) {
          setReady(false)
          setLoadError(true)
        }
      }
    }

    mountChart()
    return () => {
      active = false
      resizeObserver?.disconnect()
      chartRef.current?.dispose()
      chartRef.current = null
    }
  }, [geometry])

  useEffect(() => {
    const chart = chartRef.current
    if (!chart || !ready) return

    applyMapOptions(chart, regions, mode, selectedProvince)
  }, [mode, ready, regions, selectedProvince])

  useEffect(() => {
    const chart = chartRef.current
    if (mode !== "public" || !chart || !ready || detailsOpen) return

    chart.dispatchAction({ type: "downplay", seriesIndex: 0 })
    chart.dispatchAction({ type: "unselect", seriesIndex: 0 })
    chart.dispatchAction({ type: "hideTip" })
  }, [detailsOpen, mode, ready])

  const mapClassName =
    mode === "public"
      ? "aspect-4/3 min-h-80 w-full sm:aspect-16/10 lg:aspect-auto lg:h-168"
      : "aspect-4/3 min-h-80 w-full"

  return (
    <div
      className={cn("relative", mapClassName, className)}
      data-map-state={loadError ? "error" : ready ? "ready" : "loading"}
    >
      <div
        ref={containerRef}
        role="img"
        aria-hidden={loadError || undefined}
        aria-label={
          ariaLabel ||
          (mode === "public" ? defaultPublicAriaLabel : defaultAdminAriaLabel)
        }
        className={cn("size-full", loadError && "invisible")}
      />
      {loadError ? (
        <div className="absolute inset-0 flex items-center justify-center border-y bg-muted/30 px-6 text-center text-sm text-muted-foreground">
          地图边界暂时无法加载，地区与社群名录仍可正常浏览。
        </div>
      ) : null}
    </div>
  )
}
