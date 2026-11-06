import type { MapPosition } from "./map-engine"

export type MapCameraChange =
  | { origin: "user"; interactionTime: number }
  | { origin: "programmatic" }

/** Installed SDK handlers propagate the DOM event through inertia and keyboard easeTo.
 * Resize also has originalEvent, so presence alone must never authorize a point. */
export function cameraChangeSource(event?: unknown): MapCameraChange {
  const original =
    typeof event === "object" && event !== null && "originalEvent" in event
      ? event.originalEvent
      : undefined
  return original instanceof Event &&
    [
      "mousedown",
      "mousemove",
      "mouseup",
      "touchstart",
      "touchmove",
      "touchend",
      "wheel",
      "keydown",
    ].includes(original.type)
    ? { origin: "user", interactionTime: original.timeStamp }
    : { origin: "programmatic" }
}

export function canonicalCameraPosition(
  position: MapPosition
): MapPosition | null {
  const [longitude, latitude] = position
  if (
    !Number.isFinite(longitude) ||
    !Number.isFinite(latitude) ||
    Math.abs(latitude) > 90
  )
    return null
  return [
    longitude >= -180 && longitude <= 180
      ? longitude
      : ((((longitude + 180) % 360) + 360) % 360) - 180,
    latitude,
  ]
}
