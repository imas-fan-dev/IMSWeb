import { useOwnerCardMedia } from "./use-owner-card-media"

export function OwnerCardImage({ src }: { src: string }) {
  const media = useOwnerCardMedia(src)
  return media.src ? (
    <img src={media.src} alt="" className="size-full object-contain" />
  ) : (
    <span className="flex size-full items-center justify-center text-xs text-muted-foreground">
      {media.failed ? "图片加载失败" : "加载图片"}
    </span>
  )
}
