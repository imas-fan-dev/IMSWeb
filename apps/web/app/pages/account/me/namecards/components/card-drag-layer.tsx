import { useDndContext } from "@dnd-kit/core"

import type { FudabaOwnerCard } from "~/lib/api"
import { cn } from "~/lib/utils"
import { CardTile } from "../card-tile"

/** 堆叠里最多露出几张瓦片，其余用 `+N` 表示（§7.3）。 */
const STACK_VISIBLE_LIMIT = 3

/** 堆叠里每张瓦片的轻微旋转，第一张是「正主」。 */
const STACK_ROTATIONS = [-4, 2, -1]

/**
 * 一摞名片：**第一张在最上面**（index 0 的 `z-index` 最高），后面的依次轻微旋转、压在前面
 * 那张下面；超过 `STACK_VISIBLE_LIMIT` 张时右下角显示**这一摞的总张数**（露不下的部分不再
 * 用 `+N` 表达，直接报数更好认）。
 *
 * `DragOverlay`（指针上那一摞）与落点 ghost（要插进列表的那一摞）共用这一套视觉，
 * 所以用户拿起什么、就看见什么要落下。瓦片是 `preview` 副本：不写 `view-transition-name`、
 * 不可交互；整块由调用方对读屏隐藏。
 */
export function CardStack({ cards }: { cards: readonly FudabaOwnerCard[] }) {
  const visible = cards.slice(0, STACK_VISIBLE_LIMIT)
  const hiddenCount = cards.length - visible.length
  return (
    <>
      {visible.map((card, index) => (
        <div
          key={card.id}
          className={cn(
            "min-w-0",
            index === 0 ? "relative" : "absolute inset-0"
          )}
          style={{
            zIndex: visible.length - index,
            transform: `rotate(${STACK_ROTATIONS[index] ?? 0}deg)`,
          }}
        >
          <CardTile card={card} preview onSelect={() => {}} />
        </div>
      ))}
      {hiddenCount > 0 ? (
        <span
          data-testid="card-drag-count"
          className="absolute -right-2 -bottom-2 z-10 inline-flex min-w-6 items-center justify-center rounded-full bg-foreground px-1.5 py-0.5 text-xs font-medium text-background"
        >
          {cards.length}
        </span>
      ) : null}
    </>
  )
}

/**
 * `DragOverlay` 的内容：单张就是一张瓦片；多选时叠成一摞（`CardStack`）。
 *
 * 它只是视觉副本——真实落位由落点决定，所以整块对读屏隐藏（拖拽播报走 `aria-live`）、
 * 也不接收指针事件。宽度取当前被抓起瓦片的宽度，堆叠才和原瓦片一样大。
 */
export function CardDragLayer({
  cards,
}: {
  cards: readonly FudabaOwnerCard[]
}) {
  const { activeNodeRect } = useDndContext()
  return (
    <div
      aria-hidden="true"
      data-testid="card-drag-layer"
      className="pointer-events-none relative drop-shadow-xl"
      style={{ width: activeNodeRect?.width ?? undefined }}
    >
      <CardStack cards={cards} />
    </div>
  )
}
