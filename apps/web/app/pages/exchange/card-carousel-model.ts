/**
 * 分享页轮播的纯逻辑：自动推进的节奏、暂停判据与索引夹取。
 *
 * 组件只做接线（定时器、指针事件、键盘），所以这些判据都能脱离 DOM 单测。
 */

/** 自动播放间隔：4s 一张（prd R3）。 */
export const CAROUSEL_AUTO_ADVANCE_MS = 4000

/** 指针 / 触摸横向划动超过这个距离才算换一张。 */
export const CAROUSEL_SWIPE_THRESHOLD_PX = 40

/** 与 `applyLayout` 等处同一判据：减少动态效果时不自动播放。 */
export const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)"

/** 把索引夹到 `[0, count - 1]`；没有可展示的页时一律 0。 */
export function clampCarouselIndex(index: number, count: number): number {
  if (!Number.isFinite(index) || count <= 0) return 0
  return Math.min(Math.max(Math.trunc(index), 0), count - 1)
}

/** 手动翻页（箭头 / 划动 / 键盘）：到头就停在两端，不循环。 */
export function stepCarouselIndex(
  index: number,
  delta: number,
  count: number
): number {
  return clampCarouselIndex(index + delta, count)
}

/** 自动播放的下一张：走到末尾回到第一张；只有 1 张（或 0 张）时没有下一张。 */
export function nextAutoCarouselIndex(
  index: number,
  count: number
): number | null {
  if (count <= 1) return null
  const current = clampCarouselIndex(index, count)
  return current + 1 >= count ? 0 : current + 1
}
