import { useDroppable } from "@dnd-kit/core"
import { SortableContext, rectSortingStrategy } from "@dnd-kit/sortable"

import { Badge } from "~/components/ui/badge"
import { cn } from "~/lib/utils"
import type { TierListActions } from "../hooks/use-tier-list-state"
import type { TierItem } from "../tier-list-model"
import { SortableTierItemCard } from "./tier-item-card"

export const POOL_CONTAINER_ID = "pool"

export function UnrankedPool({
  itemIds,
  items,
  actions,
}: {
  itemIds: string[]
  items: Record<string, TierItem>
  actions: TierListActions
}) {
  const { isOver, setNodeRef } = useDroppable({ id: POOL_CONTAINER_ID })

  return (
    <div
      ref={setNodeRef}
      className="sticky bottom-2 z-20 mt-5 flex items-center gap-2 rounded-xl border-2 border-dashed bg-background/95 p-2 shadow-sm backdrop-blur supports-backdrop-filter:bg-background/80 md:static md:block md:bg-transparent md:p-3 md:shadow-none md:backdrop-blur-none"
      data-testid="unranked-pool"
    >
      <div className="flex shrink-0 items-center gap-2 px-1 md:mb-2">
        <span className="text-sm font-semibold">未分类</span>
        <Badge variant="secondary">{itemIds.length}</Badge>
        <span className="ml-auto hidden text-xs text-muted-foreground sm:block">
          上传图片后，拖拽到头像框内进行分级
        </span>
      </div>
      <div
        className={cn(
          "min-w-0 flex-1 rounded-lg transition-shadow",
          isOver && "bg-primary/5 ring-2 ring-primary"
        )}
      >
        <SortableContext items={itemIds} strategy={rectSortingStrategy}>
          <div className="flex min-h-16 flex-nowrap gap-2 overflow-x-auto p-2 md:min-h-24 md:flex-wrap md:content-start md:overflow-x-visible">
            {itemIds.map((id) => {
              const item = items[id]
              return item ? (
                <SortableTierItemCard
                  key={id}
                  item={item}
                  onRemove={() => actions.removeItem(id)}
                />
              ) : null
            })}
            {itemIds.length === 0 ? (
              <p className="flex min-w-full items-center justify-center py-4 text-xs text-muted-foreground/70 md:py-7">
                暂无图片 —— 点击上方「导入图片」开始
              </p>
            ) : null}
          </div>
        </SortableContext>
      </div>
    </div>
  )
}
