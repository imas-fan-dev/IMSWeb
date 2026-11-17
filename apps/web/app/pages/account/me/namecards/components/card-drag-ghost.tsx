import type { FudabaOwnerCard } from "~/lib/api"
import { CardTile } from "../card-tile"
import { CardStack } from "./card-drag-layer"

/**
 * 未展开时的「合集 ghost」：占**一个**格子，内容就是这批名片叠成的一摞（`CardStack`——
 * 真实缩略图、第一张在最上面、带旋转、超过 3 张时 `+N`），和指针上拿起的那一摞同一套视觉。
 *
 * 整块只是落点预览：`pointer-events-none` + 外层 `aria-hidden`（读屏播报走 `aria-live`），
 * `opacity-70` 让它和真瓦片能区分开。
 */
export function CardDragGhostStack({
  cards,
}: {
  cards: readonly FudabaOwnerCard[]
}) {
  return (
    <div
      aria-hidden="true"
      data-testid="card-drag-ghost"
      data-variant="stack"
      data-ghost-count={cards.length}
      className="pointer-events-none relative min-w-0 opacity-70"
    >
      <CardStack cards={cards} />
    </div>
  )
}

/**
 * 停顿（或键盘拖动）之后展开的落点预览：批次里**每张**名片各占一个格子，用只读的瓦片副本来
 * 渲染，于是「这批名片插到这里之后长什么样」可以直接看出来；也只有这一态下网格高度会变
 * （预期：那就是排版预览）。
 */
export function CardDragGhostSlots({
  cards,
}: {
  cards: readonly FudabaOwnerCard[]
}) {
  return (
    <>
      {cards.map((card) => (
        <div
          key={card.id}
          aria-hidden="true"
          data-testid="card-drag-ghost"
          data-variant="slots"
          data-ghost-count={cards.length}
          className="pointer-events-none min-w-0 opacity-60"
        >
          <CardTile card={card} preview onSelect={() => {}} />
        </div>
      ))}
    </>
  )
}
