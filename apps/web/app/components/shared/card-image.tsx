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
  onLoad,
  onError,
}: CardImageProps) {
  const media = useOwnerCardMedia(src ?? null)
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
