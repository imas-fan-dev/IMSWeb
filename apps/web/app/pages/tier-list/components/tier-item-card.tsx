import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { XIcon } from "lucide-react"

import { cn } from "~/lib/utils"
import type { TierItem } from "../tier-list-model"

export function TierItemCardView({
  item,
  overlay = false,
  onRemove,
}: {
  item: TierItem
  overlay?: boolean
  onRemove?: () => void
}) {
  return (
    <div
      className={cn(
        "relative size-16 shrink-0",
        overlay && "scale-110 rotate-2"
      )}
    >
      <img
        src={item.src}
        alt={item.label}
        draggable={false}
        loading="lazy"
        decoding="async"
        fetchPriority="low"
        className="block size-16 rounded-lg object-cover ring-1 ring-black/15 dark:ring-white/20"
      />
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          onPointerDown={(event) => event.stopPropagation()}
          aria-label={`移除 ${item.label}`}
          className="absolute -top-1.5 -right-1.5 flex size-5 cursor-pointer items-center justify-center rounded-full bg-foreground text-background opacity-100 shadow-sm transition-opacity hover:bg-destructive hover:text-destructive-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100"
        >
          <XIcon aria-hidden="true" className="size-3" />
        </button>
      ) : null}
    </div>
  )
}

export function SortableTierItemCard({
  item,
  onRemove,
}: {
  item: TierItem
  onRemove: () => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id })

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      tabIndex={0}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "group relative size-16 shrink-0 cursor-grab touch-none rounded-lg focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none active:cursor-grabbing",
        isDragging && "opacity-30"
      )}
      data-testid="tier-item-card"
    >
      <TierItemCardView item={item} onRemove={onRemove} />
    </div>
  )
}
