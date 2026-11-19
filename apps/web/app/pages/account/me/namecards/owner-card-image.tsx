import { CardImage } from "~/components/shared/card-image"
import { cn } from "~/lib/utils"

/**
 * 属主侧的名片图。默认铺满容器（`size-full`）；传了 `className` 就由调用方决定尺寸，
 * 例如清单瓦片要让图片按自身比例居中并自带边框（`max-h-full max-w-full border …`）。
 */
export function OwnerCardImage({
  src,
  className,
}: {
  src: string
  className?: string
}) {
  return (
    <CardImage
      src={src}
      alt=""
      className={cn("object-contain", className ?? "size-full")}
      fallback={
        <span className="flex size-full items-center justify-center text-xs text-muted-foreground">
          加载图片
        </span>
      }
      failedFallback={
        <span className="flex size-full items-center justify-center text-xs text-muted-foreground">
          图片加载失败
        </span>
      }
    />
  )
}
