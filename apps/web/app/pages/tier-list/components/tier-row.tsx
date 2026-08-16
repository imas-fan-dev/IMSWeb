import { useDroppable } from "@dnd-kit/core"
import { SortableContext, rectSortingStrategy } from "@dnd-kit/sortable"

import { cn } from "~/lib/utils"
import type { TierListActions } from "../hooks/use-tier-list-state"
import type { Tier, TierItem } from "../tier-list-model"
import { SortableTierItemCard } from "./tier-item-card"
import { TierLabelEditor } from "./tier-label-editor"

export function tierContainerId(tierId: string) {
  return `row:${tierId}`
}

export function TierRow({
  tier,
  itemIds,
  items,
  canMoveUp,
  canMoveDown,
  actions,
}: {
  tier: Tier
  itemIds: string[]
  items: Record<string, TierItem>
  canMoveUp: boolean
  canMoveDown: boolean
  actions: TierListActions
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: tierContainerId(tier.id),
  })

  return (
    <div
      ref={setNodeRef}
      className="flex min-h-24 items-stretch gap-2"
      data-testid="tier-row"
    >
      <TierLabelEditor
        tier={tier}
        canMoveUp={canMoveUp}
        canMoveDown={canMoveDown}
        actions={actions}
      />
      <div
        className={cn(
          "min-w-0 flex-1 rounded-lg ring-1 transition-shadow",
          isOver
            ? "bg-primary/5 ring-2 ring-primary"
            : "bg-muted/40 ring-foreground/5"
        )}
      >
        <SortableContext items={itemIds} strategy={rectSortingStrategy}>
          <div className="flex min-h-24 flex-wrap content-start gap-2 p-2.5">
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
              <p className="flex w-full items-center justify-center rounded-md border border-dashed py-7 text-xs text-muted-foreground/70">
                拖拽头像到这里
              </p>
            ) : null}
          </div>
        </SortableContext>
      </div>
    </div>
  )
}
