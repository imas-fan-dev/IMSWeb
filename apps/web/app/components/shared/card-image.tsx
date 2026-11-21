import type { CSSProperties, ReactNode, SyntheticEvent } from "react"

import { useOwnerCardMedia } from "./use-owner-card-media"

export interface CardImageProps {
  src: string | null | undefined
  alt?: string
  className?: string
  style?: CSSProperties
  loading?: "eager" | "lazy"
  decoding?: "async" | "auto" | "sync"
  draggable?: boolean
  fallback?: ReactNode
  failedFallback?: ReactNode
  /**
   * 交换墙的图默认匿名可读；这张卡对所有匿名读者关闭时才置 true，让凭据生效
   * （App 没有 cookie，只能靠 Bearer）。
   */
  authorize?: boolean
  onLoad?: (event: SyntheticEvent<HTMLImageElement>) => void
  onError?: (event: SyntheticEvent<HTMLImageElement>) => void
}

/**
 * The single image renderer for namecard art.
 *
 * Owner media URLs need a Bearer-authenticated blob fetch; public, admin and
 * review URLs are already browser-addressable (public or Cookie scoped).
 * `useOwnerCardMedia` detects that difference, so callers only pass a URL.
 */
export function CardImage({
  src,
  alt = "",
  className,
  style,
  loading,
  decoding,
  draggable,
  fallback = null,
  failedFallback,
  authorize = false,
  onLoad,
  onError,
}: CardImageProps) {
  const media = useOwnerCardMedia(src ?? null, { authorize })
  if (!media.src) {
    return media.failed ? (failedFallback ?? fallback) : fallback
  }
  return (
    <img
      src={media.src}
      alt={alt}
      className={className}
      style={style}
      loading={loading}
      decoding={decoding}
      draggable={draggable}
      onLoad={onLoad}
      onError={onError}
    />
  )
}
