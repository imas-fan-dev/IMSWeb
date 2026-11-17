import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { useRef, type ComponentProps } from "react"

import { useLongPress } from "~/lib/use-long-press"
import { cn } from "~/lib/utils"
import { CardTile } from "../card-tile"

/** 长按钩子要求一个回调；没有入口时给个恒定的空实现（回调存 ref，不会每帧重挂监听）。 */
function noop() {}

/**
 * 可拖拽的瓦片：外面套一层 dnd-kit 节点，瓦片本体（`CardTile`）保持原样。
 *
 * - 拖动资格由调用方决定（只有编辑模式 + 整卡 `published`，§8）；不可拖拽时**不挂**
 *   `attributes`/`listeners`——它们带 `role="button"`，会把瓦片自己的 `role="checkbox"`
 *   语义盖掉，读屏与既有测试都会跟着变。
 * - `setActivatorNodeRef` 挂在外层节点上：键盘激活只在焦点落在这个节点时生效，焦点在
 *   瓦片里的复选框上时，空格就是勾选、不会被劫持成拖拽（`KeyboardSensor` 的 activator 判断）。
 * - `touch-none` 只在可拖拽时加（编辑模式）：dnd-kit 的 `TouchSensor` 要它才不会被页面滚动抢走；
 *   非编辑模式下页面必须照常滚动，那里的长按手势由 `useLongPress` 负责（§7.1）。
 * - 长按只在**非编辑模式**生效：编辑模式里长按瓦片 = 开始拖拽（`TouchSensor` 的 250ms 延迟），
 *   两个手势不叠加（§11）。`enabled` 还要求调用方真的给了回调——不给回调（只读、布局读失败）
 *   时连监听都不挂，长按不会被白白吞掉。
 */
export function SortableCardTile({
  draggable,
  onLongPress,
  ...tile
}: ComponentProps<typeof CardTile> & {
  draggable: boolean
  /** 非编辑模式下长按瓦片（触屏/笔）；不给就是没有这个入口。 */
  onLongPress?: () => void
}) {
  const tileRef = useRef<HTMLDivElement | null>(null)
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: tile.card.id, disabled: !draggable })

  useLongPress({
    targetRef: tileRef,
    enabled: !tile.editing && onLongPress !== undefined,
    onLongPress: onLongPress ?? noop,
  })

  return (
    <div
      ref={(node) => {
        tileRef.current = node
        setNodeRef(node)
        setActivatorNodeRef(node)
      }}
      data-testid="sortable-card-tile"
      // FLIP（`useCardGridFlip`）按卡 id 认「同一张瓦片」：批量拖动时整批会离开列表再回来，
      // 不能靠下标认人。
      data-card-id={tile.card.id}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "min-w-0",
        draggable && "cursor-grab touch-none active:cursor-grabbing",
        // 拖动中的原瓦片留在原位（落点由 dnd-kit 的排序位移让出），压暗以免和 DragOverlay 上的副本抢眼。
        isDragging && "opacity-40"
      )}
      {...(draggable ? attributes : {})}
      {...(draggable ? listeners : {})}
    >
      <CardTile {...tile} />
    </div>
  )
}
