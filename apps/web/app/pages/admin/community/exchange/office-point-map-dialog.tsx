import { useEffect, useState } from "react"
import { OfficeEditorDialog } from "~/components/community/office-editor-dialog"
import { Button } from "~/components/ui/button"
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert"
import { Skeleton } from "~/components/ui/skeleton"
import { getAdminOfficeMapConfig, sendWithAbort } from "~/lib/api"
import {
  loadExchangeMapRenderer,
  type ExchangeMapRenderer,
} from "~/pages/community/exchange/maps/exchange-map-renderer"
import type { MapPosition } from "~/lib/maps/map-engine"

const emptyGroups: [] = []
const ignore = () => {}

export function OfficePointMapDialog({
  position,
  address,
  title,
  onClose,
}: {
  position: MapPosition
  address: string
  title: string
  onClose(): void
}) {
  const [loaded, setLoaded] = useState<{
    Renderer: ExchangeMapRenderer
    identity: string
  } | null>(null)
  const [error, setError] = useState("")
  const [attempt, setAttempt] = useState(0)
  const [longitude, latitude] = position
  const identity = `${longitude},${latitude}:${attempt}`
  const renderable = Math.abs(latitude) <= 85.051129
  useEffect(() => {
    if (!renderable) return
    const controller = new AbortController()
    void (async () => {
      await Promise.resolve()
      if (controller.signal.aborted) return
      setError("")
      const config = await sendWithAbort(
        getAdminOfficeMapConfig(),
        controller.signal
      )
      const Renderer = await loadExchangeMapRenderer(config)
      if (!controller.signal.aborted) setLoaded({ Renderer, identity })
    })().catch(() => {
      if (!controller.signal.aborted)
        setError("地图暂时无法加载，文字地址和原始坐标仍可核对。")
    })
    return () => controller.abort()
  }, [identity, renderable])
  const Renderer = loaded?.identity === identity ? loaded.Renderer : null
  return (
    <OfficeEditorDialog
      open
      title="事务所坐标预览"
      onClose={onClose}
      footer={
        <Button variant="outline" onClick={onClose}>
          关闭地图
        </Button>
      }
    >
      <div className="space-y-3">
        <p className="font-medium">{title}</p>
        <p className="text-sm wrap-break-word text-muted-foreground">
          {address}
        </p>
        <p className="font-mono text-sm break-all">
          WGS84 · 纬度 {latitude}° · 经度 {longitude}°
        </p>
        {!renderable ? (
          <p role="status">
            此纬度超出当前底图可显示范围，以上保留原始精确坐标。
          </p>
        ) : error ? (
          <Alert variant="destructive">
            <AlertTitle>地图不可用</AlertTitle>
            <AlertDescription>
              {error}
              <Button
                variant="outline"
                onClick={() => setAttempt((value) => value + 1)}
              >
                重试地图
              </Button>
            </AlertDescription>
          </Alert>
        ) : (
          <div className="relative h-[clamp(16rem,50dvh,30rem)] overflow-hidden rounded-lg border">
            {Renderer ? (
              <Renderer
                groups={emptyGroups}
                selectedGroupKey={null}
                initialViewport={{ center: [longitude, latitude], zoom: 16 }}
                selectedPlace={{
                  id: "review-point",
                  label: title,
                  address,
                  target: { kind: "wgs84", position: [longitude, latitude] },
                }}
                persistViewport={false}
                onSelectGroup={ignore}
                onViewportChange={ignore}
                onFatalError={() =>
                  setError("地图暂时无法加载，文字地址和原始坐标仍可核对。")
                }
              />
            ) : (
              <Skeleton className="size-full" />
            )}
          </div>
        )}
      </div>
    </OfficeEditorDialog>
  )
}
