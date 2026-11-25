import { Button } from "~/components/ui/button"
import { LoaderCircleIcon } from "lucide-react"
import type { FudabaWallLayoutItem } from "@imsweb/contracts/fudaba/messages"
import { cn } from "~/lib/utils"
import { noteColors } from "./wall-message-note"

export function WallObjectPlaceholder({
  item,
  error,
  onRetry,
}: {
  item: FudabaWallLayoutItem
  error?: string | null
  onRetry?: () => void
}) {
  return (
    <div
      data-wall-placeholder={`${item.kind}:${item.id}`}
      role="group"
      aria-busy={!error}
      aria-label={
        item.kind === "card" ? `${item.displayName}加载中` : "便签加载中"
      }
      className="pointer-events-none absolute"
      style={{
        left: item.placement.x,
        top: item.placement.y,
        width: item.width,
        height: item.height,
        zIndex: item.placement.zIndex,
        transform: `translate(-50%, -50%) rotate(${item.placement.rotation}deg)`,
      }}
    >
      <div
        className={cn(
          "absolute inset-0 overflow-hidden rounded-sm border bg-card shadow-sm",
          item.kind === "message" &&
            noteColors.find((color) => color.value === item.color)?.paper
        )}
      >
        {item.kind === "card" && item.preview ? (
          <img
            src={item.preview}
            alt=""
            className="size-full scale-105 object-contain blur-sm"
          />
        ) : (
          <div className="space-y-3 p-6 blur-sm">
            <div className="h-3 w-4/5 rounded bg-foreground/15" />
            <div className="h-3 w-3/5 rounded bg-foreground/10" />
            <div className="h-3 w-2/3 rounded bg-foreground/10" />
          </div>
        )}
      </div>
      <span className="absolute inset-0 grid place-items-center">
        <span className="rounded-full bg-background/80 p-2 shadow">
          {error ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="pointer-events-auto"
              title={error}
              onClick={onRetry}
            >
              重试加载
            </Button>
          ) : (
            <LoaderCircleIcon
              aria-hidden="true"
              className="size-5 animate-spin motion-reduce:animate-none"
            />
          )}
        </span>
      </span>
    </div>
  )
}
