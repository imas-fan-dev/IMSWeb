import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import type { ComponentProps } from "react"

import { cn } from "~/lib/utils"
import { CardTile } from "../card-tile"

/**
 * 可拖拽的瓦片：外面套一层 dnd-kit 节点，瓦片本体（`CardTile`）保持原样。
 *
 * - 拖动资格由调用方决定（只有编辑模式 + 整卡 `published`，§8）；不可拖拽时**不挂**
 *   `attributes`/`listeners`——它们带 `role="button"`，会把瓦片自己的 `role="checkbox"`
 *   语义盖掉，读屏与既有测试都会跟着变。
 * - `setActivatorNodeRef` 挂在外层节点上：键盘激活只在焦点落在这个节点时生效，焦点在
 *   瓦片里的复选框上时，空格就是勾选、不会被劫持成拖拽（`KeyboardSensor` 的 activator 判断）。
 * - `touch-none` 只在可拖拽时加：dnd-kit 的指针传感器需要它，但它在非编辑模式下会白白
 *   吃掉页面的触摸滚动（移动端长按进编辑是后续切片的事）。
 */
export function SortableCardTile({
  draggable,
  ...tile
}: ComponentProps<typeof CardTile> & { draggable: boolean }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: tile.card.id, disabled: !draggable })

  return (
    <div
      ref={(node) => {
        setNodeRef(node)
        setActivatorNodeRef(node)
      }}
      data-testid="sortable-card-tile"
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "min-w-0",
        draggable && "cursor-grab touch-none active:cursor-grabbing",
        // 拖动中的原瓦片留在原位（落点由 ghost 表示），压暗以免和 DragOverlay 上的副本抢眼。
        isDragging && "opacity-40"
      )}
      {...(draggable ? attributes : {})}
      {...(draggable ? listeners : {})}
    >
      <CardTile {...tile} />
    </div>
  )
}
