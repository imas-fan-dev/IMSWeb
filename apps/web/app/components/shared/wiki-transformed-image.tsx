import { useState, type ComponentProps } from "react"

import { cn } from "~/lib/utils"
import { defaultWikiImageTransform, type WikiImageTransform } from "~/lib/api"

type WikiTransformedImageProps = Omit<ComponentProps<"img">, "style"> & {
  transform?: WikiImageTransform
  fallbackSrc?: string | null
  fallbackTransform?: WikiImageTransform
  style?: ComponentProps<"img">["style"]
}

export function WikiTransformedImage(props: WikiTransformedImageProps) {
  return (
    <StatefulWikiTransformedImage
      key={`${props.src ?? ""}\u0000${props.fallbackSrc ?? ""}`}
      {...props}
    />
  )
}

function StatefulWikiTransformedImage({
  src,
  transform = defaultWikiImageTransform,
  fallbackSrc,
  fallbackTransform = defaultWikiImageTransform,
  className,
  style,
  onError,
  ...props
}: WikiTransformedImageProps) {
  const [usingFallback, setUsingFallback] = useState(false)

  const activeTransform = usingFallback ? fallbackTransform : transform
  const activeSrc = usingFallback ? fallbackSrc || src : src

  return (
    <img
      src={activeSrc}
      className={cn("size-full will-change-transform", className)}
      style={{
        objectFit: activeTransform.fit,
        objectPosition: `${activeTransform.focalX * 100}% ${activeTransform.focalY * 100}%`,
        transform: `rotate(${activeTransform.rotation}deg) scale(${activeTransform.zoom})`,
        transformOrigin: "center",
        ...style,
      }}
      onError={(event) => {
        if (!usingFallback && fallbackSrc && fallbackSrc !== src) {
          setUsingFallback(true)
        }
        onError?.(event)
      }}
      {...props}
    />
  )
}
