import { useDndContext } from "@dnd-kit/core"

import type { FudabaOwnerCard } from "~/lib/api"
import { cn } from "~/lib/utils"
import { CardTile } from "../card-tile"

/** 堆叠里最多露出几张瓦片，其余用 `+N` 表示（§7.3）。 */
const STACK_VISIBLE_LIMIT = 3

/** 堆叠里每张瓦片的轻微旋转，第一张是「正主」。 */
const STACK_ROTATIONS = [-4, 2, -1]

/**
 * `DragOverlay` 的内容：单张就是一张瓦片；多选时叠成一摞（最多 3 张可见 + `+N`）。
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
  const visible = cards.slice(0, STACK_VISIBLE_LIMIT)
  const hiddenCount = cards.length - visible.length
  return (
    <div
      aria-hidden="true"
      data-testid="card-drag-layer"
      className="pointer-events-none relative drop-shadow-xl"
      style={{ width: activeNodeRect?.width ?? undefined }}
    >
      {visible.map((card, index) => (
        <div
          key={card.id}
          className={cn("min-w-0", index > 0 && "absolute inset-0")}
          style={{ transform: `rotate(${STACK_ROTATIONS[index] ?? 0}deg)` }}
        >
          <CardTile card={card} onSelect={() => {}} />
        </div>
      ))}
      {hiddenCount > 0 ? (
        <span className="absolute -right-2 -bottom-2 z-10 inline-flex min-w-6 items-center justify-center rounded-full bg-foreground px-1.5 py-0.5 text-xs font-medium text-background">
          {`+${hiddenCount}`}
        </span>
      ) : null}
    </div>
  )
}
