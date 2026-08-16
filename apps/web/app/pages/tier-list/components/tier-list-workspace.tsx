import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  pointerWithin,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core"
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable"
import { useState } from "react"

import { findItemContainer } from "../tier-list-model"
import { useTierListState } from "../hooks/use-tier-list-state"
import { ImportDialog } from "./import-dialog"
import { TierItemCardView } from "./tier-item-card"
import { TierRow } from "./tier-row"
import { TierListToolbar } from "./toolbar"
import { POOL_CONTAINER_ID, UnrankedPool } from "./unranked-pool"

function isContainerId(id: string) {
  return id === POOL_CONTAINER_ID || id.startsWith("row:")
}

function containerTierId(containerId: string) {
  return containerId.startsWith("row:") ? containerId.slice(4) : null
}

export function TierListWorkspace() {
  const { document, ...actions } = useTierListState()
  const [importOpen, setImportOpen] = useState(false)
  const [activeItemId, setActiveItemId] = useState<string | null>(null)
  const activeItem = activeItemId ? document.items[activeItemId] : null

  const collisionDetection = (args: Parameters<typeof closestCenter>[0]) => {
    const pointerHits = pointerWithin(args)
    return pointerHits.length > 0 ? pointerHits : closestCenter(args)
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  function resolveDropTarget(
    overId: string
  ): { container: string; index: number } | null {
    if (isContainerId(overId)) {
      const container = containerTierId(overId) ?? POOL_CONTAINER_ID
      const list =
        container === POOL_CONTAINER_ID
          ? document.pool
          : (document.rows[container] ?? [])
      return { container, index: list.length }
    }
    const current = findItemContainer(document, overId)
    return current
      ? { container: current.container, index: current.index }
      : null
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveItemId(String(event.active.id))
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const activeId = String(active.id)
    const activeContainer = findItemContainer(document, activeId)?.container
    if (activeContainer === undefined) return
    const target = resolveDropTarget(String(over.id))
    if (!target || target.container === activeContainer) return
    actions.moveItem(activeId, target.container, target.index)
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    setActiveItemId(null)
    if (!over || active.id === over.id) return
    const target = resolveDropTarget(String(over.id))
    if (!target) return
    actions.moveItem(String(active.id), target.container, target.index)
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-4 pt-5 pb-20 sm:px-6 sm:pt-6 lg:px-8">
      <TierListToolbar
        document={document}
        actions={actions}
        onOpenImport={() => setImportOpen(true)}
      />

      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="space-y-3" data-testid="tier-list-board">
          {document.tiers.map((tier, index) => (
            <TierRow
              key={tier.id}
              tier={tier}
              itemIds={document.rows[tier.id] ?? []}
              items={document.items}
              canMoveUp={index > 0}
              canMoveDown={index < document.tiers.length - 1}
              actions={actions}
            />
          ))}
        </div>
        <UnrankedPool
          itemIds={document.pool}
          items={document.items}
          actions={actions}
        />
        <DragOverlay>
          {activeItem ? (
            <div className="cursor-grabbing drop-shadow-xl">
              <TierItemCardView item={activeItem} overlay />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <ImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        existingItems={document.items}
        onAddItems={actions.addItems}
      />
    </div>
  )
}
