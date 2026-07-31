import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { GripVerticalIcon } from "lucide-react"
import type { ReactNode } from "react"

import { Button } from "~/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "~/components/ui/tooltip"
import { cn } from "~/lib/utils"

type SortableEntity = { id: string }

function SortableRow<Item extends SortableEntity>({
  item,
  label,
  disabled,
  children,
}: {
  item: Item
  label: string
  disabled: boolean
  children: ReactNode
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id, disabled })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "grid grid-cols-[2.5rem_minmax(0,1fr)] items-stretch border-b bg-card last:border-b-0",
        isDragging && "relative shadow-md ring-1 ring-ring/40"
      )}
    >
      <div className="flex items-center justify-center border-r bg-muted/25">
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                disabled={disabled}
                aria-label={`拖动排序：${label}`}
                {...attributes}
                {...listeners}
              >
                <GripVerticalIcon />
              </Button>
            }
          />
          <TooltipContent>拖动排序</TooltipContent>
        </Tooltip>
      </div>
      <div className="min-w-0 px-4">{children}</div>
    </div>
  )
}

export function SortableList<Item extends SortableEntity>({
  items,
  disabled = false,
  getLabel,
  renderItem,
  onReorder,
  className,
}: {
  items: Item[]
  disabled?: boolean
  getLabel: (item: Item) => string
  renderItem: (item: Item) => ReactNode
  onReorder: (items: Item[]) => void
  className?: string
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  function dragEnded(event: DragEndEvent) {
    if (!event.over || event.active.id === event.over.id) return
    const from = items.findIndex((item) => item.id === event.active.id)
    const to = items.findIndex((item) => item.id === event.over?.id)
    if (from < 0 || to < 0) return
    onReorder(arrayMove(items, from, to))
  }

  return (
    <TooltipProvider>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={dragEnded}
      >
        <SortableContext
          items={items.map((item) => item.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className={cn("border-y", className)}>
            {items.map((item) => (
              <SortableRow
                key={item.id}
                item={item}
                label={getLabel(item)}
                disabled={disabled}
              >
                {renderItem(item)}
              </SortableRow>
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </TooltipProvider>
  )
}
