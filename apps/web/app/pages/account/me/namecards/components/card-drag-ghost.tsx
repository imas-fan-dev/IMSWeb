import type { FudabaOwnerCard } from "~/lib/api"
import { cn } from "~/lib/utils"
import { useMediaQuery } from "~/lib/use-media-query"
import {
  GHOST_ENTER_CLASS_NAME,
  ghostEnterDelayMs,
} from "../card-grid-animation"
import { REDUCED_MOTION_QUERY } from "../card-manager-model"
import { CardTile } from "../card-tile"
import { CardStack } from "./card-drag-layer"

/**
 * 未展开时的「合集 ghost」：占**一个**格子，内容就是这批名片叠成的一摞（`CardStack`——
 * 真实缩略图、第一张在最上面、带旋转、超过 3 张时 `+N`），和指针上拿起的那一摞同一套视觉。
 *
 * 整块只是落点预览：`pointer-events-none` + 外层 `aria-hidden`（读屏播报走 `aria-live`），
 * `opacity-70` 让它和真瓦片能区分开。挂上来的那一刻走一次进入动画（淡入 + 轻微上浮/缩放）：
 * 收起（展开态换回这一摞）时也因此不会硬跳。`prefers-reduced-motion` 下不加动画，直接出现。
 */
export function CardDragGhostStack({
  cards,
}: {
  cards: readonly FudabaOwnerCard[]
}) {
  const reduceMotion = useMediaQuery(REDUCED_MOTION_QUERY)
  return (
    <div
      aria-hidden="true"
      data-testid="card-drag-ghost"
      data-variant="stack"
      data-ghost-count={cards.length}
      className={cn(
        "pointer-events-none relative min-w-0 opacity-70",
        !reduceMotion && GHOST_ENTER_CLASS_NAME
      )}
    >
      <CardStack cards={cards} />
    </div>
  )
}

/**
 * 停顿（或键盘拖动）之后展开的落点预览：批次里**每张**名片各占一个格子，用只读的瓦片副本来
 * 渲染，于是「这批名片插到这里之后长什么样」可以直接看出来；也只有这一态下网格高度会变
 * （预期：那就是排版预览）。
 *
 * 每个格子依次淡入（`animation-delay` 按档错峰，最多 `GHOST_ENTER_STAGGER_LIMIT` 档）：
 * 展开是「一格变多格」，一次全冒出来会像是抢了一下。`prefers-reduced-motion` 下直接切换。
 */
export function CardDragGhostSlots({
  cards,
}: {
  cards: readonly FudabaOwnerCard[]
}) {
  const reduceMotion = useMediaQuery(REDUCED_MOTION_QUERY)
  return (
    <>
      {cards.map((card, index) => (
        <div
          key={card.id}
          aria-hidden="true"
          data-testid="card-drag-ghost"
          data-variant="slots"
          data-ghost-count={cards.length}
          className={cn(
            "pointer-events-none min-w-0 opacity-60",
            !reduceMotion && GHOST_ENTER_CLASS_NAME
          )}
          style={
            reduceMotion
              ? undefined
              : { animationDelay: `${ghostEnterDelayMs(index)}ms` }
          }
        >
          <CardTile card={card} preview onSelect={() => {}} />
        </div>
      ))}
    </>
  )
}
