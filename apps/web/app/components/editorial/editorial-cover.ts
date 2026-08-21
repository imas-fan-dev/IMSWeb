import type { CSSProperties } from "react"

import type { EditorialCoverTransform } from "~/lib/api"

export const defaultEditorialCoverTransform: EditorialCoverTransform = {
  focalX: 0.5,
  focalY: 0.5,
  zoom: 1,
}

export function editorialCoverStyle(
  transform: EditorialCoverTransform = defaultEditorialCoverTransform
): CSSProperties {
  return {
    objectPosition: `${transform.focalX * 100}% ${transform.focalY * 100}%`,
    transform: `scale(${transform.zoom})`,
    transformOrigin: "center",
  }
}
