export type GuideRect = { x: number; y: number; width: number; height: number }
export type GuidePlacement = "center" | "right" | "left" | "above" | "below"
export type GuideLayout = {
  card: GuideRect
  spotlight: GuideRect | null
  placement: GuidePlacement
  compact: boolean
  scrollWholeCard: boolean
  scrollContent: boolean
}

const right = (rect: GuideRect) => rect.x + rect.width
const bottom = (rect: GuideRect) => rect.y + rect.height
const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(value, max))

function intersect(a: GuideRect, b: GuideRect): GuideRect | null {
  const x = Math.max(a.x, b.x),
    y = Math.max(a.y, b.y)
  const width = Math.min(right(a), right(b)) - x
  const height = Math.min(bottom(a), bottom(b)) - y
  return width > 0 && height > 0 ? { x, y, width, height } : null
}

/** Only the visible part of a target should be cut out of the dimmed surface. */
function guideSpotlight(target: GuideRect | null, viewport: GuideRect) {
  if (!target || !intersect(target, viewport)) return null
  return intersect(
    {
      x: target.x - 5,
      y: target.y - 5,
      width: target.width + 10,
      height: target.height + 10,
    },
    viewport
  )
}

/** Position a measured card beside its target, inside the current safe visual viewport. */
export function placeMapGuide({
  viewport,
  target,
  naturalHeight,
  actionsHeight,
  initial,
  compact,
}: {
  viewport: GuideRect
  target: GuideRect | null
  naturalHeight: number
  actionsHeight: number
  initial: boolean
  compact: boolean
}): GuideLayout {
  const margin = compact ? 12 : 24
  const insetX = Math.min(margin, viewport.width / 4)
  const insetY = Math.min(margin, viewport.height / 4)
  const bounds = {
    x: viewport.x + insetX,
    y: viewport.y + insetY,
    width: Math.max(0, viewport.width - insetX * 2),
    height: Math.max(0, viewport.height - insetY * 2),
  }
  const width = Math.min(compact ? 360 : 384, bounds.width)
  const height = Math.min(Math.ceil(naturalHeight), bounds.height)
  const visible = target && intersect(target, viewport)
  const spotlight = guideSpotlight(target, viewport)
  const centered = (): GuideLayout => ({
    card: {
      x: bounds.x + (bounds.width - width) / 2,
      y: bounds.y + (bounds.height - height) / 2,
      width,
      height,
    },
    spotlight,
    placement: "center",
    compact,
    scrollWholeCard: height < actionsHeight + 64,
    scrollContent: height < naturalHeight,
  })
  if (initial || !visible) return centered()

  const gap = compact ? 12 : 16
  if (!compact) {
    const sideWidth = Math.min(384, right(bounds) - right(visible) - gap)
    const leftWidth = Math.min(384, visible.x - bounds.x - gap)
    const side = sideWidth >= 280 ? "right" : leftWidth >= 280 ? "left" : null
    if (side) {
      const fittedWidth = side === "right" ? sideWidth : leftWidth
      return {
        ...centered(),
        placement: side,
        card: {
          x:
            side === "right"
              ? right(visible) + gap
              : visible.x - gap - fittedWidth,
          y: clamp(
            visible.y + (visible.height - height) / 2,
            bounds.y,
            bottom(bounds) - height
          ),
          width: fittedWidth,
          height,
        },
      }
    }
  }

  const spaces = {
    above: Math.max(0, visible.y - bounds.y - gap),
    below: Math.max(0, bottom(bounds) - bottom(visible) - gap),
  }
  const preferred =
    visible.y + visible.height / 2 > bounds.y + bounds.height / 2
      ? "above"
      : "below"
  const opposite = preferred === "above" ? "below" : "above"
  const minimum = Math.min(naturalHeight, Math.max(144, actionsHeight + 64))
  const placement =
    spaces[preferred] >= naturalHeight
      ? preferred
      : spaces[opposite] >= naturalHeight
        ? opposite
        : spaces[preferred] >= spaces[opposite]
          ? preferred
          : opposite
  if (spaces[placement] < minimum) return centered()
  const fittedHeight = Math.min(height, spaces[placement])
  return {
    ...centered(),
    placement,
    card: {
      x: compact
        ? bounds.x + (bounds.width - width) / 2
        : clamp(
            visible.x + (visible.width - width) / 2,
            bounds.x,
            right(bounds) - width
          ),
      y:
        placement === "above"
          ? visible.y - gap - fittedHeight
          : bottom(visible) + gap,
      width,
      height: fittedHeight,
    },
    scrollWholeCard: fittedHeight < actionsHeight + 64,
    scrollContent: fittedHeight < naturalHeight,
  }
}
