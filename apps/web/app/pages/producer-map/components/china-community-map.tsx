import { MapChart } from "echarts/charts"
import { TooltipComponent } from "echarts/components"
import * as echarts from "echarts/core"
import { CanvasRenderer } from "echarts/renderers"
import { useEffect, useRef, useState } from "react"

import { getProducerMapGeometry, type ProducerMapRegion } from "~/shared/api"

echarts.use([MapChart, TooltipComponent, CanvasRenderer])

const mapName = "imsweb-producer-map"

type MapGeoJson = Parameters<typeof echarts.registerMap>[1]

export function ChinaCommunityMap({
  regions,
  detailsOpen,
  onSelect,
}: {
  regions: ProducerMapRegion[]
  detailsOpen: boolean
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
            selectedMode: false,
            layoutCenter: ["50%", "50%"],
            layoutSize: "88%",
            label: { show: false },
            itemStyle: {
              areaColor: "#d9dade",
              borderColor: "#9b9da4",
              borderWidth: 0.75,
            },
            emphasis: {
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
            },
            data: regions.map((region) => ({
              name: region.province,
            })),
          },
        ],
      },
      { notMerge: true }
    )
  }, [ready, regions])

  useEffect(() => {
    const chart = chartRef.current
    if (!chart || !ready || detailsOpen) return

    chart.dispatchAction({ type: "downplay", seriesIndex: 0 })
    chart.dispatchAction({ type: "unselect", seriesIndex: 0 })
    chart.dispatchAction({ type: "hideTip" })
  }, [detailsOpen, ready])

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
      aria-label="中国省级行政区制作人社群地图，选择省份查看地区资料"
      className="aspect-[4/3] min-h-80 w-full sm:aspect-[16/10] lg:aspect-auto lg:h-[42rem]"
    />
  )
}
