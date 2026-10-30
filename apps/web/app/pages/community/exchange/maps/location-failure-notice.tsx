import { MapPinOffIcon, RotateCwIcon, XIcon } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert"
import { Button } from "~/components/ui/button"
import { IS_APP_TARGET } from "~/lib/app-target"
import type { GeolocationFailureKind } from "~/lib/geolocation"
import { cn } from "~/lib/utils"
import { useExchangeMapActions } from "../components/exchange-map-actions"
import {
  locationFailureCopy,
  placeLocationFailureNotice,
} from "./location-failure-model"

export function LocationFailureNotice({
  kind,
  size,
  occlusion,
  onRetry,
  onDismiss,
}: {
  kind: GeolocationFailureKind
  size: { width: number; height: number }
  occlusion?: { x: number; y: number; width: number; height: number } | null
  onRetry(): void
  onDismiss(): void
}) {
  const covered = Boolean(useExchangeMapActions()?.tourTarget)
  const copy = locationFailureCopy[kind]
  const width =
    size.width || (typeof window === "undefined" ? 390 : window.innerWidth)
  const layout = placeLocationFailureNotice(
    width,
    size.height || (typeof window === "undefined" ? 844 : window.innerHeight),
    occlusion
  )
  if (covered || !layout.visible) {
    return (
      <span role="status" className="sr-only">
        {copy.title}。{copy.description}
      </span>
    )
  }
  const right = `max(${width - layout.left - layout.width}px, calc(var(--safe-area-right, 0px) + 64px))`
  const left = `max(${layout.leftBoundary}px, calc(var(--safe-area-left, 0px) + 12px))`
  const bottom =
    layout.bottom !== undefined
      ? `${layout.bottom}px`
      : IS_APP_TARGET
        ? "calc(var(--app-floating-bottom) + 3rem)"
        : "80px"
  return (
    <div
      data-map-location-notice
      className="pointer-events-auto absolute z-20 overflow-y-auto rounded-2xl shadow-md"
      style={{
        right,
        width: layout.width,
        maxWidth: `max(0px, calc(100% - ${left} - ${right}))`,
        maxHeight: `max(0px, calc(100% - ${bottom} - var(--safe-area-top, 0px) - 12px))`,
        bottom,
      }}
      onPointerDown={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <Alert
        role="status"
        aria-atomic="true"
        className={cn(
          "glass-surface rounded-2xl border-primary/15 p-3 pr-14",
          IS_APP_TARGET && "exchange-map-app-surface"
        )}
      >
        <MapPinOffIcon className="size-9 rounded-xl bg-primary/8 p-2 text-primary" />
        <AlertTitle className="leading-6">{copy.title}</AlertTitle>
        <AlertDescription className="text-xs/5">
          {copy.description}
        </AlertDescription>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="absolute top-1 right-1 size-11 rounded-xl"
          aria-label="关闭定位提示"
          onClick={onDismiss}
        >
          <XIcon className="size-4" />
        </Button>
        {copy.retry ? (
          <div className="col-start-2 mt-1">
            <Button
              type="button"
              variant="outline"
              className="min-h-11 rounded-xl"
              onClick={onRetry}
            >
              <RotateCwIcon className="size-4" />
              重试定位
            </Button>
          </div>
        ) : null}
      </Alert>
    </div>
  )
}
