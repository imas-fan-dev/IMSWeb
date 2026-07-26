import { MapChart } from "echarts/charts"
import { TooltipComponent } from "echarts/components"
import * as echarts from "echarts/core"
import { CanvasRenderer } from "echarts/renderers"
import { useEffect, useRef, useState } from "react"

import {
  getProducerMapGeometry,
  type ProducerMapRegion,
  type ProducerMapSeries,
} from "~/shared/api"

echarts.use([MapChart, TooltipComponent, CanvasRenderer])

const mapName = "imsweb-producer-map"

const seriesColors: Record<ProducerMapSeries, string> = {
  all: "#c7c9ce",
  "765": "#df647f",
  cg: "#5d8fd8",
  ml: "#d8a94c",
  sidem: "#4aa879",
  sc: "#9b78c8",
  gakuen: "#d97355",
}

type MapGeoJson = Parameters<typeof echarts.registerMap>[1]

export function ChinaCommunityMap({
  regions,
  selectedProvince,
  onSelect,
}: {
  regions: ProducerMapRegion[]
  selectedProvince: string | null
  onSelect: (province: string) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<echarts.ECharts | null>(null)
  const onSelectRef = useRef(onSelect)
  const [loadError, setLoadError] = useState(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    onSelectRef.current = onSelect
  }, [onSelect])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const mapContainer = container

    let active = true
    let resizeObserver: ResizeObserver | undefined

    async function mountChart() {
      try {
        const geometry = await getProducerMapGeometry().send()
        const geoJson = geometry as MapGeoJson
        if (!active) return
        echarts.registerMap(mapName, geoJson)
        const chart = echarts.init(mapContainer, undefined, {
          renderer: "canvas",
        })
        chart.on("click", (params) => {
          if (typeof params.name === "string" && params.name) {
            onSelectRef.current(params.name)
          }
        })
        chartRef.current = chart
        resizeObserver = new ResizeObserver(() => chart.resize())
        resizeObserver.observe(mapContainer)
        setReady(true)
      } catch {
        if (active) setLoadError(true)
      }
    }

    void mountChart()
    return () => {
      active = false
      resizeObserver?.disconnect()
      chartRef.current?.dispose()
      chartRef.current = null
    }
  }, [])

  useEffect(() => {
    const chart = chartRef.current
    if (!chart || !ready) return

    chart.setOption(
      {
        animationDuration: 260,
        tooltip: {
          trigger: "item",
          formatter: (params: { name?: string }) => params.name || "",
          backgroundColor: "rgba(20, 20, 24, 0.92)",
          borderWidth: 0,
          textStyle: { color: "#ffffff", fontSize: 12 },
        },
        series: [
          {
            type: "map",
            map: mapName,
            roam: false,
            selectedMode: "single",
            layoutCenter: ["50%", "50%"],
            layoutSize: "96%",
            label: { show: false },
            itemStyle: {
              areaColor: "#e7e8eb",
              borderColor: "#a9abb1",
              borderWidth: 0.75,
            },
            emphasis: {
              label: { show: true, color: "#17171a", fontSize: 11 },
              itemStyle: {
                areaColor: "#f2afc0",
                borderColor: "#b52d60",
                borderWidth: 1.5,
              },
            },
            select: {
              label: { show: true, color: "#17171a", fontSize: 11 },
              itemStyle: {
                areaColor: "#e67c9c",
                borderColor: "#9f1f51",
                borderWidth: 1.5,
              },
            },
            data: regions.map((region) => ({
              name: region.province,
              selected: region.province === selectedProvince,
              itemStyle: { areaColor: seriesColors[region.series] },
            })),
          },
        ],
      },
      { notMerge: true }
    )
  }, [ready, regions, selectedProvince])

  if (loadError) {
    return (
      <div className="flex aspect-[4/3] min-h-80 items-center justify-center border-y bg-muted/30 px-6 text-center text-sm text-muted-foreground lg:aspect-auto lg:h-[38rem]">
        地图边界暂时无法加载，地区与社群名录仍可正常浏览。
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      role="img"
      aria-label="中国省级行政区制作人社群地图"
      className="aspect-[4/3] min-h-80 w-full lg:aspect-auto lg:h-[38rem]"
    />
  )
}
