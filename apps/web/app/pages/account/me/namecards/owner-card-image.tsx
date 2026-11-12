import { CardImage } from "~/components/shared/card-image"

export function OwnerCardImage({ src }: { src: string }) {
  return (
    <CardImage
      src={src}
      alt=""
      className="size-full object-contain"
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
