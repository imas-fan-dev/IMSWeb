/**
 * 分享页轮播的纯逻辑：自动推进的节奏、暂停判据与索引夹取。
 *
 * 组件只做接线（定时器、指针事件、键盘），所以这些判据都能脱离 DOM 单测。
 */

/** 自动播放间隔：4s 一张（prd R3）。 */
export const CAROUSEL_AUTO_ADVANCE_MS = 4000

/**
 * 轨道过渡时长（毫秒）。CSS 过渡与「落到克隆格后瞬移回真身」的定时器共用这一个值，
 * 两边必须一致，否则循环时会在动画中途闪一下。
 */
export const CAROUSEL_TRANSITION_MS = 300

/** 划动落位：位移超过预览宽度的这个比例就算换一张（宽度量不到时退回最小像素值）。 */
export const CAROUSEL_SWIPE_RATIO = 0.12

/** 划动落位的最小像素位移；窄屏上也别让「一点点位移」就翻页。 */
export const CAROUSEL_SWIPE_MIN_PX = 24

/** 快速拨动（flick）：这个时长内位移超过 `CAROUSEL_FLICK_PX` 也算换一张。 */
export const CAROUSEL_FLICK_MS = 250
export const CAROUSEL_FLICK_PX = 12

/**
 * 松手时是否换一张：先看是不是快速拨动，再看位移占预览宽度的比例。
 * 注意判据读的是**指针位移**（与图片位移 1:1），宽度只用来定阈值，不再用固定 40px ——
 * 固定阈值在宽屏上要划很长的距离、在窄屏上又太灵敏（2026-11-18 用户反馈划不动）。
 */
export function shouldStepCarousel(input: {
  dx: number
  elapsedMs: number
  width: number
}): boolean {
  const distance = Math.abs(input.dx)
  if (distance <= 0) return false
  if (input.elapsedMs <= CAROUSEL_FLICK_MS && distance >= CAROUSEL_FLICK_PX)
    return true
  return distance >= Math.max(input.width * CAROUSEL_SWIPE_RATIO, CAROUSEL_SWIPE_MIN_PX)
}

/** 与 `applyLayout` 等处同一判据：减少动态效果时不自动播放。 */
export const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)"

/** 把索引夹到 `[0, count - 1]`；没有可展示的页时一律 0。 */
export function clampCarouselIndex(index: number, count: number): number {
  if (!Number.isFinite(index) || count <= 0) return 0
  return Math.min(Math.max(Math.trunc(index), 0), count - 1)
}

/** 手动翻页（箭头 / 划动 / 键盘）：首尾循环（2026-11-18 用户要求）。 */
export function stepCarouselIndex(
  index: number,
  delta: number,
  count: number
): number {
  if (count <= 0) return 0
  const current = clampCarouselIndex(index, count)
  return (((current + delta) % count) + count) % count
}

/**
 * 循环轨道的格子数：首尾各加一个克隆（末 → 首），拖动时两端才有「下一张」可露出来。
 * 只有 1 张（或 0 张）时不循环，也就没有克隆。
 */
export function carouselTrackLength(count: number, loop: boolean): number {
  return loop ? count + 2 : count
}

/** 逻辑索引 → 轨道格。循环时整体后移一格（第 0 格是末张克隆）。 */
export function carouselTrackPosition(
  index: number,
  count: number,
  loop: boolean
): number {
  const clamped = clampCarouselIndex(index, count)
  return loop ? clamped + 1 : clamped
}

/** 轨道格 → 逻辑索引（角标、计数、指示点都读它）。 */
export function carouselTrackIndex(
  track: number,
  count: number,
  loop: boolean
): number {
  if (!loop) return clampCarouselIndex(track, count)
  if (track <= 0) return Math.max(count - 1, 0)
  if (track >= count + 1) return 0
  return clampCarouselIndex(track - 1, count)
}

/**
 * 停在克隆格上时要瞬移回的真身格；不是克隆格则 `null`。
 * 不瞬移的话，再往前走一步就会走出轨道（`-1` 或 `count + 2`）。
 */
export function carouselTeleportTarget(
  track: number,
  count: number,
  loop: boolean
): number | null {
  if (!loop || count <= 1) return null
  if (track <= 0) return count
  if (track >= count + 1) return 1
  return null
}
