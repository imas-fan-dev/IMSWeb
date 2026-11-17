/**
 * 批量拖动落点 ghost 的两处动画的**纯逻辑**：
 *
 * 1. 整批插入时被顶开的瓦片的位移（FLIP 的坐标数学，DOM 读写在
 *    `hooks/use-card-grid-flip.ts`）；
 * 2. 落点 ghost 展开/收起的「进入」动画的错峰（DOM 在
 *    `components/card-drag-ghost.tsx`，keyframes 在 `styles/namecard-editor.css`）。
 *
 * 只放在这里的是能脱离 DOM 单测的部分——jsdom 量不出布局，坐标数学只能这样验。
 */

/** FLIP 位移时长（ms）：与单张拖动时 dnd-kit 自己的位移观感（200ms）接近、略快一点。 */
export const CARD_FLIP_DURATION_MS = 180

/**
 * 幅值保护的倍数：一次提交里某张瓦片的位移超过「容器尺寸 × 这个倍数」，几乎一定是量错了
 * （容器滚动没补偿干净、过渡半路量到、布局抖动）。那一帧整批不写位移、改当新基线——
 * 网格里的瓦片只会互相让位，位移绝不会大过一屏。
 */
export const MAX_CARD_FLIP_OFFSET_RATIO = 2

/**
 * FLIP 位移用的缓动。**同时是「这段 transition 是不是我们写的」的标记**：
 * 会话结束时清理内联样式，靠它把我们写的 transition 与 dnd-kit 自己的（`ease`）分开，
 * 免得把 dnd-kit 的收尾动画一起抹掉。
 */
export const CARD_FLIP_EASING = "cubic-bezier(0.2, 0, 0, 1)"

/** 展开的 ghost 最多错峰到第几档：20 张也只错 6 档，拖尾不至于太长。 */
export const GHOST_ENTER_STAGGER_LIMIT = 6

/** 相邻两个 ghost 格子的进入间隔（ms）。 */
export const GHOST_ENTER_STAGGER_MS = 30

/** ghost 进入动画的类名（合集与每个展开格子共用），keyframes 见 `styles/namecard-editor.css`。 */
export const GHOST_ENTER_CLASS_NAME = "namecard-ghost-enter"

/** 一帧里的位移量：把瓦片「倒着放」回它上一帧所在的位置。 */
export type CardFlipOffset = { dx: number; dy: number }

/** FLIP 只关心位置；`width`/`height` 参与类型但**不**参与计算（尺寸变化不做动画）。 */
export type CardFlipRect = {
  left: number
  top: number
  width: number
  height: number
}

/**
 * FLIP 的位移量：`before` 里每张卡相对 `after` 里的新位置要「倒着放」多少。
 *
 * - 只返回**两边都在**、且位置真的变了的项：拖动中整批移出列表的卡在新一帧里没有节点，
 *   量不到位置，跳过即可；
 * - 有没有位移只看 `left`/`top`，尺寸变了不算位移（网格等宽等高，尺寸变化不做动画）。
 */
export function flipOffsets(
  before: ReadonlyMap<string, CardFlipRect>,
  after: ReadonlyMap<string, CardFlipRect>
): Map<string, CardFlipOffset> {
  const offsets = new Map<string, CardFlipOffset>()
  for (const [key, previous] of before) {
    const next = after.get(key)
    if (!next) continue
    const dx = previous.left - next.left
    const dy = previous.top - next.top
    if (dx === 0 && dy === 0) continue
    offsets.set(key, { dx, dy })
  }
  return offsets
}

/**
 * 这批位移里有没有一张大到不可能是真的（超过容器两倍宽/高）。有的话这一帧整批作废：
 * 等于不做动画，也把这一刻当成新基线（见 `use-card-grid-flip.ts`）。
 */
export function exceedsCardFlipOffsetLimit(
  offsets: ReadonlyMap<string, CardFlipOffset>,
  rootWidth: number,
  rootHeight: number
): boolean {
  const limitX = MAX_CARD_FLIP_OFFSET_RATIO * rootWidth
  const limitY = MAX_CARD_FLIP_OFFSET_RATIO * rootHeight
  for (const { dx, dy } of offsets.values()) {
    if (Math.abs(dx) > limitX || Math.abs(dy) > limitY) return true
  }
  return false
}

/** 内联 `transform` 的值：只写平移（缩放/旋转属于别的层）。 */
export function cardFlipTransform(offset: CardFlipOffset): string {
  return `translate(${offset.dx}px, ${offset.dy}px)`
}

/** 读回我们自己写下去的位移；不是这个格式（例如 dnd-kit 的 `translate3d`）时返回 `null`。 */
export function cardFlipOffsetFromStyle(
  value: string | null | undefined
): CardFlipOffset | null {
  const match = /^translate\((-?\d+(?:\.\d+)?)px, (-?\d+(?:\.\d+)?)px\)$/.exec(
    value ?? ""
  )
  if (!match) return null
  return { dx: Number(match[1]), dy: Number(match[2]) }
}

/**
 * 计算样式里的 `transform` → 平移量。
 *
 * 浏览器把 `transform` 的计算值序列化成单个矩阵：`matrix(a, b, c, d, tx, ty)`，3D 是
 * `matrix3d(…)`（平移在 `m41`/`m42`，也就是第 13、14 个数）；jsdom 没有布局，会把作者写的
 * 函数原样返回（`translate(…)`），两种形态都得认。读**计算**样式而不是内联样式，是因为过渡
 * 途中内联值已经摘掉，而计算值是**插值中**的那一个——量自然位置与写回倒放偏移都要用它
 * （见 `hooks/use-card-grid-flip.ts`）。
 *
 * 认不出的值（`none`、空串、别的函数）当 0：调用方拿到的永远是「减多少 / 加多少」，
 * 不需要再判空。
 */
export function cardFlipOffsetFromComputedStyle(
  value: string | null | undefined
): CardFlipOffset {
  const match = /^(matrix3d|matrix|translate3d|translate)\(([^)]*)\)/.exec(
    value ?? ""
  )
  const parts = (match?.[2] ?? "")
    .split(",")
    .map((part) => Number.parseFloat(part))
  const at = (index: number) => {
    const part = parts[index]
    return typeof part === "number" && Number.isFinite(part) ? part : 0
  }
  switch (match?.[1]) {
    case "matrix":
      // matrix(a, b, c, d, tx, ty)
      return { dx: at(4), dy: at(5) }
    case "matrix3d":
      return { dx: at(12), dy: at(13) }
    default:
      // translate(x, y) / translate3d(x, y, z)（jsdom 会把作者写的值原样返回）
      return { dx: at(0), dy: at(1) }
  }
}

/** 承接位移的内联 `transition`（从「倒着放」回到自然位置）。 */
export function cardFlipTransition(): string {
  return `transform ${CARD_FLIP_DURATION_MS}ms ${CARD_FLIP_EASING}`
}

/** 「倒着放」那一步要临时关掉过渡，否则动画会从原点缓慢爬过去。 */
export const CARD_FLIP_INVERT_TRANSITION = "none"

/**
 * 这段 `transition` 是不是 FLIP 写下去的（收尾时据此判断该不该清掉）。两种形态都算：
 * 倒放那一步的 `none`，以及承接位移的那条。浏览器会把 `180ms` 序列化成 `0.18s`，
 * 用时长判定不稳，所以承接态认缓动这个我们独有的值。
 */
export function isCardFlipTransition(value: string): boolean {
  return (
    value === CARD_FLIP_INVERT_TRANSITION || value.includes(CARD_FLIP_EASING)
  )
}

/** 第 `index` 个展开 ghost 的进入延迟：按档错峰，最多 `GHOST_ENTER_STAGGER_LIMIT` 档。 */
export function ghostEnterDelayMs(index: number): number {
  const step = Math.min(Math.max(index, 0), GHOST_ENTER_STAGGER_LIMIT - 1)
  return step * GHOST_ENTER_STAGGER_MS
}
