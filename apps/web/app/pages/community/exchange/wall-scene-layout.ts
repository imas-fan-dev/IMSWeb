import type { FudabaWallLayoutItem } from "@imsweb/contracts/fudaba/messages"
import type { WallBounds } from "./wall-viewport"

export function wallItemKey(item: Pick<FudabaWallLayoutItem, "kind" | "id">) {
  return `${item.kind}:${item.id}`
}
export function wallLayoutIntersects(
  item: Pick<FudabaWallLayoutItem, "placement" | "width" | "height">,
  bounds: WallBounds
) {
  const radians = (item.placement.rotation * Math.PI) / 180
  const rx =
    (Math.abs(Math.cos(radians)) * item.width) / 2 +
    (Math.abs(Math.sin(radians)) * item.height) / 2 +
    16
  const ry =
    (Math.abs(Math.sin(radians)) * item.width) / 2 +
    (Math.abs(Math.cos(radians)) * item.height) / 2 +
    16
  return (
    item.placement.x + rx >= bounds[0] &&
    item.placement.x - rx <= bounds[2] &&
    item.placement.y + ry >= bounds[1] &&
    item.placement.y - ry <= bounds[3]
  )
}
export function mergeWallLayouts(
  previous: FudabaWallLayoutItem[],
  incoming: FudabaWallLayoutItem[]
) {
  const items = new Map(previous.map((item) => [wallItemKey(item), item]))
  for (const item of incoming) {
    const key = wallItemKey(item)
    const old = items.get(key)
    const next =
      old && old.placement.revision > item.placement.revision
        ? { ...item, placement: old.placement }
        : item
    items.set(
      key,
      old?.kind === "message" &&
        next.kind === "message" &&
        old.contentRevision > next.contentRevision
        ? {
            ...next,
            height: old.height,
            color: old.color,
            contentRevision: old.contentRevision,
          }
        : next
    )
  }
  return [...items.values()]
}
